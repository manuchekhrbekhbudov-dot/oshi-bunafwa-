import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { badRequest, conflict, HttpError, unauthorized } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { config, registrationMode } from '../config.js';
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
import { codeHash, issueResetCode, RESET_CODE_MAX_ATTEMPTS, RESET_CODE_TTL_MIN } from '../services/passwordReset.js';
import { sendMail } from '../services/mail.js';
import { currencySchema } from '../lib/validators.js';
import {
  createPendingRegistration,
  findPendingByPollToken,
  normalizePhone,
  ownerId,
  PENDING_TTL_MIN,
  registrationPolicy,
  setSetting,
  getSetting,
} from '../services/registration.js';
import { botUsername, send } from '../services/telegram/transport.js';
import { T } from '../services/telegram/insights.js';

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
const nameSchema = z.string().trim().min(2, 'Ном ҳадди ақал 2 аломат').max(100);

const publicUser = {
  id: true,
  email: true,
  phone: true,
  name: true,
  language: true,
  baseCurrency: true,
  createdAt: true,
} as const;

// Hash барои муқоисаи "бекора" — то вақти ҷавоб нишон надиҳад, ки корбар вуҷуд дорад ё не
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken()));

const registrationClosed = () =>
  new HttpError(403, 'REGISTRATION_CLOSED', 'Сабти ном пӯшида аст. Ин платформаи шахсӣ аст.');
const telegramRequired = () =>
  new HttpError(403, 'TELEGRAM_REQUIRED', 'Сабти ном танҳо тавассути рақами Telegram мумкин аст.');

/** Email ё рақами телефон → корбар */
async function findUserByLogin(login: string) {
  const v = login.trim().toLowerCase();
  if (v.includes('@')) return prisma.user.findUnique({ where: { email: v } });
  const phone = normalizePhone(v);
  return phone ? prisma.user.findUnique({ where: { phone } }) : null;
}

/** Кадом роҳҳои сабти ном ҳоло кушодаанд (барои интерфейс) */
router.get(
  '/registration',
  asyncHandler(async (_req, res) => {
    const policy = await registrationPolicy();
    res.json({
      open: policy.email || policy.telegram,
      email: policy.email,
      telegram: policy.telegram,
      botUsername: await botUsername(), // барои маслиҳати «/code» ҳамеша лозим аст
    });
  }),
);

/** Сабти ном бо email — танҳо корбари аввал (соҳиб) ё дар реҷаи open */
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const policy = await registrationPolicy();
    if (!policy.email) throw policy.telegram ? telegramRequired() : registrationClosed();
    const body = parse(
      z.object({ name: nameSchema, email: emailSchema, password: passwordSchema, language: z.enum(['tg', 'ru']).optional() }),
      req.body,
    );
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.$transaction(async (tx) => {
      if (registrationMode() === 'first-user') {
        // Қулф: ду дархости ҳамзамон наметавонанд ҳарду "аввалин" шаванд
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724001)`;
        if ((await tx.user.count()) > 0) throw telegramRequired();
      }
      const exists = await tx.user.findUnique({ where: { email: body.email } });
      if (exists) throw conflict('EMAIL_TAKEN', 'Ин email аллакай сабт шудааст');
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

/** Оғози сабти ном тавассути Telegram: ном + парол (+ email ихтиёрӣ) → линки бот */
router.post(
  '/register/telegram',
  authLimiter,
  asyncHandler(async (req, res) => {
    const policy = await registrationPolicy();
    if (!policy.telegram) throw registrationClosed();
    const body = parse(
      z.object({
        name: nameSchema,
        email: z.union([emailSchema, z.literal(''), z.null()]).optional(),
        password: passwordSchema,
        language: z.enum(['tg', 'ru']).optional(),
      }),
      req.body,
    );
    const email = body.email || null;
    if (email && (await prisma.user.findUnique({ where: { email }, select: { id: true } }))) {
      throw conflict('EMAIL_TAKEN', 'Ин email аллакай сабт шудааст');
    }
    const bot = await botUsername();
    if (!bot) throw new HttpError(502, 'TELEGRAM_UNAVAILABLE', 'Бо Telegram пайваст нашуд. Баъдтар кӯшиш кунед');
    const { code, pollToken } = await createPendingRegistration({
      name: body.name,
      email,
      passwordHash: await hashPassword(body.password),
      language: body.language ?? 'tg',
    });
    res.status(201).json({ url: `https://t.me/${bot}?start=reg_${code}`, pollToken, expiresInMinutes: PENDING_TTL_MIN });
  }),
);

/** Браузер ҳар 2 сония месанҷад: оё рақам дар Telegram тасдиқ шуд? */
router.get(
  '/register/telegram/status',
  asyncHandler(async (req, res) => {
    const token = parse(z.string().min(10).max(200), req.query.token);
    const p = await findPendingByPollToken(token);
    if (!p || (p.expiresAt < new Date() && !p.completedUserId)) return res.status(410).json({ status: 'expired' });
    if (p.error) return res.json({ status: 'error', code: p.error });
    if (!p.completedUserId) return res.json({ status: 'waiting', chatOpened: !!p.chatId });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: p.completedUserId }, select: publicUser });
    // Токен як маротиба — сессия танҳо барои ҳамон браузере, ки сабти номро оғоз кард
    await prisma.pendingRegistration.delete({ where: { id: p.id } });
    const s = await createSession(user.id, { userAgent: req.get('user-agent'), ip: req.ip });
    setSessionCookie(res, s.token, s.expiresAt);
    res.json({ status: 'done', user });
  }),
);

