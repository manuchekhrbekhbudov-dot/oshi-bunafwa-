import { prisma } from '../lib/prisma.js';
import {
  daysBetween,
  endOfDayExclusiveTz,
  monthsBetween,
  previousRange,
  shiftDay,
  shiftMonth,
  startOfDayTz,
  todayKey,
  weekStart,
} from '../lib/dates.js';
import type { CurrencyCode } from '../lib/money.js';
import { accountBalances, loadLedgerRows } from './ledger.js';
import { getUserContext } from './context.js';
import {
  buildSeries,
  categoryBreakdown,
  categoryChanges,
  summarize,
  summarizeDebts,
  totalBalance,
  type Granularity,
  type ViewOptions,
} from './calc.js';
import { serializeAccount, serializeTx, txInclude } from './serialize.js';

/** Ҳисоботи ҳаррӯза: Натиҷаи рӯз = Даромади рӯз − Хароҷоти рӯз */
export async function dailyReport(userId: string, day: string, currency?: CurrencyCode | null) {
  const ctx = await getUserContext(userId);
  const from = startOfDayTz(day);
  const to = endOfDayExclusiveTz(day);
  const view: ViewOptions = { base: ctx.base, rates: ctx.rates, currency };

  const [rows, txs, opening, closing] = await Promise.all([
    loadLedgerRows(userId, from, to),
    prisma.transaction.findMany({
      where: { userId, occurredAt: { gte: from, lt: to } },
      include: txInclude,
      orderBy: { occurredAt: 'asc' },
    }),
    accountBalances(userId, from),
    accountBalances(userId, to),
  ]);

  const summary = summarize(rows, view);
  const active = closing.accounts.filter((a) => !a.archived);
  return {
    date: day,
    timeZone: 'Asia/Dushanbe',
    summary,
    /** Шумораи ҳамаи амалиётҳои рӯз (бо интиқол ва қарзҳо) */
    operationsCount: txs.length,
    transactions: txs.map(serializeTx),
    expenseByCategory: categoryBreakdown(rows, 'EXPENSE', view),
    incomeByCategory: categoryBreakdown(rows, 'INCOME', view),
    openingBalance: totalBalance(active, opening.balances, ctx.base, ctx.rates),
    closingBalance: totalBalance(active, closing.balances, ctx.base, ctx.rates),
    accounts: closing.accounts.map((a) => ({
      ...serializeAccount(a, closing.balances.get(a.id)),
      openingBalance: serializeAccount(a, opening.balances.get(a.id)).balance,
    })),
  };
}

export function autoGranularity(from: string, to: string): Granularity {
  const days = daysBetween(from, to).length;
  if (days <= 62) return 'day';
  if (days <= 190) return 'week';
  return 'month';
}

export function bucketKeys(from: string, to: string, g: Granularity): string[] {
  if (g === 'day') return daysBetween(from, to);
  if (g === 'month') return monthsBetween(from.slice(0, 7), to.slice(0, 7));
  const keys: string[] = [];
  let cur = weekStart(from);
  while (cur <= to) {
    keys.push(cur);
    cur = shiftDay(cur, 7);
  }
  return keys;
}

/** Ҳисоботи давра (ҳафтаина, моҳона, солона ё дилхоҳ) */
export async function periodReport(
  userId: string,
  from: string,
  to: string,
  opts: { granularity?: Granularity; currency?: CurrencyCode | null } = {},
) {
  const ctx = await getUserContext(userId);
  const g = opts.granularity ?? autoGranularity(from, to);
  const start = startOfDayTz(from);
  const end = endOfDayExclusiveTz(to);
  const view: ViewOptions = { base: ctx.base, rates: ctx.rates, currency: opts.currency };
  // Давраи ҷорӣ, ки ба оянда мерасад (масалан тамоми ноябр, имрӯз 25-ум) → бо ҳамон рӯзҳо муқоиса мешавад
  const today = todayKey();
  const prevRange = previousRange(from, to > today && from <= today ? today : to);
  const [rows, prevRows] = await Promise.all([
    loadLedgerRows(userId, start, end),
    loadLedgerRows(userId, startOfDayTz(prevRange.from), endOfDayExclusiveTz(prevRange.to)),
  ]);
  const pnlCount = rows.filter((r) => r.type === 'INCOME' || r.type === 'EXPENSE').length;
  const expenseByCategory = categoryBreakdown(rows, 'EXPENSE', view);
  return {
    from,
    to,
    granularity: g,
    summary: summarize(rows, view),
    operationsCount: rows.length,
    pnlCount,
    series: buildSeries(rows, bucketKeys(from, to, g), g, view),
    expenseByCategory,
    incomeByCategory: categoryBreakdown(rows, 'INCOME', view),
    /** Муқоиса бо давраи қаблӣ (ҳамон рӯзҳои моҳи гузашта ё ҳамон шумораи рӯзҳо) */
    previous: { ...prevRange, summary: summarize(prevRows, view) },
    changes: categoryChanges(expenseByCategory, categoryBreakdown(prevRows, 'EXPENSE', view)),
  };
}

export async function dashboard(userId: string, now = new Date()) {
  const ctx = await getUserContext(userId);
  const view: ViewOptions = { base: ctx.base, rates: ctx.rates };
  const today = todayKey(now);
  const month = today.slice(0, 7);
  const monthStartDay = `${month}-01`;
  const from12m = `${shiftMonth(month, -11)}-01`;
  const from30 = shiftDay(today, -29);
  const from7 = shiftDay(today, -6);

  // Як дархост барои 12 моҳ — ҳамаи бақияи ҳисобҳо аз ҳамин маълумот ҳисоб мешаванд
  const earliest = from12m < from30 ? from12m : from30;
  const [rows, bal, debts, recent] = await Promise.all([
    loadLedgerRows(userId, startOfDayTz(earliest), endOfDayExclusiveTz(today)),
    accountBalances(userId),
    prisma.debt.findMany({ where: { userId }, include: { payments: true, account: { select: { name: true } } } }),
    prisma.transaction.findMany({ where: { userId }, include: txInclude, orderBy: { occurredAt: 'desc' }, take: 8 }),
  ]);

  const inRange = (a: string, b: string) => {
    const s = startOfDayTz(a).getTime();
    const e = endOfDayExclusiveTz(b).getTime();
    return rows.filter((r) => r.occurredAt.getTime() >= s && r.occurredAt.getTime() < e);
  };

  const todayRows = inRange(today, today);
  const monthRows = inRange(monthStartDay, today);
  const active = bal.accounts.filter((a) => !a.archived);

  return {
    today,
    base: ctx.base,
    todaySummary: summarize(todayRows, view),
    monthSummary: summarize(monthRows, view),
    balance: totalBalance(active, bal.balances, ctx.base, ctx.rates),
    accounts: active.map((a) => serializeAccount(a, bal.balances.get(a.id))),
    debts: summarizeDebts(debts, ctx.base, ctx.rates),
    charts: {
      days7: buildSeries(inRange(from7, today), bucketKeys(from7, today, 'day'), 'day', view),
      days30: buildSeries(inRange(from30, today), bucketKeys(from30, today, 'day'), 'day', view),
      months12: buildSeries(inRange(from12m, today), bucketKeys(from12m, today, 'month'), 'month', view),
    },
    monthExpenseByCategory: categoryBreakdown(monthRows, 'EXPENSE', view),
    recent: recent.map(serializeTx),
  };
}
