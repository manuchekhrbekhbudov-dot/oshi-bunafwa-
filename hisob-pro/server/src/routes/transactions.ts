import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import {
  amountSchema,
  currencySchema,
  dateTimeSchema,
  daySchema,
  idSchema,
  optionalText,
} from '../lib/validators.js';
import { endOfDayExclusiveTz, startOfDayTz } from '../lib/dates.js';
import { ownAccount, ownCategory } from '../services/ownership.js';
import { serializeTx, txInclude } from '../services/serialize.js';
import { parseAmount } from '../lib/money.js';
import { checkSpendingAlert } from '../services/telegram/bot.js';
import { decodePhoto, savePhoto } from '../services/photos.js';

/** Огоҳии Telegram дар замина — ҳеҷ гоҳ ҷавобро суст ё вайрон намекунад */
function alertLater(userId: string) {
  checkSpendingAlert(userId).catch((e) => console.error('[telegram] alert failed', e));
}

const router = Router();

const paymentMethod = z.enum(['CASH', 'CARD', 'BANK']);

const createSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: amountSchema,
  currency: currencySchema.optional(),
  accountId: idSchema,
  categoryId: idSchema.optional().nullable(),
  occurredAt: dateTimeSchema,
  source: optionalText(200),
  purpose: optionalText(200),
  paymentMethod: paymentMethod.optional().nullable(),
  note: optionalText(1000),
});

/* --------------------------- Филтрҳо --------------------------- */

export const listQuerySchema = z.object({
  type: z.enum(['ALL', 'INCOME', 'EXPENSE', 'TRANSFER', 'DEBT']).default('ALL'),
  q: z.string().trim().max(100).optional(),
  accountId: idSchema.optional(),
  categoryId: idSchema.optional(),
  currency: currencySchema.optional(),
  paymentMethod: paymentMethod.optional(),
  from: daySchema.optional(),
  to: daySchema.optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  sort: z.enum(['occurredAt', 'amount', 'createdAt']).default('occurredAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export function buildWhere(userId: string, f: ListQuery): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };
  if (f.type === 'INCOME' || f.type === 'EXPENSE') where.type = f.type;
  if (f.type === 'TRANSFER') where.type = { in: ['TRANSFER_IN', 'TRANSFER_OUT'] };
  if (f.type === 'DEBT') where.type = { in: ['DEBT_LENT', 'DEBT_BORROWED', 'DEBT_COLLECTED', 'DEBT_REPAID'] };
  if (f.accountId) where.accountId = f.accountId;
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.currency) where.currency = f.currency;
  if (f.paymentMethod) where.paymentMethod = f.paymentMethod;
  if (f.from || f.to) {
    where.occurredAt = {
      ...(f.from ? { gte: startOfDayTz(f.from) } : {}),
      ...(f.to ? { lt: endOfDayExclusiveTz(f.to) } : {}),
    };
  }
  const min = f.minAmount ? parseAmount(f.minAmount) : null;
  const max = f.maxAmount ? parseAmount(f.maxAmount) : null;
  if (min || max) {
    where.amount = { ...(min ? { gte: min.toFixed(2) } : {}), ...(max ? { lte: max.toFixed(2) } : {}) };
  }
  if (f.q) {
    const contains = { contains: f.q, mode: 'insensitive' as const };
    where.OR = [
      { note: contains },
      { source: contains },
      { purpose: contains },
      { category: { name: contains } },
      { account: { name: contains } },
      { debt: { counterparty: contains } },
    ];
  }
  return where;
}

export function orderBy(f: ListQuery): Prisma.TransactionOrderByWithRelationInput[] {
  return [{ [f.sort]: f.order }, { createdAt: f.order }];
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const f = parse(listQuerySchema, req.query);
    const where = buildWhere(userId, f);
    const [total, items] = await prisma.$transaction([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        include: txInclude,
        orderBy: orderBy(f),
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
    ]);
    res.json({
      items: items.map(serializeTx),
      page: f.page,
      pageSize: f.pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / f.pageSize)),
    });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const t = await prisma.transaction.findFirst({ where: { id: req.params.id, userId: uid(req) }, include: txInclude });
    if (!t) throw notFound('Амалиёт ёфт нашуд');
    res.json({ transaction: serializeTx(t) });
  }),
);