/** Воридшавӣ: email ё рақами телефон + парол */
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z
        .object({ login: z.string().trim().max(200).optional(), email: z.string().trim().max(200).optional(), password: z.string().min(1).max(128) })
        .refine((b) => !!(b.login || b.email), { message: 'Email ё рақамро ворид кунед', path: ['login'] }),
      req.body,
    );
    const user = await findUserByLogin((body.login || body.email)!);
    const ok = await verifyPassword(body.password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !ok) throw unauthorized('Рақам/email ё парол нодуруст аст');
    const s = await createSession(user.id, { userAgent: req.get('user-agent'), ip: req.ip });
    setSessionCookie(res, s.token, s.expiresAt);
    const { passwordHash: _ph, telegramUserId: _tg, updatedAt: _u, ...rest } = user;
    void _ph;
    void _tg;
    void _u;
    res.json({ user: rest });
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

/** Фаромӯш кардани парол: линк ба Telegram (агар пайваст бошад), вагарна ба email */
router.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z
        .object({ login: z.string().trim().max(200).optional(), email: z.string().trim().max(200).optional() })
        .refine((b) => !!(b.login || b.email), { message: 'Email ё рақамро ворид кунед', path: ['login'] }),
      req.body,
    );
    const user = await findUserByLogin((body.login || body.email)!);
    if (user) {
      // Коди 6-рақама (15 дақиқа) — дар Telegram ё email; линк лозим нест
      const code = await issueResetCode(user.id);
      let sent = false;
      const tg = await prisma.telegramLink.findUnique({ where: { userId: user.id }, select: { chatId: true } });
      if (tg) {
        await send(tg.chatId, T[user.language].resetCode(code, RESET_CODE_TTL_MIN)).then(
          () => (sent = true),
          (e) => console.error('[auth] reset via telegram failed', e),
        );
      }
      if (!sent && user.email) {
        await sendMail(
          user.email,
          'HISOB PRO — коди барқарорсозӣ / код восстановления',
          `Салом, ${user.name}!\n\nКоди барқарорсозии парол: ${code}\n(${RESET_CODE_TTL_MIN} дақиқа эътибор дорад)\n\nАгар шумо дархост накарда бошед, ин паёмро нодида гиред.`,
        );
      }
    }
    // Ҳамеша ҳамон ҷавоб — то маълум нашавад, ки корбар вуҷуд дорад ё не
    res.json({ ok: true });
  }),
);

router.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.union([
        // нав: рақам/email + коди 6-рақама аз Telegram
        z.object({ login: z.string().trim().min(1).max(200), code: z.string().trim().regex(/^\d{6}$/, 'Код — 6 рақам'), password: passwordSchema }),
        // кӯҳна: линк бо token (барои паёмҳои пештар фиристодашуда)
        z.object({ token: z.string().min(10).max(200), password: passwordSchema }),
      ]),
      req.body,
    );
    let rec;
    if ('code' in body) {
      const user = await findUserByLogin(body.login);
      rec = user
        ? await prisma.passwordResetToken.findFirst({
            where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
          })
        : null;
      if (!rec) throw badRequest('INVALID_CODE', 'Код нодуруст ё муҳлаташ гузаштааст. Коди навро гиред.');
      if (rec.tokenHash !== codeHash(rec.userId, body.code)) {
        // 5 кӯшиши нодуруст → код бекор мешавад (ҳимоя аз тахмин)
        const attempts = rec.attempts + 1;
        await prisma.passwordResetToken.update({
          where: { id: rec.id },
          data: { attempts, ...(attempts >= RESET_CODE_MAX_ATTEMPTS ? { usedAt: new Date() } : {}) },
        });
        throw badRequest('INVALID_CODE', attempts >= RESET_CODE_MAX_ATTEMPTS ? 'Код бекор шуд. Коди навро гиред.' : 'Код нодуруст аст');
      }
    } else {
      rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(body.token) } });
      if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
        throw badRequest('INVALID_TOKEN', 'Линк нодуруст ё муҳлаташ гузаштааст');
      }
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
    res.json({ user: { ...user, isOwner: (await ownerId()) === user.id } });
  }),
);

/** Соҳиби платформа сабти номи дигаронро идора мекунад: тавассути Telegram ё пӯшида */
router.get(
  '/registration-settings',
  requireAuth,
  asyncHandler(async (req, res) => {
    if ((await ownerId()) !== uid(req)) throw new HttpError(403, 'FORBIDDEN', 'Танҳо соҳиби платформа');
    res.json({ registration: (await getSetting('registration')) ?? 'telegram', policy: await registrationPolicy() });
  }),
);

router.put(
  '/registration-settings',
  requireAuth,
  asyncHandler(async (req, res) => {
    if ((await ownerId()) !== uid(req)) throw new HttpError(403, 'FORBIDDEN', 'Танҳо соҳиби платформа');
    const { registration } = parse(z.object({ registration: z.enum(['telegram', 'closed']) }), req.body);
    await setSetting('registration', registration);
    res.json({ registration, policy: await registrationPolicy() });
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
