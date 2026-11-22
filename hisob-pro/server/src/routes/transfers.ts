import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { amountSchema, dateTimeSchema, idSchema, optionalText } from '../lib/validators.js';
import { ownAccount } from '../services/ownership.js';
import { money } from '../lib/money.js';
import type { Transfer } from '@prisma/client';

/**
 * Интиқоли дохилӣ байни ҳисобҳо. Ду сатр сохта мешавад (TRANSFER_OUT ва TRANSFER_IN),
 * ки танҳо ба баланс таъсир мерасонанд ва ҳеҷ гоҳ ҳамчун даромад/хароҷот ҳисоб намешаванд.
 */
const router = Router();

const schema = z.object({
  fromAccountId: idSchema,
  toAccountId: idSchema,
  amount: amountSchema,
  /** Маблағе, ки ба ҳисоби қабулкунанда мерасад — ҳатмӣ, агар асъорҳо гуногун бошанд */
  amountTo: amountSchema.optional().nullable(),
  occurredAt: dateTimeSchema,
  note: optionalText(500),
});

type Input = z.infer<typeof schema>;

async function prepare(userId: string, b: Input) {
  if (b.fromAccountId === b.toAccountId) {
    throw badRequest('SAME_ACCOUNT', 'Ҳисоби фиристанда ва қабулкунанда бояд гуногун бошанд', {
      fields: { toAccountId: 'Ҳисоби дигарро интихоб кунед' },
    });
  }
  const [from, to] = await Promise.all([ownAccount(userId, b.fromAccountId), ownAccount(userId, b.toAccountId)]);
  let amountTo = b.amount;
  if (from.currency !== to.currency) {
    if (!b.amountTo) {
      throw badRequest('AMOUNT_TO_REQUIRED', 'Асъорҳо гуногунанд — маблағи қабулшударо ворид кунед', {
        fields: { amountTo: `Чанд ${to.currency} мерасад?` },
      });
    }
    amountTo = b.amountTo;
  }
  return { from, to, amountTo };
}

function serialize(t: Transfer & { fromAccount?: { name: string; currency: string }; toAccount?: { name: string; currency: string } }) {
  return {
    id: t.id,
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    fromAccount: t.fromAccount ?? null,
    toAccount: t.toAccount ?? null,
    amountFrom: money(t.amountFrom),
    amountTo: money(t.amountTo),
    occurredAt: t.occurredAt,
    note: t.note,
  };
}

const include = {
  fromAccount: { select: { name: true, currency: true } },
  toAccount: { select: { name: true, currency: true } },
} as const;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await prisma.transfer.findMany({
      where: { userId: uid(req) },
      include,
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
    res.json({ transfers: items.map(serialize) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const b = parse(schema, req.body);
    const { from, to, amountTo } = await prepare(userId, b);
    const t = await prisma.transfer.create({
      data: {
        userId,
        fromAccountId: from.id,
        toAccountId: to.id,
        amountFrom: b.amount,
        amountTo,
        occurredAt: b.occurredAt,
        note: b.note,
        transactions: {
          create: [
            { userId, accountId: from.id, type: 'TRANSFER_OUT', amount: b.amount, currency: from.currency, occurredAt: b.occurredAt, note: b.note },
            { userId, accountId: to.id, type: 'TRANSFER_IN', amount: amountTo, currency: to.currency, occurredAt: b.occurredAt, note: b.note },
          ],
        },
      },
      include,
    });
    res.status(201).json({ transfer: serialize(t) });
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const existing = await prisma.transfer.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw notFound('Интиқол ёфт нашуд');
    const b = parse(schema, req.body);
    const { from, to, amountTo } = await prepare(userId, b);
    // Ду сатри кӯҳна иваз карда мешаванд — баланс ҳамеша дуруст мемонад
    const t = await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { transferId: existing.id } });
      return tx.transfer.update({
        where: { id: existing.id },
        data: {
          fromAccountId: from.id,
          toAccountId: to.id,
          amountFrom: b.amount,
          amountTo,
          occurredAt: b.occurredAt,
          note: b.note,
          transactions: {
            create: [
              { userId, accountId: from.id, type: 'TRANSFER_OUT', amount: b.amount, currency: from.currency, occurredAt: b.occurredAt, note: b.note },
              { userId, accountId: to.id, type: 'TRANSFER_IN', amount: amountTo, currency: to.currency, occurredAt: b.occurredAt, note: b.note },
            ],
          },
        },
        include,
      });
    });
    res.json({ transfer: serialize(t) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.transfer.findFirst({ where: { id: req.params.id, userId: uid(req) } });
    if (!existing) throw notFound('Интиқол ёфт нашуд');
    await prisma.transfer.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }),
);

export default router;
