import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { amountSchema } from '../lib/validators.js';
import { budgetStatus, monthAdvice } from '../services/budgets.js';
import { checkBudgetAlerts } from '../services/telegram/bot.js';

const router = Router();

const strip = (b: Awaited<ReturnType<typeof budgetStatus>>['budgets'][number]) => {
  const { alert80Key: _a, alert100Key: _b, ...rest } = b;
  return rest;
};

/** Буҷетҳои ин моҳ бо хароҷоти ҳозира */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const st = await budgetStatus(uid(req));
    res.json({ ...st, budgets: st.budgets.map(strip) });
  }),
);

/** PUT /api/budgets/:categoryId { amount } — гузоштан ё иваз кардан */
router.put(
  '/:categoryId',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const { amount } = parse(z.object({ amount: amountSchema }), req.body);
    const cat = await prisma.category.findFirst({ where: { id: req.params.categoryId, userId } });
    if (!cat) throw notFound('Категория ёфт нашуд');
    if (cat.kind !== 'EXPENSE') throw badRequest('BAD_CATEGORY', 'Буҷет танҳо барои категорияи хароҷот');
    await prisma.budget.upsert({
      where: { categoryId: cat.id },
      create: { userId, categoryId: cat.id, amount },
      // маблағ иваз шуд → огоҳиҳои ин моҳ аз нав
      update: { amount, alert80Key: null, alert100Key: null },
    });
    checkBudgetAlerts(userId).catch(() => undefined);
    const st = await budgetStatus(userId);
    res.json({ ...st, budgets: st.budgets.map(strip) });
  }),
);

router.delete(
  '/:categoryId',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const r = await prisma.budget.deleteMany({ where: { categoryId: req.params.categoryId, userId } });
    if (!r.count) throw notFound('Буҷет ёфт нашуд');
    const st = await budgetStatus(userId);
    res.json({ ...st, budgets: st.budgets.map(strip) });
  }),
);

export default router;

/** GET /api/advice?month=yyyy-MM — баҳо ва маслиҳатҳо */
export const adviceRouter = Router();
adviceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const month = req.query.month ? parse(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), req.query.month) : undefined;
    res.json(await monthAdvice(uid(req), month));
  }),
);
