import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { HttpError, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { todayKey } from '../lib/dates.js';
import { money } from '../lib/money.js';
import {
  botUsername,
  computeDay,
  createLinkCode,
  handleUpdate,
  sendDailySummaries,
  telegramEnabled,
  webhookSecret,
} from '../services/telegram/bot.js';

const router = Router();

/** Telegram → сервер. Танҳо бо header-и махфӣ қабул мешавад. */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    if (!telegramEnabled() || req.get('x-telegram-bot-api-secret-token') !== webhookSecret()) {
      return res.status(401).json({ ok: false });
    }
    try {
      await handleUpdate(req.body);
    } catch (e) {
      console.error('[telegram] update failed', e);
    }
    res.json({ ok: true }); // ҳамеша 200 — то Telegram ҳамон паёмро бепоён такрор накунад
  }),
);

/**
 * Ҳисоботи ҳаррӯза. GitHub Actions ҳар бегоҳ инро даъват мекунад (сервери ройгон "хоб" мекунад).
 * Бехатар: пеш аз 21:00 ҳеҷ чиз намефиристад ва ба ҳар корбар танҳо як бор дар рӯз.
 */
router.all(
  '/tick',
  asyncHandler(async (_req, res) => {
    res.json(await sendDailySummaries());
  }),
);

/* ---------------- Танзимоти бот дар сайт (танҳо барои корбари воридшуда) ---------------- */

router.get(
  '/settings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const enabled = telegramEnabled();
    const link = await prisma.telegramLink.findUnique({ where: { userId } });
    const day = link ? await computeDay(userId, todayKey()) : null;
    res.json({
      enabled,
      botUsername: enabled ? await botUsername() : null,
      linked: !!link,
      username: link?.username ?? null,
      onboarding: link ? link.step !== 'done' : false,
      notifyDaily: link?.notifyDaily ?? true,
      dailyLimit: link?.dailyLimit ? money(link.dailyLimit) : null,
      monthlyIncome: link?.monthlyIncome ? money(link.monthlyIncome) : null,
      incomeSource: link?.incomeSource ?? null,
      effectiveLimit: day?.limit ?? null,
    });
  }),
);

router.post(
  '/link',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!telegramEnabled()) {
      throw new HttpError(503, 'TELEGRAM_DISABLED', 'Telegram-бот танзим нашудааст (TELEGRAM_BOT_TOKEN)');
    }
    const name = await botUsername();
    if (!name) throw new HttpError(502, 'TELEGRAM_UNAVAILABLE', 'Бо Telegram пайваст нашуд. Токенро санҷед');
    const code = await createLinkCode(uid(req));
    res.json({ url: `https://t.me/${name}?start=${code}`, expiresInMinutes: 15 });
  }),
);

const amountOrNull = z
  .union([z.string(), z.number(), z.null()])
  .transform((v, ctx) => {
    if (v === null || v === '') return null;
    const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(s) || Number(s) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Маблағи нодуруст' });
      return z.NEVER;
    }
    return s;
  });

router.patch(
  '/settings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        notifyDaily: z.boolean().optional(),
        dailyLimit: amountOrNull.optional(),
        monthlyIncome: amountOrNull.optional(),
      }),
      req.body,
    );
    const link = await prisma.telegramLink.findUnique({ where: { userId: uid(req) } });
    if (!link) throw notFound('Telegram пайваст нашудааст');
    await prisma.telegramLink.update({
      where: { id: link.id },
      data: { ...body, ...(body.dailyLimit !== undefined ? { lastAlertDay: null } : {}) },
    });
    res.json({ ok: true });
  }),
);

router.delete(
  '/link',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.telegramLink.deleteMany({ where: { userId: uid(req) } });
    res.json({ ok: true });
  }),
);

export default router;
