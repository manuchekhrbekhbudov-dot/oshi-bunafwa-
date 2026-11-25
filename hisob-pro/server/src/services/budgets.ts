/**
 * Буҷети категорияҳо ва маслиҳати моҳона.
 * Ҳама ҳисобҳо дар асъори асосии корбар (бо қурб); интиқол ва қарзҳо хароҷот нестанд.
 */
import { prisma } from '../lib/prisma.js';
import { dec, money, type CurrencyCode } from '../lib/money.js';
import { endOfDayExclusiveTz, previousRange, shiftDay, startOfDayTz, todayKey } from '../lib/dates.js';
import { getUserContext } from './context.js';
import { loadLedgerRows } from './ledger.js';
import { categoryBreakdown, categoryChanges, summarize, type CategoryShare } from './calc.js';

const lastDayOfMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

async function monthExpenses(userId: string, from: string, to: string) {
  const ctx = await getUserContext(userId);
  const view = { base: ctx.base, rates: ctx.rates };
  const rows = await loadLedgerRows(userId, startOfDayTz(from), endOfDayExclusiveTz(to));
  return { base: ctx.base, view, rows, summary: summarize(rows, view), cats: categoryBreakdown(rows, 'EXPENSE', view) };
}

export type BudgetState = 'ok' | 'warn' | 'over';

/** Буҷетҳои ин моҳ: чанд сарф шуд, чанд монд, фоиз */
export async function budgetStatus(userId: string, now = new Date()) {
  const today = todayKey(now);
  const month = today.slice(0, 7);
  const end = lastDayOfMonth(month);
  const [budgets, data] = await Promise.all([
    prisma.budget.findMany({ where: { userId }, include: { category: { select: { name: true, color: true } } }, orderBy: { createdAt: 'asc' } }),
    monthExpenses(userId, `${month}-01`, today),
  ]);
  const spentBy = new Map(data.cats.map((c) => [c.categoryId, dec(c.amount)]));
  const daysLeft = Number(end.slice(8, 10)) - Number(today.slice(8, 10)) + 1;
  const items = budgets.map((b) => {
    const spent = spentBy.get(b.categoryId) ?? dec(0);
    const amount = dec(b.amount);
    const remaining = amount.minus(spent);
    const pct = amount.gt(0) ? Math.floor(spent.div(amount).times(100).toNumber()) : 0;
    const state: BudgetState = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
    return {
      id: b.id,
      categoryId: b.categoryId,
      name: b.category.name,
      color: b.category.color,
      amount: money(amount),
      spent: money(spent),
      remaining: money(remaining),
      pct,
      state,
      perDayLeft: remaining.gt(0) && daysLeft > 0 ? money(remaining.div(daysLeft).toDecimalPlaces(2, 1)) : null,
      alert80Key: b.alert80Key,
      alert100Key: b.alert100Key,
    };
  });
  return { month, base: data.base as CurrencyCode, daysLeft, budgets: items };
}

/* ------------------------------ Маслиҳати моҳона ------------------------------ */

export type Grade = 'A' | 'B' | 'C' | 'D';
export type AdviceTip =
  | { kind: 'cut'; category: string; amount: string; save: string }
  | { kind: 'up'; category: string; pct: number; diff: string }
  | { kind: 'down'; category: string; pct: number }
  | { kind: 'budgets'; kept: number; total: number; over: string[] }
  | { kind: 'negative'; gap: string }
  | { kind: 'great'; rate: number }
  | { kind: 'noIncome' };

/** Баҳо аз рӯи ҳиссаи пасандоз: A ≥ 20%, B ≥ 10%, C ≥ 0%, D — хароҷот аз даромад зиёд */
export function gradeFor(income: string, expense: string): { grade: Grade | null; rate: number | null } {
  const inc = dec(income);
  if (inc.lte(0)) return { grade: null, rate: null };
  const rate = Math.round(inc.minus(expense).div(inc).times(100).toNumber());
  return { grade: rate >= 20 ? 'A' : rate >= 10 ? 'B' : rate >= 0 ? 'C' : 'D', rate };
}

