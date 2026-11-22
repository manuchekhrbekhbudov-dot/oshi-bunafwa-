import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, parse, uid } from '../lib/http.js';
import { badRequest } from '../lib/errors.js';
import { currencySchema, daySchema } from '../lib/validators.js';
import { daysBetween, todayKey } from '../lib/dates.js';
import { dailyReport, dashboard, periodReport } from '../services/reports.js';
import { exportReport, exportTransactions, type ExportFormat } from '../services/export.js';
import { buildWhere, listQuerySchema, orderBy } from './transactions.js';
import { serializeTx, txInclude } from '../services/serialize.js';

const router = Router();

const granularity = z.enum(['day', 'week', 'month']).optional();
const formatSchema = z.enum(['csv', 'xlsx', 'pdf']);

function checkRange(from: string, to: string) {
  if (from > to) throw badRequest('BAD_RANGE', 'Санаи оғоз бояд аз санаи анҷом пеш бошад');
  if (daysBetween(from, to).length > 3700) throw badRequest('BAD_RANGE', 'Давра хеле калон аст (ҳадди аксар 10 сол)');
}

async function userLang(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { language: true } });
  return u.language;
}

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    res.json(await dashboard(uid(req)));
  }),
);

router.get(
  '/daily',
  asyncHandler(async (req, res) => {
    const q = parse(z.object({ date: daySchema.optional(), currency: currencySchema.optional() }), req.query);
    res.json(await dailyReport(uid(req), q.date ?? todayKey(), q.currency));
  }),
);

router.get(
  '/period',
  asyncHandler(async (req, res) => {
    const q = parse(
      z.object({ from: daySchema, to: daySchema, granularity, currency: currencySchema.optional() }),
      req.query,
    );
    checkRange(q.from, q.to);
    res.json(await periodReport(uid(req), q.from, q.to, { granularity: q.granularity, currency: q.currency }));
  }),
);

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const q = parse(
      z.object({
        kind: z.enum(['daily', 'period']),
        format: formatSchema,
        date: daySchema.optional(),
        from: daySchema.optional(),
        to: daySchema.optional(),
        granularity,
        currency: currencySchema.optional(),
      }),
      req.query,
    );
    const lang = await userLang(userId);
    let out;
    if (q.kind === 'daily') {
      const day = q.date ?? todayKey();
      const r = await dailyReport(userId, day, q.currency);
      out = await exportReport(
        {
          title: lang === 'ru' ? 'Ежедневный отчёт' : 'Ҳисоботи ҳаррӯза',
          label: day,
          summary: r.summary,
          operationsCount: r.operationsCount,
          expenseByCategory: r.expenseByCategory,
          transactions: r.transactions,
          openingBalance: r.openingBalance,
          closingBalance: r.closingBalance,
        },
        q.format as ExportFormat,
        lang,
      );
    } else {
      if (!q.from || !q.to) throw badRequest('BAD_RANGE', 'from ва to лозиманд');
      checkRange(q.from, q.to);
      const r = await periodReport(userId, q.from, q.to, { granularity: q.granularity, currency: q.currency });
      out = await exportReport(
        {
          title: lang === 'ru' ? 'Отчёт за период' : 'Ҳисоботи давра',
          label: `${q.from}_${q.to}`,
          summary: r.summary,
          operationsCount: r.operationsCount,
          series: r.series,
          expenseByCategory: r.expenseByCategory,
        },
        q.format as ExportFormat,
        lang,
      );
    }
    sendFile(res, out);
  }),
);

/** Содироти таърихи амалиётҳо бо ҳамон филтрҳое, ки дар ҷадвал истифода мешаванд */
router.get(
  '/transactions/export',
  asyncHandler(async (req, res) => {
    const userId = uid(req);
    const format = parse(formatSchema, req.query.format);
    const f = parse(listQuerySchema, { ...req.query, page: 1, pageSize: 100 });
    const items = await prisma.transaction.findMany({
      where: buildWhere(userId, f),
      include: txInclude,
      orderBy: orderBy(f),
      take: 10_000,
    });
    const label = f.from || f.to ? `${f.from ?? 'start'}_${f.to ?? 'now'}` : todayKey();
    sendFile(res, await exportTransactions(items.map(serializeTx), format, await userLang(userId), label));
  }),
);

function sendFile(res: import('express').Response, out: { buffer: Buffer; mime: string; filename: string }) {
  res.setHeader('Content-Type', out.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(out.buffer);
}

export default router;
