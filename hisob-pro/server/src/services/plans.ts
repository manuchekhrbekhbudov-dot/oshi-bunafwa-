/**
 * Нақшаҳо: мақсадҳои пасандоз ва пардохтҳои доимӣ (ҳисобкунии соф — бе база, барои тестҳо осон).
 */
import type { Goal, GoalContribution, RecurringPayment } from '@prisma/client';
import { daysBetween, shiftDay, todayKey } from '../lib/dates.js';
import { dec, money, sum } from '../lib/money.js';

/* ------------------------------ Мақсадҳо ------------------------------ */

export function goalStats(g: Pick<Goal, 'target' | 'deadline'> & { monthly?: Goal['monthly'] }, contributions: Pick<GoalContribution, 'amount'>[], today = todayKey()) {
  const saved = sum(contributions.map((c) => c.amount));
  const target = dec(g.target);
  const remaining = target.minus(saved);
  const progress = target.gt(0) ? Math.max(0, Math.min(100, Math.floor(saved.div(target).times(100).toNumber()))) : 0;
  let daysLeft: number | null = null;
  let perDay: string | null = null;
  let perMonth: string | null = null;
  if (g.deadline) {
    // deadline = охири рӯз (оғози рӯзи навбатӣ) → 1 мс пеш — худи санаи охир
    const end = todayKey(new Date(g.deadline.getTime() - 1));
    daysLeft = end >= today ? daysBetween(today, end).length : 0;
    if (remaining.gt(0) && daysLeft > 0) {
      perDay = money(remaining.div(daysLeft).toDecimalPlaces(2, 0));
      // моҳи миёна = 30.44 рӯз; агар камтар аз як моҳ монда бошад — ҳамаи боқимонда дар ҳамин моҳ
      perMonth = money(remaining.div(Math.max(1, daysLeft / 30.4375)).toDecimalPlaces(2, 0));
    }
  }
  // Корбар худаш: «ҳар моҳ X ҷамъ карда метавонам» → чанд моҳ лозим ва санаи тахминӣ
  const monthly = g.monthly && dec(g.monthly).gt(0) ? dec(g.monthly) : null;
  let monthsNeeded: number | null = null;
  let etaDate: string | null = null;
  if (monthly && remaining.gt(0)) {
    monthsNeeded = remaining.div(monthly).ceil().toNumber();
    etaDate = addMonths(today, monthsNeeded);
  }
  // Бо маблағи интихобшуда то санаи мақсад намерасад
  const lateForDeadline = !!(etaDate && g.deadline && etaDate > todayKey(new Date(g.deadline.getTime() - 1)));
  return {
    saved: money(saved),
    remaining: money(remaining.lt(0) ? 0 : remaining),
    monthly: monthly ? money(monthly) : null,
    monthsNeeded,
    etaDate,
    lateForDeadline,
    progress,
    achieved: saved.gte(target),
    daysLeft,
    perDay,
    perMonth,
  };
}

/** '2026-11-30' + 3 моҳ → '2027-02-28' */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/* ------------------------------ Пардохтҳои доимӣ ------------------------------ */

const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Рӯзи пардохт дар моҳи додашуда (31 → 30/28, агар моҳ кӯтоҳ бошад) */
export function dueDay(month: string, dayOfMonth: number): string {
  const d = Math.min(Math.max(1, dayOfMonth), daysInMonth(month));
  return `${month}-${String(d).padStart(2, '0')}`;
}

export type RecurringStatus = 'paid' | 'skipped' | 'due' | 'overdue' | 'upcoming';

/** Ҳолати ин моҳ: сабт шуд / гузаронида шуд / имрӯз / гузашт / дар пеш */
export function recurringStatus(
  r: Pick<RecurringPayment, 'dayOfMonth' | 'lastPaidKey' | 'lastSkipKey'>,
  today = todayKey(),
): { status: RecurringStatus; dueDate: string; nextDate: string; daysUntil: number } {
  const month = today.slice(0, 7);
  const dueDate = dueDay(month, r.dayOfMonth);
  const nextMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 7);
  const done = r.lastPaidKey === month ? 'paid' : r.lastSkipKey === month ? 'skipped' : null;
  const status: RecurringStatus = done ?? (dueDate === today ? 'due' : dueDate < today ? 'overdue' : 'upcoming');
  const nextDate = done || dueDate < today ? (done ? dueDay(nextMonth, r.dayOfMonth) : dueDate) : dueDate;
  const daysUntil = nextDate >= today ? daysBetween(today, nextDate).length - 1 : -(daysBetween(nextDate, today).length - 1);
  return { status, dueDate, nextDate, daysUntil };
}

/** Ёдраскунӣ: аз рӯзи пардохт (≥09:00), агар ин моҳ ҳанӯз сабт/гузаронида нашуда ва ёдрас карда нашуда бошад */
export function recurringReminderDue(
  r: Pick<RecurringPayment, 'active' | 'dayOfMonth' | 'lastPaidKey' | 'lastSkipKey' | 'lastRemindKey'>,
  today: string,
  hour: number,
): boolean {
  const month = today.slice(0, 7);
  if (!r.active || hour < 9) return false;
  if (r.lastPaidKey === month || r.lastSkipKey === month || r.lastRemindKey === month) return false;
  const due = dueDay(month, r.dayOfMonth);
  // то 5 рӯз баъд аз мӯҳлат ҳам (агар сервер дар он рӯз хоб буд)
  return today >= due && today <= shiftDay(due, 5);
}
