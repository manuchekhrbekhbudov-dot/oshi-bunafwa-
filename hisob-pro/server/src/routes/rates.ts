import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { CURRENCIES, Decimal, money } from '../lib/money.js';
import { badRequest } from '../lib/errors.js';
import { applyRatesToUser, latestRates, updateAutoRates } from '../services/rates.js';

const router = Router();

async function ratesPayload(userId: string) {
  const [user, rates, latest] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true, autoRates: true } }),
    prisma.exchangeRate.findMany({ where: { userId } }),
    latestRates(),
  ]);
  return {
    base: user.baseCurrency,
    autoRates: user.autoRates,
    // охирин қурби худкор: манбаъ (nbt — Бонки миллӣ) ва сана
    auto: latest ? { source: latest.source, date: latest.date } : null,
    rates: rates.map((r) => ({ currency: r.currency, rate: r.rate.toFixed(6), source: r.source, updatedAt: r.updatedAt })),
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await ratesPayload(uid(req)));
  }),
);

/** Қурби худкор: фаъол/хомӯш. Ҳангоми фаъол кардан қурбҳо фавран гузошта мешаванд. */
router.put(
  '/auto',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
    const user = await prisma.user.update({ where: { id: userId }, data: { autoRates: enabled }, select: { baseCurrency: true } });
    if (enabled) {
      const latest = (await latestRates()) ?? (await updateAutoRates({ force: true }).then((r) => ('rates' in r ? r.rates : null)));
      if (latest) await applyRatesToUser(userId, user.baseCurrency, latest);
    }
    res.json(await ratesPayload(userId));
  }),
);

/** «Навсозӣ»: қурбҳои имрӯзаро аз нав мегирад */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    try {
      await updateAutoRates({ force: true });
    } catch (e) {
      throw badRequest('RATES_UNAVAILABLE', 'Қурбро гирифта нашуд. Баъдтар кӯшиш кунед.');
    }
    res.json(await ratesPayload(userId));
  }),
);

/** PUT { rates: { USD: "10.95", RUB: null } } — null қурбро нест мекунад. 1 USD = 10.95 TJS */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const { rates } = parse(
      z.object({ rates: z.record(z.enum(CURRENCIES), z.union([z.string(), z.number(), z.null()])) }),
      req.body,
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } });
    const ops = [];
    for (const [cur, val] of Object.entries(rates) as [(typeof CURRENCIES)[number], string | number | null][]) {
      if (cur === user.baseCurrency) continue;
      if (val === null || val === '') {
        ops.push(prisma.exchangeRate.deleteMany({ where: { userId, currency: cur } }));
        continue;
      }
      const s = String(val).trim().replace(',', '.');
      if (!/^\d{1,12}(\.\d{1,6})?$/.test(s) || new Decimal(s).lte(0)) {
        throw badRequest('VALIDATION_ERROR', 'Қурби нодуруст', { fields: { [cur]: 'Қурби нодуруст' } });
      }
      ops.push(
        prisma.exchangeRate.upsert({
          where: { userId_currency: { userId, currency: cur } },
          create: { userId, currency: cur, rate: s, source: 'manual' },
          update: { rate: s, source: 'manual' },
        }),
      );
    }
    // Қурби дастӣ → худкор хомӯш мешавад (вагарна пагоҳ қурби бонк онро иваз мекунад)
    ops.push(prisma.user.update({ where: { id: userId }, data: { autoRates: false } }));
    await prisma.$transaction(ops);
    const all = await prisma.exchangeRate.findMany({ where: { userId } });
    res.json({
      ...(await ratesPayload(userId)),
      sample: all.map((r) => `1 ${r.currency} = ${money(r.rate)} ${user.baseCurrency}`),
    });
  }),
);

export default router;
