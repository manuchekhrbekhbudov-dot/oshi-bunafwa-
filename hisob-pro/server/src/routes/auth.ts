import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  hashToken,
  passwordPolicy,
  randomToken,
  setSessionCookie,
  verifyPassword,
} from '../services/auth.js';
import { createUserDefaults } from '../services/defaults.js';
import { sendMail } from '../services/mail.js';
import { currencySchema } from '../lib/validators.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: config.env === 'test' ? 10_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Дархостҳо зиёд. Каме дертар кӯшиш кунед' } },
});

const passwordSchema = z
  .string()
  .max(128, 'Парол хеле дароз аст')
  .refine(passwordPolicy, 'Парол бояд ҳадди ақал 8 аломат, ҳарф ва рақам дошта бошад');

const emailSchema = z.string().trim().toLowerCase().email('Email нодуруст').max(200);

const publicUser = {
  id: true,
  email: true,
  name: true,
  language: true,
  baseCurrency: true,
  createdAt: true,
} as const;

// Hash барои муқоисаи "бекора" — то вақти ҷавоб нишон надиҳад, ки email вуҷуд дорад ё не
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken()));

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2, 'Ном ҳадди ақал 2 аломат').max(100),
        email: emailSchema,
        password: passwordSchema,
        language: z.enum(['tg', 'ru']).optional(),
      }),
      req.body,
    );
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw conflict('EMAIL_TAKEN', 'Ин email аллакай сабт шудааст');

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { name: body.name, email: body.email, passwordHash, language: body.language ?? 'tg' },
        select: publicUser,
      });
      await createUserDefaults(tx, u.id);
      return u;
    });
    const s = await createSession(user.id, { userAgent: req.get('user-agent'), ip: req.ip });
    setSessionCookie(res, s.token, s.expiresAt);
    res.status(201).json({ user });
  }),
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ email: emailSchema, password: z.string().min(1).max(128) }), req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const ok = await verifyPassword(body.password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !ok) throw unauthorized('Email ё парол нодуруст аст');
    const s = await createSession(user.id, { userAgent: req.get('user-agent'), ip: req.ip });
    setSessionCookie(res, s.token, s.expiresAt);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        language: user.language,
        baseCurrency: user.baseCurrency,
        createdAt: user.createdAt,
      },
    });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[config.sessionCookie];
    if (typeof token === 'string') {
      await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

router.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = randomToken();
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
      });
      const link = `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await sendMail(
        user.email,
        'HISOB PRO — барқарорсозии парол / восстановление пароля',
        `Салом, ${user.name}!\n\nБарои гузоштани пароли нав ба ин линк гузаред (1 соат эътибор дорад):\n${link}\n\nАгар шумо дархост накарда бошед, ин паёмро нодида гиред.`,
      );
    }
    // Ҳамеша ҳамон ҷавоб — то маълум нашавад, ки email сабт шудааст ё не
    res.json({ ok: true });
  }),
);

router.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ token: z.string().min(10).max(200), password: passwordSchema }), req.body);
    const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(body.token) } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      throw badRequest('INVALID_TOKEN', 'Линк нодуруст ё муҳлаташ гузаштааст');
    }
    const passwordHash = await hashPassword(body.password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
      prisma.session.deleteMany({ where: { userId: rec.userId } }),
    ]);
    res.json({ ok: true });
  }),
);

/* ---------------- Маршрутҳои ҳифзшуда ---------------- */

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: uid(req) }, select: publicUser });
    if (!user) throw unauthorized();
    res.json({ user });
  }),
);

router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(100).optional(),
        language: z.enum(['tg', 'ru']).optional(),
        baseCurrency: currencySchema.optional(),
      }),
      req.body,
    );
    const user = await prisma.user.update({ where: { id: uid(req) }, data: body, select: publicUser });
    // Қурби асъори асосӣ ба худаш маъно надорад
    if (body.baseCurrency) {
      await prisma.exchangeRate.deleteMany({ where: { userId: user.id, currency: body.baseCurrency } });
    }
    res.json({ user });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }),
      req.body,
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { id: uid(req) } });
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw badRequest('WRONG_PASSWORD', 'Пароли ҷорӣ нодуруст аст', {
        fields: { currentPassword: 'Пароли ҷорӣ нодуруст аст' },
      });
    }
    const passwordHash = await hashPassword(body.newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      // Ҳамаи сессияҳои дигар бекор мешаванд
      prisma.session.deleteMany({ where: { userId: user.id, NOT: { id: req.sessionId } } }),
    ]);
    res.json({ ok: true });
  }),
);

router.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.session.deleteMany({ where: { userId: uid(req) } });
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

export default router;
