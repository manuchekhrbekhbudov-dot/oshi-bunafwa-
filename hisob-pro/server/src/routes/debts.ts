import { Router } from 'express';
import { z } from 'zod';
import type { Debt, DebtPayment, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { amountSchema, currencySchema, dateTimeSchema, idSchema, optionalText } from '../lib/validators.js';
import { ownAccount } from '../services/ownership.js';
import { dec, money, Decimal } from '../lib/money.js';
import { debtState, summarizeDebts, type DebtStatus } from '../services/calc.js';
import { getUserContext } from '../services/context.js';

/**
 * Қарзҳо. Додан/гирифтани қарз ва пардохтҳо ҳамчун DEBT_* сабт мешаванд:
 * онҳо баланси ҳисобро тағйир медиҳанд, вале ба даромад/хароҷот дохил НЕСТАНД.
 */
const router = Router();

type DebtFull = Debt & { payments: DebtPayment[]; account?: { name: string } | null };

function serialize(d: DebtFull, now = new Date()) {
  const state = debtState(d, d.payments, now);
  return {
    id: d.id,
    direction: d.direction,
    counterparty: d.counterparty,
    phone: d.phone,
    amount: money(d.amount),
    currency: d.currency,
    accountId: d.accountId,
    accountName: d.account?.name ?? null,
    issuedAt: d.issuedAt,
    dueDate: d.dueDate,
    note: d.note,
    ...state,
    payments: d.payments
      .slice()
      .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())
      .map((p) => ({ id: p.id, amount: money(p.amount), accountId: p.accountId, paidAt: p.paidAt, note: p.note })),
    createdAt: d.createdAt,
  };
}

const include = { payments: true, account: { select: { name: true } } } as const;

async function ownDebt(userId: string, id: string) {
  const d = await prisma.debt.findFirst({ where: { id, userId }, include });
  if (!d) throw notFound('Қарз ёфт нашуд');
  return d;
}

const debtSchema = z.object({
  direction: z.enum(['LENT', 'BORROWED']),
  counterparty: z.string().trim().min(1, 'Номро ворид кунед').max(120),
  phone: optionalText(40),
  amount: amountSchema,
  currency: currencySchema.default('TJS'),
  accountId: idSchema.optional().nullable(),
  issuedAt: dateTimeSchema,
  dueDate: dateTimeSchema.optional().nullable(),
  note: optionalText(1000),
});

