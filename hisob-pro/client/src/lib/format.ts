/**
 * Форматкунии маблағҳо бе float: сатри "1234567.5" → "1 234 567.50".
 * Ҳисобкуниҳо дар сервер бо Decimal иҷро мешаванд; клиент танҳо нишон медиҳад.
 */
import Decimal from 'decimal.js';
import type { Currency } from './types';

export const CURRENCY_SYMBOL: Record<Currency, string> = { TJS: 'смн', USD: '$', RUB: '₽' };

export function formatAmount(value: string | number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (value === null || value === undefined || value === '') return '0.00';
  let d: Decimal;
  try {
    d = new Decimal(String(value));
  } catch {
    return String(value);
  }
  const neg = d.isNegative() && !d.isZero();
  const [int, frac] = d.abs().toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = neg ? '−' : opts.sign && !d.isZero() ? '+' : '';
  return `${sign}${grouped}.${frac}`;
}

export function formatMoney(value: string | number | null | undefined, currency: Currency = 'TJS', opts: { sign?: boolean } = {}) {
  const s = formatAmount(value, opts);
  return currency === 'USD' ? `${s.replace(/^([−+]?)/, '$1$')}` : `${s} ${CURRENCY_SYMBOL[currency]}`;
}

/** Шакли кӯтоҳ барои графикҳо: 12.5K, 1.2M */
export function compact(value: number): string {
  const a = Math.abs(value);
  if (a >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${Math.round(value / 1000)}K`;
  if (a >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}

export function isPositive(v: string) {
  try {
    return new Decimal(v).gt(0);
  } catch {
    return false;
  }
}

export function isNegative(v: string) {
  try {
    return new Decimal(v).lt(0);
  } catch {
    return false;
  }
}

/** Санҷиши маблағи воридшуда дар клиент (ҳамон қоида, ки дар сервер) */
export function validAmount(input: string): boolean {
  const s = input.trim().replace(/\s+/g, '').replace(',', '.');
  return /^\d{1,16}(\.\d{1,2})?$/.test(s) && new Decimal(s).gt(0);
}

export function normalizeAmount(input: string): string {
  return input.trim().replace(/\s+/g, '').replace(',', '.');
}
