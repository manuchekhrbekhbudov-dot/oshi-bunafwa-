import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { notFound } from '../lib/errors.js';
import { serializeCategory } from '../services/serialize.js';

const router = Router();
const kindSchema = z.enum(['INCOME', 'EXPENSE']);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const kind = req.query.kind ? parse(kindSchema, req.query.kind) : undefined;
    const cats = await prisma.category.findMany({
      where: { userId: uid(req), ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ categories: cats.map(serializeCategory) });
  }),
);

const body = z.object({
  name: z.string().trim().min(1, 'Номро ворид кунед').max(60),
  kind: kindSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(40).optional(),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parse(body, req.body);
    const c = await prisma.category.create({ data: { ...data, userId: uid(req) } });
    res.status(201).json({ category: serializeCategory(c) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = parse(body.omit({ kind: true }).partial(), req.body);
    const c = await prisma.category.findFirst({ where: { id: req.params.id, userId: uid(req) } });
    if (!c) throw notFound('Категория ёфт нашуд');
    const u = await prisma.category.update({ where: { id: c.id }, data });
    res.json({ category: serializeCategory(u) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await prisma.category.findFirst({ where: { id: req.params.id, userId: uid(req) } });
    if (!c) throw notFound('Категория ёфт нашуд');
    // Амалиётҳо боқӣ мемонанд, танҳо бе категория (onDelete: SetNull)
    await prisma.category.delete({ where: { id: c.id } });
    res.json({ ok: true });
  }),
);

export default router;