/** Маслиҳатҳо аз рақамҳои моҳ (соф — барои тест) */
export function buildTips(
  s: { income: string; expense: string },
  cats: CategoryShare[],
  prevCats: CategoryShare[],
  budgets: { name: string; amount: string; spent: string }[],
): AdviceTip[] {
  const tips: AdviceTip[] = [];
  const { rate } = gradeFor(s.income, s.expense);
  if (rate === null && dec(s.expense).gt(0)) tips.push({ kind: 'noIncome' });
  if (rate !== null && rate < 0) tips.push({ kind: 'negative', gap: money(dec(s.expense).minus(s.income)) });
  const changes = categoryChanges(cats, prevCats, 10);
  const up = changes.find((c) => dec(c.diff).gt(0) && c.pct !== null && c.pct >= 15 && c.name !== '—');
  if (up) tips.push({ kind: 'up', category: up.name, pct: up.pct!, diff: money(up.diff) });
  const down = changes.find((c) => dec(c.diff).lt(0) && c.pct !== null && c.pct <= -15 && c.name !== '—');
  // «кам кунед» — барои калонтарин категорияе, ки аллакай кам нашудааст (то маслиҳатҳо зид набошанд)
  const top = cats.find((c) => c.name !== '—' && c.name !== down?.name);
  if (top && dec(top.amount).gt(0)) {
    tips.push({ kind: 'cut', category: top.name, amount: money(top.amount), save: money(dec(top.amount).times(0.1).toDecimalPlaces(2)) });
  }
  if (down) tips.push({ kind: 'down', category: down.name, pct: Math.abs(down.pct!) });
  if (budgets.length) {
    const over = budgets.filter((b) => dec(b.spent).gt(b.amount)).map((b) => b.name);
    tips.push({ kind: 'budgets', kept: budgets.length - over.length, total: budgets.length, over });
  }
  if (rate !== null && rate >= 20) tips.push({ kind: 'great', rate });
  return tips;
}

/** Маслиҳат барои моҳ (пешфарз — моҳи гузашта; агар он холӣ бошад — ҳамин моҳ то имрӯз) */
export async function monthAdvice(userId: string, month?: string, now = new Date()) {
  const today = todayKey(now);
  const current = today.slice(0, 7);
  let m = month ?? shiftDay(`${current}-01`, -1).slice(0, 7);
  let to = m === current ? today : lastDayOfMonth(m);
  let data = await monthExpenses(userId, `${m}-01`, to);
  if (!month && dec(data.summary.income).isZero() && dec(data.summary.expense).isZero()) {
    m = current;
    to = today;
    data = await monthExpenses(userId, `${m}-01`, to);
  }
  const prev = previousRange(`${m}-01`, to);
  const prevData = await monthExpenses(userId, prev.from, prev.to);
  // Буҷетҳо: хароҷоти ҳамон моҳ бо маҳдудиятҳои ҳозира
  const budgets = await prisma.budget.findMany({ where: { userId }, include: { category: { select: { name: true } } } });
  const spentBy = new Map(data.cats.map((c) => [c.categoryId, c.amount]));
  const b = budgets.map((x) => ({ name: x.category.name, amount: x.amount.toFixed(2), spent: spentBy.get(x.categoryId) ?? '0.00' }));
  const s = data.summary;
  const { grade, rate } = gradeFor(s.income, s.expense);
  return {
    month: m,
    partial: m === current,
    base: data.base as CurrencyCode,
    income: s.income,
    expense: s.expense,
    net: s.net,
    grade,
    savingsRate: rate,
    topCategories: data.cats.slice(0, 3).map((c) => ({ name: c.name, amount: c.amount, share: c.share })),
    tips: buildTips(s, data.cats, prevData.cats, b),
  };
}
