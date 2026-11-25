import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { initialMarks, normalizeDays, serializeRoutine, TIME_RE } from '../services/routines.js';

const router = Router();

const time = z.string().regex(TIME_RE, 'Вақт бояд ҳамчун 16:00 бошад');
const base = z.object({
  title: z.string().trim().min(1, 'Номи ҷойро ворид кунед').max(60),
  categoryId: z.string().min(1).nullable().optional(),
  days: z
    .string()
    .transform(normalizeDays)
    .refine((d) => d.length > 0, 'Ақаллан як рӯзро интихоб кунед'),
  arriveTime: time.nullable().optional(), // соати даромадан (ихтиёрӣ)
  leaveTime: time, // соати баромадан
  remindBefore: z.number().int().min(0).max(120).default(5),
  active: z.boolean().default(true),
});
const arriveBeforeLeave = (d: { arriveTime?: string | null; leaveTime?: string }) =>
  !d.arriveTime || !d.leaveTime || d.arriveTime < d.leaveTime;
const ORDER_MSG = { message: 'Соати баромадан бояд баъд аз соати даромадан бошад', path: ['leaveTime'] };
const body = base.refine(arriveBeforeLeave, ORDER_MSG);

/** Категория бояд аз худи корбар ва навъи «хароҷот» бошад */
async function checkCategory(userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const c = await prisma.category.findFirst({ where: { id: categoryId, userId, kind: 'EXPENSE' } });
  if (!c) throw badRequest('BAD_CATEGORY', 'Категорияи хароҷот ёфт нашуд');
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const [routines, user] = await Promise.all([
      prisma.routine.findMany({ where: { userId }, include: { category: { select: { name: true } } }, orderBy: { leaveTime: 'asc' } }),
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { routinesAskedAt: true } }),
    ]);
    res.json({ routines: routines.map(serializeRoutine), asked: !!user.routinesAskedAt });
  }),
);

/** Саволи «пулро дар куҷо сарф мекунед?» дигар худкор нишон дода намешавад */
router.post(
  '/asked',
  asyncHandler(async (req, res) => {
    await prisma.user.update({ where: { id: uid(req) }, data: { routinesAskedAt: new Date() } });
    res.json({ ok: true });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const data = parse(body, req.body);
    await checkCategory(userId, data.categoryId);
    const count = await prisma.routine.count({ where: { userId } });
    if (count >= 30) throw badRequest('TOO_MANY', 'Ҳадди аксар 30 ҷой');
    const r = await prisma.routine.create({
      data: { ...data, categoryId: data.categoryId ?? null, arriveTime: data.arriveTime ?? null, userId, ...initialMarks(data as never, new Date()) },
      include: { category: { select: { name: true } } },
    });
    await prisma.user.update({ where: { id: userId }, data: { routinesAskedAt: new Date() } });
    res.status(201).json({ routine: serializeRoutine(r) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const data = parse(base.partial(), req.body);
    const r = await prisma.routine.findFirst({ where: { id: req.params.id, userId } });
    if (!r) throw notFound('Ҷой ёфт нашуд');
    await checkCategory(userId, data.categoryId);
    const merged = {
      arriveTime: data.arriveTime === undefined ? r.arriveTime : data.arriveTime,
      leaveTime: data.leaveTime ?? r.leaveTime,
      remindBefore: data.remindBefore ?? r.remindBefore,
    };
    if (!arriveBeforeLeave(merged)) throw badRequest('VALIDATION', ORDER_MSG.message);
    // Вақт иваз шуд → хабари имрӯза аз нав ҳисоб мешавад
    const timesChanged = data.leaveTime !== undefined || data.remindBefore !== undefined;
    const u = await prisma.routine.update({
      where: { id: r.id },
      data: { ...data, ...(timesChanged ? initialMarks(merged, new Date()) : {}) },
      include: { category: { select: { name: true } } },
    });
    res.json({ routine: serializeRoutine(u) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = await prisma.routine.deleteMany({ where: { id: req.params.id, userId: uid(req) } });
    if (!r.count) throw notFound('Ҷой ёфт нашуд');
    res.json({ ok: true });
  }),
);

export default router;
