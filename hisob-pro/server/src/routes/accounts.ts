import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { badRequest, conflict } from '../lib/errors.js';
import { accountBalances } from '../services/ledger.js';
import { serializeAccount } from '../services/serialize.js';
import { ownAccount } from '../services/ownership.js';
import { currencySchema } from '../lib/validators.js';
import { getUserContext } from '../services/context.js';
import { totalBalance } from '../services/calc.js';

const router = Router();

const signedAmount = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const s = String(v).trim().replace(',', '.');
    if (!/^-?\d{1,16}(\.\d{1,2})?$/.test(s)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Маблағи нодуруст' });
      return z.NEVER;
    }
    return s;
  });

const typeSchema = z.enum(['CASH', 'CARD', 'BANK', 'EWALLET']);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Ранги нодуруст');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const [{ accounts, balances }, ctx] = await Promise.all([accountBalances(userId), getUserContext(userId)]);
    const active = accounts.filter((a) => !a.archived);
    res.json({
      accounts: accounts.map((a) => serializeAccount(a, balances.get(a.id))),
      total: totalBalance(active, balances, ctx.base, ctx.rates),
    });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(1, 'Номро ворид кунед').max(80),
        type: typeSchema,
        currency: currencySchema.default('TJS'),
        initialBalance: signedAmount.default('0'),
        color: colorSchema.optional(),
      }),
      req.body,
    );
    const a = await prisma.account.create({ data: { ...body, userId: uid(req) } });
    res.status(201).json({ account: serializeAccount(a) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const acc = await ownAccount(userId, req.params.id, { allowArchived: true });
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(80).optional(),
        type: typeSchema.optional(),
        currency: currencySchema.optional(),
        initialBalance: signedAmount.optional(),
        color: colorSchema.optional(),
        archived: z.boolean().optional(),
      }),
      req.body,
    );
    if (body.currency && body.currency !== acc.currency) {
      const used =
        (await prisma.transaction.count({ where: { accountId: acc.id } })) +
        (await prisma.debt.count({ where: { accountId: acc.id } }));
      if (used > 0) throw badRequest('CURRENCY_LOCKED', 'Асъори ҳисоби дорои амалиёт иваз карда намешавад');
    }
    const a = await prisma.account.update({ where: { id: acc.id }, data: body });
    res.json({ account: serializeAccount(a) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const acc = await ownAccount(uid(req), req.params.id, { allowArchived: true });
    const used =
      (await prisma.transaction.count({ where: { accountId: acc.id } })) +
      (await prisma.debt.count({ where: { accountId: acc.id } })) +
      (await prisma.debtPayment.count({ where: { accountId: acc.id } }));
    if (used > 0) {
      throw conflict('ACCOUNT_IN_USE', 'Ҳисоб амалиёт дорад. Онро бойгонӣ кунед ё аввал амалиётҳоро нест кунед');
    }
    await prisma.account.delete({ where: { id: acc.id } });
    res.json({ ok: true });
  }),
);

export default router;
