import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseAmount } from '../lib/money.js';
import { amountSchema, currencySchema, daySchema, optionalText } from '../lib/validators.js';
import { endOfDayExclusiveTz, todayKey } from '../lib/dates.js';
import { goalStats } from '../services/plans.js';
import { contributeToGoal } from '../services/planActions.js';

const router = Router();

const include = { contributions: { orderBy: { createdAt: 'desc' as const } } };
type GoalWithC = NonNullable<Awaited<ReturnType<typeof load>>>;
const load = (userId: string, id: string) => prisma.goal.findFirst({ where: { id, userId }, include });

function serialize(g: GoalWithC) {
  return {
    id: g.id,
    title: g.title,
    target: g.target.toFixed(2),
    currency: g.currency,
    // санаи охир ҳамчун 'yyyy-MM-dd' (Душанбе)
    deadline: g.deadline ? new Date(g.deadline.getTime() - 1).toISOString().slice(0, 10) : null,
    color: g.color,
    achievedAt: g.achievedAt,
    ...goalStats(g, g.contributions),
    contributions: g.contributions.slice(0, 20).map((c) => ({ id: c.id, amount: c.amount.toFixed(2), note: c.note, createdAt: c.createdAt })),
  };
}

const body = z.object({
  title: z.string().trim().min(1, 'Номи мақсадро нависед').max(80),
  target: amountSchema,
  currency: currencySchema.default('TJS'),
  // Санаи охир: охири ҳамон рӯз (Душанбе) нигоҳ дошта мешавад
  deadline: daySchema
    .nullable()
    .optional()
    .refine((d) => !d || d >= todayKey(), 'Санаи ояндаро интихоб кунед (на гузашта)')
    .transform((d) => (d ? endOfDayExclusiveTz(d) : d)),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const goals = await prisma.goal.findMany({ where: { userId: uid(req) }, include, orderBy: { createdAt: 'asc' } });
    res.json({ goals: goals.map(serialize) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const data = parse(body, req.body);
    if ((await prisma.goal.count({ where: { userId } })) >= 50) throw badRequest('TOO_MANY', 'Ҳадди аксар 50 мақсад');
    const g = await prisma.goal.create({ data: { ...data, deadline: data.deadline ?? null, userId }, include });
    res.status(201).json({ goal: serialize(g) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const data = parse(body.partial(), req.body);
    const g = await load(userId, req.params.id);
    if (!g) throw notFound('Мақсад ёфт нашуд');
    await prisma.goal.update({ where: { id: g.id }, data });
    // ҳадаф иваз шуд → ҳолати «иҷро шуд» аз нав
    const fresh = (await load(userId, g.id))!;
    const achieved = goalStats(fresh, fresh.contributions).achieved;
    if (achieved !== !!fresh.achievedAt) await prisma.goal.update({ where: { id: g.id }, data: { achievedAt: achieved ? new Date() : null } });
    res.json({ goal: serialize((await load(userId, g.id))!) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = await prisma.goal.deleteMany({ where: { id: req.params.id, userId: uid(req) } });
    if (!r.count) throw notFound('Мақсад ёфт нашуд');
    res.json({ ok: true });
  }),
);

/** Пул гузоштан (мусбат) ё гирифтан (манфӣ, масалан "-100") */
router.post(
  '/:id/contributions',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const { amount, note, withdraw } = parse(
      z.object({ amount: z.union([z.string(), z.number()]), note: optionalText(200), withdraw: z.boolean().optional() }),
      req.body,
    );
    const raw = String(amount).trim();
    const neg = withdraw || raw.startsWith('-');
    const d = parseAmount(raw.replace(/^-/, ''));
    if (!d) throw badRequest('VALIDATION_ERROR', 'Маблағи нодуруст', { fields: { amount: 'Маблағи нодуруст' } });
    await contributeToGoal(userId, req.params.id, `${neg ? '-' : ''}${d.toFixed(2)}`, note);
    res.status(201).json({ goal: serialize((await load(userId, req.params.id))!) });
  }),
);

router.delete(
  '/:id/contributions/:cid',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const g = await load(userId, req.params.id);
    if (!g) throw notFound('Мақсад ёфт нашуд');
    const r = await prisma.goalContribution.deleteMany({ where: { id: req.params.cid, goalId: g.id, userId } });
    if (!r.count) throw notFound('Ёфт нашуд');
    const fresh = (await load(userId, g.id))!;
    const achieved = goalStats(fresh, fresh.contributions).achieved;
    if (achieved !== !!fresh.achievedAt) await prisma.goal.update({ where: { id: g.id }, data: { achievedAt: achieved ? new Date() : null } });
    res.json({ goal: serialize((await load(userId, g.id))!) });
  }),
);

export default router;
