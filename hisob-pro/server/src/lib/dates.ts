/**
 * Кор бо сана дар минтақаи вақти Asia/Dushanbe.
 * Дар база ҳама вақт UTC нигоҳ дошта мешавад; "рӯз", "ҳафта", "моҳ" аз рӯи вақти Душанбе муайян мешаванд.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { addDays, addMonths, parseISO } from 'date-fns';
import { config } from '../config.js';

export const TZ = config.timeZone;

/** 'yyyy-MM-dd' дар минтақаи Душанбе */
export function dayKey(d: Date, tz = TZ): string {
  return formatInTimeZone(d, tz, 'yyyy-MM-dd');
}

export function monthKey(d: Date, tz = TZ): string {
  return formatInTimeZone(d, tz, 'yyyy-MM');
}

export function isDayString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISO(s);
  return !Number.isNaN(d.getTime()) && formatPlain(d) === s;
}

function formatPlain(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Ибтидои рӯз (00:00 бо вақти Душанбе) ҳамчун UTC Date */
export function startOfDayTz(day: string, tz = TZ): Date {
  return fromZonedTime(`${day}T00:00:00`, tz);
}

/** Ибтидои рӯзи баъдӣ — ҳудуди болоии (exclusive) рӯз */
export function endOfDayExclusiveTz(day: string, tz = TZ): Date {
  return startOfDayTz(shiftDay(day, 1), tz);
}

export function shiftDay(day: string, n: number): string {
  return formatPlain(addDays(parseISO(day), n));
}

export function shiftMonth(month: string, n: number): string {
  const d = addMonths(parseISO(`${month}-01`), n);
  return formatPlain(d).slice(0, 7);
}

export function todayKey(now = new Date(), tz = TZ): string {
  return dayKey(now, tz);
}

/** Рӯйхати рӯзҳо аз from то to (ҳарду дохил) */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 4000) {
    out.push(cur);
    cur = shiftDay(cur, 1);
    guard++;
  }
  return out;
}

export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let cur = fromMonth;
  let guard = 0;
  while (cur <= toMonth && guard < 600) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
    guard++;
  }
  return out;
}

/** Душанбеи ҳафтаи санаи додашуда (ҳафта аз душанбе сар мешавад) */
export function weekStart(day: string): string {
  const d = parseISO(day);
  const dow = (d.getDay() + 6) % 7; // 0 = душанбе
  return shiftDay(day, -dow);
}

/** Санаи 'yyyy-MM-ddTHH:mm' (вақти Душанбе) ё ISO-и пурра → Date (UTC) */
export function parseLocalDateTime(input: string, tz = TZ): Date | null {
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isDayString(s) ? fromZonedTime(`${s}T12:00:00`, tz) : null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    if (!isDayString(s.slice(0, 10))) return null;
    const d = fromZonedTime(s.length === 16 ? `${s}:00` : s, tz);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // ISO бо минтақа (Z ё +05:00)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatLocal(d: Date, pattern = 'yyyy-MM-dd HH:mm', tz = TZ): string {
  return formatInTimeZone(d, tz, pattern);
}
