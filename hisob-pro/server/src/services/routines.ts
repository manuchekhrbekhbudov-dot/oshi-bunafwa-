/**
 * Ҷадвали рӯз: ҷойҳое, ки корбар мунтазам меравад (кор, иловагӣ, бозор…).
 * Корбар соати даромадан ва баромаданро менависад; бот 5 дақиқа пеш аз баромадан хабар медиҳад:
 * «ҳозир мебароед — лутфан пардохти хароҷотро сабт кунед».
 * Ҳамаи вақтҳо — Asia/Dushanbe.
 */
import { formatInTimeZone } from 'date-fns-tz';
import type { Routine } from '@prisma/client';
import { TZ } from '../lib/dates.js';

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "9:5", "09.30", "16:00" → "HH:mm" ё null */
export function normalizeTime(input: string): string | null {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(input);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** "7135" → "1357" (такрор ва рақамҳои нодуруст хориҷ мешаванд) */
export function normalizeDays(days: string): string {
  return [...new Set(days.split('').filter((d) => /[1-7]/.test(d)))].sort().join('');
}

/** Санаи имрӯз, рӯзи ҳафта (1 = душанбе) ва дақиқаи ҷорӣ дар Душанбе */
export function localClock(now: Date) {
  return {
    day: formatInTimeZone(now, TZ, 'yyyy-MM-dd'),
    weekday: formatInTimeZone(now, TZ, 'i'),
    minutes: toMinutes(formatInTimeZone(now, TZ, 'HH:mm')),
  };
}

type RoutineTimes = Pick<Routine, 'days' | 'leaveTime' | 'remindBefore' | 'active' | 'lastLeaveDay'>;

/**
 * Оё ҳозир вақти хабар аст? Аз (соати баромадан − N дақиқа) то худи соати баромадан,
 * дар рӯзҳои интихобшуда ва танҳо як бор дар рӯз (lastLeaveDay).
 */
export function routineDue(r: RoutineTimes, now: Date): { leave: boolean; day: string } {
  const c = localClock(now);
  if (!r.active || !r.days.includes(c.weekday)) return { leave: false, day: c.day };
  const leave = toMinutes(r.leaveTime);
  const from = Math.max(0, leave - Math.max(0, r.remindBefore));
  return { leave: r.lastLeaveDay !== c.day && c.minutes >= from && c.minutes <= leave, day: c.day };
}

/** Агар ҷой дар рӯзи имрӯз пас аз вақти хабар илова шавад — хабари "кӯҳна" фиристода намешавад */
export function initialMarks(r: Pick<Routine, 'leaveTime' | 'remindBefore'>, now: Date) {
  const c = localClock(now);
  return { lastLeaveDay: c.minutes > toMinutes(r.leaveTime) - Math.max(0, r.remindBefore) ? c.day : null };
}

export function serializeRoutine(r: Routine & { category?: { name: string } | null }) {
  return {
    id: r.id,
    title: r.title,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    days: r.days,
    arriveTime: r.arriveTime,
    leaveTime: r.leaveTime,
    remindBefore: r.remindBefore,
    active: r.active,
  };
}
