import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { CURRENCIES, Decimal, money } from '../lib/money.js';
import { badRequest } from '../lib/errors.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const [user, rates] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } }),
      prisma.exchangeRate.findMany({ where: { userId } }),
    ]);
    res.json({
      base: user.baseCurrency,
      rates: rates.map((r) => ({ currency: r.currency, rate: r.rate.toFixed(6), updatedAt: r.updatedAt })),
    });
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
          create: { userId, currency: cur, rate: s },
          update: { rate: s },
        }),
      );
    }
    await prisma.$transaction(ops);
    const all = await prisma.exchangeRate.findMany({ where: { userId } });
    res.json({
      base: user.baseCurrency,
      rates: all.map((r) => ({ currency: r.currency, rate: r.rate.toFixed(6), updatedAt: r.updatedAt })),
      sample: all.map((r) => `1 ${r.currency} = ${money(r.rate)} ${user.baseCurrency}`),
    });
  }),
);

export default router;