async function checkAccount(userId: string, accountId: string | null | undefined, currency: string) {
  if (!accountId) return null;
  const acc = await ownAccount(userId, accountId);
  if (acc.currency !== currency) {
    throw badRequest('CURRENCY_MISMATCH', `Асъори ҳисоб (${acc.currency}) бо асъори қарз (${currency}) мувофиқ нест`, {
      fields: { accountId: `Ҳисоб бо ${acc.currency} аст` },
    });
  }
  return acc;
}

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const [debts, ctx] = await Promise.all([
      prisma.debt.findMany({ where: { userId }, include }),
      getUserContext(userId),
    ]);
    res.json(summarizeDebts(debts, ctx.base, ctx.rates));
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const q = parse(
      z.object({
        direction: z.enum(['LENT', 'BORROWED']).optional(),
        status: z.enum(['ACTIVE', 'PARTIAL', 'PAID', 'OVERDUE', 'OPEN']).optional(),
        q: z.string().trim().max(100).optional(),
      }),
      req.query,
    );
    const where: Prisma.DebtWhereInput = { userId };
    if (q.direction) where.direction = q.direction;
    if (q.q) where.counterparty = { contains: q.q, mode: 'insensitive' };
    const debts = await prisma.debt.findMany({ where, include, orderBy: { issuedAt: 'desc' } });
    let items = debts.map((d) => serialize(d));
    if (q.status === 'OPEN') items = items.filter((d) => d.status !== 'PAID');
    else if (q.status) items = items.filter((d) => d.status === (q.status as DebtStatus));
    res.json({ debts: items });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ debt: serialize(await ownDebt(uid(req), req.params.id)) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const b = parse(debtSchema, req.body);
    const acc = await checkAccount(userId, b.accountId, b.currency);
    const d = await prisma.debt.create({
      data: {
        userId,
        direction: b.direction,
        counterparty: b.counterparty,
        phone: b.phone,
        amount: b.amount,
        currency: b.currency,
        accountId: acc?.id ?? null,
        issuedAt: b.issuedAt,
        dueDate: b.dueDate ?? null,
        note: b.note,
        ...(acc
          ? {
              transactions: {
                create: {
                  userId,
                  accountId: acc.id,
                  type: b.direction === 'LENT' ? 'DEBT_LENT' : 'DEBT_BORROWED',
                  amount: b.amount,
                  currency: b.currency,
                  occurredAt: b.issuedAt,
                  note: b.note ?? b.counterparty,
                },
              },
            }
          : {}),
      },
      include,
    });
    res.status(201).json({ debt: serialize(d) });
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const existing = await ownDebt(userId, req.params.id);
    const b = parse(debtSchema, req.body);
    if (b.currency !== existing.currency && existing.payments.length > 0) {
      throw badRequest('CURRENCY_LOCKED', 'Асъори қарзи дорои пардохт иваз карда намешавад');
    }
    const paid = existing.payments.reduce((a, p) => a.plus(dec(p.amount)), new Decimal(0));
    if (dec(b.amount).lt(paid)) {
      throw badRequest('AMOUNT_BELOW_PAID', `Маблағ аз пардохтшуда (${money(paid)}) кам буда наметавонад`, {
        fields: { amount: `Ҳадди ақал ${money(paid)}` },
      });
    }
    const acc = await checkAccount(userId, b.accountId, b.currency);
    const d = await prisma.$transaction(async (tx) => {
      // Сатри асосии қарз (на пардохтҳо) аз нав сохта мешавад
      await tx.transaction.deleteMany({ where: { debtId: existing.id, debtPaymentId: null } });
      if (acc) {
        await tx.transaction.create({
          data: {
            userId,
            debtId: existing.id,
            accountId: acc.id,
            type: b.direction === 'LENT' ? 'DEBT_LENT' : 'DEBT_BORROWED',
            amount: b.amount,
            currency: b.currency,
            occurredAt: b.issuedAt,
            note: b.note ?? b.counterparty,
          },
        });
      }
      // Агар самт иваз шавад, намуди амалиётҳои пардохт низ иваз мешавад
      if (b.direction !== existing.direction) {
        await tx.transaction.updateMany({
          where: { debtId: existing.id, NOT: { debtPaymentId: null } },
          data: { type: b.direction === 'LENT' ? 'DEBT_COLLECTED' : 'DEBT_REPAID' },
        });
      }
      return tx.debt.update({
        where: { id: existing.id },
        data: {
          direction: b.direction,
          counterparty: b.counterparty,
          phone: b.phone,
          amount: b.amount,
          currency: b.currency,
          accountId: acc?.id ?? null,
          issuedAt: b.issuedAt,
          dueDate: b.dueDate ?? null,
          note: b.note,
        },
        include,
      });
    });
    res.json({ debt: serialize(d) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const d = await ownDebt(uid(req), req.params.id);
    // Пардохтҳо ва амалиётҳои вобаста бо cascade нест мешаванд → баланс барқарор мешавад
    await prisma.debt.delete({ where: { id: d.id } });
    res.json({ ok: true });
  }),
);

/* --------------------------- Пардохтҳо --------------------------- */

const paymentSchema = z.object({
  amount: amountSchema,
  accountId: idSchema.optional().nullable(),
  paidAt: dateTimeSchema,
  note: optionalText(500),
});

router.post(
  '/:id/payments',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const debt = await ownDebt(userId, req.params.id);
    const b = parse(paymentSchema, req.body);
    const state = debtState(debt, debt.payments);
    if (dec(b.amount).gt(dec(state.remaining))) {
      throw badRequest('OVERPAYMENT', `Маблағ аз бақияи қарз (${state.remaining} ${debt.currency}) зиёд аст`, {
        fields: { amount: `Ҳадди аксар ${state.remaining}` },
      });
    }
    const acc = await checkAccount(userId, b.accountId, debt.currency);
    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.debtPayment.create({
        data: { userId, debtId: debt.id, amount: b.amount, accountId: acc?.id ?? null, paidAt: b.paidAt, note: b.note },
      });
      if (acc) {
        await tx.transaction.create({
          data: {
            userId,
            debtId: debt.id,
            debtPaymentId: p.id,
            accountId: acc.id,
            type: debt.direction === 'LENT' ? 'DEBT_COLLECTED' : 'DEBT_REPAID',
            amount: b.amount,
            currency: debt.currency,
            occurredAt: b.paidAt,
            note: b.note ?? debt.counterparty,
          },
        });
      }
      return tx.debt.findUniqueOrThrow({ where: { id: debt.id }, include });
    });
    res.status(201).json({ debt: serialize(updated) });
  }),
);

router.delete(
  '/:id/payments/:paymentId',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const debt = await ownDebt(userId, req.params.id);
    const p = debt.payments.find((x) => x.id === req.params.paymentId);
    if (!p) throw notFound('Пардохт ёфт нашуд');
    await prisma.debtPayment.delete({ where: { id: p.id } });
    res.json({ debt: serialize(await ownDebt(userId, debt.id)) });
  }),
);

export default router;
