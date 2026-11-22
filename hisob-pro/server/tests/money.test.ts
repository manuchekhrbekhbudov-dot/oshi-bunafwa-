import { describe, expect, it } from 'vitest';
import { convert, dec, money, parseAmount, sum } from '../src/lib/money.js';

describe('money (decimal)', () => {
  it('0.1 + 0.2 = 0.30 — бе хатогии float', () => {
    expect(money(sum(['0.1', '0.2']))).toBe('0.30');
    expect(money(sum(Array(10).fill('0.10')))).toBe('1.00');
  });

  it('яклухткунии ROUND_HALF_UP то 2 рақам', () => {
    expect(money('2.345')).toBe('2.35');
    expect(money('2.344')).toBe('2.34');
    expect(money('-2.345')).toBe('-2.35');
  });

  it('маблағҳои калон дақиқ мемонанд', () => {
    expect(money(sum(['9999999999999999.99', '0.01']))).toBe('10000000000000000.00');
  });

  it('parseAmount: танҳо мусбат, то 2 рақами даҳӣ', () => {
    expect(parseAmount('100')?.toFixed(2)).toBe('100.00');
    expect(parseAmount('100,5')?.toFixed(2)).toBe('100.50');
    expect(parseAmount('1 250.75')?.toFixed(2)).toBe('1250.75');
    expect(parseAmount(12.5)?.toFixed(2)).toBe('12.50');
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('1.234')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1e5')).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });

  it('convert: бе қурб null бармегардонад (асъорҳо ҷамъ карда намешаванд)', () => {
    expect(convert('10', 'USD', 'TJS', {})).toBeNull();
    expect(convert('10', 'TJS', 'TJS', {})?.toString()).toBe('10');
    expect(money(convert('10', 'USD', 'TJS', { USD: '10.95' })!)).toBe('109.50');
    expect(convert('10', 'USD', 'TJS', { USD: '0' })).toBeNull();
  });

  it('dec: null → 0', () => {
    expect(dec(null).toString()).toBe('0');
  });
});