async function validateRefs(
  userId: string,
  data: { type: 'INCOME' | 'EXPENSE'; accountId: string; categoryId?: string | null; currency?: string },
  existingAccountId?: string,
) {
  // Амалиёти мавҷударо дар ҳисоби бойгонӣ таҳрир кардан мумкин аст; амалиёти нав — не
  const acc = await ownAccount(userId, data.accountId, { allowArchived: data.accountId === existingAccountId });
  if (data.currency && data.currency !== acc.currency) {
    throw badRequest('CURRENCY_MISMATCH', `Асъори амалиёт бояд бо асъори ҳисоб (${acc.currency}) мувофиқ бошад`, {
      fields: { currency: `Ҳисоб бо ${acc.currency} аст` },
    });
  }
  if (data.categoryId) await ownCategory(userId, data.categoryId, data.type);
  return acc;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const body = parse(createSchema, req.body);
    const acc = await validateRefs(userId, body);
    const t = await prisma.transaction.create({
      data: {
        userId,
        type: body.type,
        amount: body.amount,
        currency: acc.currency,
        accountId: acc.id,
        categoryId: body.categoryId ?? null,
        occurredAt: body.occurredAt,
        source: body.type === 'INCOME' ? body.source : null,
        purpose: body.type === 'EXPENSE' ? body.purpose : null,
        paymentMethod: body.paymentMethod ?? null,
        note: body.note,
      },
      include: txInclude,
    });
    if (t.type === 'EXPENSE') alertLater(userId);
    res.status(201).json({ transaction: serializeTx(t) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw notFound('Амалиёт ёфт нашуд');
    if (existing.type !== 'INCOME' && existing.type !== 'EXPENSE') {
      throw conflict('NOT_EDITABLE', 'Интиқол ва қарзҳо дар саҳифаҳои худ таҳрир мешаванд');
    }
    const body = parse(createSchema.omit({ type: true }).partial(), req.body);
    const merged = {
      type: existing.type,
      accountId: body.accountId ?? existing.accountId,
      categoryId: body.categoryId === undefined ? existing.categoryId : body.categoryId,
      currency: body.currency,
    };
    const acc = await validateRefs(userId, merged, existing.accountId);
    const t = await prisma.transaction.update({
      where: { id: existing.id },
      data: {
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        accountId: acc.id,
        currency: acc.currency,
        categoryId: merged.categoryId,
        ...(body.occurredAt ? { occurredAt: body.occurredAt } : {}),
        ...(body.source !== undefined && existing.type === 'INCOME' ? { source: body.source } : {}),
        ...(body.purpose !== undefined && existing.type === 'EXPENSE' ? { purpose: body.purpose } : {}),
        ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      },
      include: txInclude,
    });
    if (t.type === 'EXPENSE') alertLater(userId);
    res.json({ transaction: serializeTx(t) });
  }),
);

/* --------------------------- Сурати харид --------------------------- */

async function ownPnlTx(userId: string, id: string) {
  const t = await prisma.transaction.findFirst({ where: { id, userId }, select: { id: true, type: true } });
  if (!t) throw notFound('Амалиёт ёфт нашуд');
  if (t.type !== 'INCOME' && t.type !== 'EXPENSE') throw conflict('NOT_EDITABLE', 'Сурат танҳо барои даромад ва хароҷот');
  return t;
}

router.get(
  '/:id/photo',
  asyncHandler(async (req, res) => {
    const photo = await prisma.transactionPhoto.findFirst({
      where: { transactionId: req.params.id, userId: uid(req) },
      select: { id: true, mime: true, data: true },
    });
    if (!photo) throw notFound('Сурат нест');
    res.set('Content-Type', photo.mime);
    res.set('Cache-Control', 'private, max-age=86400');
    res.set('ETag', `"${photo.id}"`);
    res.send(Buffer.from(photo.data));
  }),
);

router.put(
  '/:id/photo',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const t = await ownPnlTx(userId, req.params.id);
    const { data } = parse(z.object({ data: z.string().min(16).max(8_000_000) }), req.body);
    const saved = await savePhoto(userId, t.id, decodePhoto(data));
    res.json({ ok: true, size: saved.size });
  }),
);

router.delete(
  '/:id/photo',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    await ownPnlTx(userId, req.params.id);
    await prisma.transactionPhoto.deleteMany({ where: { transactionId: req.params.id, userId } });
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const t = await prisma.transaction.findFirst({ where: { id: req.params.id, userId } });
    if (!t) throw notFound('Амалиёт ёфт нашуд');
    if (t.transferId) {
      // Интиқол ҳамеша якҷоя (ҳарду тараф) нест карда мешавад
      await prisma.transfer.delete({ where: { id: t.transferId } });
      return res.json({ ok: true, deleted: 'transfer' });
    }
    if (t.debtId) {
      throw conflict('NOT_EDITABLE', 'Амалиётҳои қарзӣ дар саҳифаи «Қарзҳо» нест карда мешаванд');
    }
    await prisma.transaction.delete({ where: { id: t.id } });
    res.json({ ok: true });
  }),
);

export default router;
