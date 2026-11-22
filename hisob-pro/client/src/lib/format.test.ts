import { describe, expect, it } from 'vitest';
import { formatAmount, formatMoney, validAmount } from './format';
import { dayKey, monthEnd, shiftDay, toLocalInput, weekStart } from './dates';

describe('format', () => {
  it('гурӯҳбандии рақамҳо бе float', () => {
    expect(formatAmount('1234567.5')).toBe('1 234 567.50');
    expect(formatAmount('0.1')).toBe('0.10');
    expect(formatAmount('-50')).toBe('−50.00');
    expect(formatAmount('50', { sign: true })).toBe('+50.00');
    expect(formatMoney('10', 'TJS')).toBe('10.00 смн');
    expect(formatMoney('10', 'USD')).toBe('$10.00');
  });
  it('validAmount', () => {
    expect(validAmount('12,50')).toBe(true);
    expect(validAmount('0')).toBe(false);
    expect(validAmount('1.234')).toBe(false);
  });
});

describe('dates (Asia/Dushanbe)', () => {
  it('рӯзи Душанбе', () => {
    expect(dayKey(new Date('2026-01-01T19:30:00Z'))).toBe('2026-01-02');
    expect(toLocalInput(new Date('2026-01-01T19:30:00Z'))).toBe('2026-01-02T00:30');
  });
  it('арифметикаи сана', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(monthEnd('2024-02-10')).toBe('2024-02-29');
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
  });
});
