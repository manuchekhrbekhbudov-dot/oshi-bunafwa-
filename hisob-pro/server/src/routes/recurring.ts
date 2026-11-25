import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { amountSchema, currencySchema } from '../lib/validators.js';
import { recurringStatus } from '../services/plans.js';
import { payRecurring, skipRecurring } from '../services/planActions.js';
import { serializeTx, txInclude } from '../services/serialize.js';
import { checkSpendingAlert } from '../services/telegram/bot.js';

const router = Router();
const include = { account: { select: { name: true } }, category: { select: { name: true } } };
type Row = Awaited<ReturnType<typeof prisma.recurringPayment.findFirstOrThrow<{ where: { id: string }; include: typeof include }>>>;

function serialize(r: Row) {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    amount: r.amount.toFixed(2),
    currency: r.currency,
    accountId: r.accountId,
    accountName: r.account?.name ?? null,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    dayOfMonth: r.dayOfMonth,
    active: r.active,
    ...recurringStatus(r),
  };
}

const body = z.object({
  title: z.string().trim().min(1, 'Номро нависед').max(80),
  type: z.enum(['INCOME', 'EXPENSE']).default('EXPENSE'),
  amount: amountSchema,
  currency: currencySchema.default('TJS'),
  accountId: z.string().min(1).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  dayOfMonth: z.number().int().min(1, '1–31').max(31, '1–31'),
  active: z.boolean().default(true),
});

/** Ҳисоб ва категория бояд аз худи корбар бошанд; ҳисоб — бо ҳамон асъор, категория — бо ҳамон навъ */
async function check(userId: string, d: { accountId?: string | null; categoryId?: string | null; currency?: string; type?: string }) {
  if (d.accountId) {
    const a = await prisma.account.findFirst({ where: { id: d.accountId, userId } });
    if (!a) throw badRequest('BAD_ACCOUNT', 'Ҳисоб ёфт нашуд');
    if (d.currency && a.currency !== d.currency) throw badRequest('CURRENCY_MISMATCH', 'Асъори ҳисоб бо асъори пардохт мувофиқ нест');
  }
  if (d.categoryId) {
    const c = await prisma.category.findFirst({ where: { id: d.categoryId, userId, ...(d.type ? { kind: d.type as 'INCOME' | 'EXPENSE' } : {}) } });
    if (!c) throw badRequest('BAD_CATEGORY', 'Категория ёфт нашуд');
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const list = await prisma.recurringPayment.findMany({ where: { userId: uid(req) }, include, orderBy: [{ dayOfMonth: 'asc' }, { createdAt: 'asc' }] });
    res.json({ recurring: list.map(serialize) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const data = parse(body, req.body);
    await check(userId, data);
    if ((await prisma.recurringPayment.count({ where: { userId } })) >= 100) throw badRequest('TOO_MANY', 'Ҳадди аксар 100');
    const r = await prisma.recurringPayment.create({
      data: { ...data, accountId: data.accountId ?? null, categoryId: data.categoryId ?? null, userId },
      include,
    });
    res.status(201).json({ recurring: serialize(r) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const data = parse(body.partial(), req.body);
    const r = await prisma.recurringPayment.findFirst({ where: { id: req.params.id, userId } });
    if (!r) throw notFound('Пардохт ёфт нашуд');
    await check(userId, { ...data, currency: data.currency ?? r.currency, type: data.type ?? r.type });
    const u = await prisma.recurringPayment.update({ where: { id: r.id }, data, include });
    res.json({ recurring: serialize(u) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = await prisma.recurringPayment.deleteMany({ where: { id: req.params.id, userId: uid(req) } });
    if (!r.count) throw notFound('Пардохт ёфт нашуд');
    res.json({ ok: true });
  }),
);

/** «Пардохт шуд» — амалиёт сабт мешавад (ҳисоб ва маблағро иваз кардан мумкин) */
router.post(
  '/:id/pay',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const opts = parse(z.object({ accountId: z.string().min(1).nullable().optional(), amount: amountSchema.nullable().optional() }), req.body ?? {});
    const r = await payRecurring(userId, req.params.id, opts);
    if (r.tx.type === 'EXPENSE') checkSpendingAlert(userId).catch(() => undefined);
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: r.tx.id }, include: txInclude });
    const fresh = await prisma.recurringPayment.findFirstOrThrow({ where: { id: r.recurring.id }, include });
    res.status(201).json({ transaction: serializeTx(tx), recurring: serialize(fresh) });
  }),
);

router.post(
  '/:id/skip',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    await skipRecurring(userId, req.params.id);
    const fresh = await prisma.recurringPayment.findFirstOrThrow({ where: { id: req.params.id, userId }, include });
    res.json({ recurring: serialize(fresh) });
  }),
);

export default router;
