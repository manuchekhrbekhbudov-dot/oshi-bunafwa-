import { describe, expect, it } from 'vitest';
import {
  dayKey,
  daysBetween,
  endOfDayExclusiveTz,
  isDayString,
  monthsBetween,
  parseLocalDateTime,
  shiftMonth,
  startOfDayTz,
  weekStart,
} from '../src/lib/dates.js';

describe('dates (Asia/Dushanbe, UTC+5)', () => {
  it('рӯз аз рӯи вақти Душанбе муайян мешавад, на UTC', () => {
    // 2026-01-01 19:30 UTC = 2026-01-02 00:30 дар Душанбе
    expect(dayKey(new Date('2026-01-01T19:30:00Z'))).toBe('2026-01-02');
    expect(dayKey(new Date('2026-01-01T18:59:59Z'))).toBe('2026-01-01');
  });

  it('ҳудуди рӯз', () => {
    expect(startOfDayTz('2026-03-15').toISOString()).toBe('2026-03-14T19:00:00.000Z');
    expect(endOfDayExclusiveTz('2026-03-15').toISOString()).toBe('2026-03-15T19:00:00.000Z');
  });

  it('parseLocalDateTime вақти маҳаллиро ба UTC табдил медиҳад', () => {
    expect(parseLocalDateTime('2026-03-15T10:30')?.toISOString()).toBe('2026-03-15T05:30:00.000Z');
    expect(parseLocalDateTime('2026-03-15T10:30:00Z')?.toISOString()).toBe('2026-03-15T10:30:00.000Z');
    expect(parseLocalDateTime('2026-02-30T10:00')).toBeNull();
    expect(parseLocalDateTime('kecha')).toBeNull();
  });

  it('isDayString', () => {
    expect(isDayString('2024-02-29')).toBe(true);
    expect(isDayString('2025-02-29')).toBe(false);
    expect(isDayString('2025-13-01')).toBe(false);
  });

  it('ҳафта аз душанбе сар мешавад', () => {
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // якшанбе → душанбе
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
  });

  it('рӯйхати рӯзҳо ва моҳҳо', () => {
    expect(daysBetween('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(shiftMonth('2026-01', -11)).toBe('2025-02');
  });
});
