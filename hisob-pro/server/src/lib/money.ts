/**
 * Ҳисобкунии пулӣ танҳо бо Decimal (decimal.js). Ҳеҷ гоҳ float истифода намешавад.
 */
import { Decimal } from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type DecimalLike = Decimal | string | number | { toString(): string };

export const CURRENCIES = ['TJS', 'USD', 'RUB'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const ZERO = new Decimal(0);

export function dec(v: DecimalLike | null | undefined): Decimal {
  if (v === null || v === undefined) return new Decimal(0);
  if (v instanceof Decimal) return v;
  return new Decimal(typeof v === 'number' ? v : v.toString());
}

/** Маблағро ба 2 рақами баъди вергул яклухт мекунад ва ҳамчун сатр бармегардонад. */
export function money(v: DecimalLike): string {
  return dec(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function sum(values: DecimalLike[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0));
}

/** Сатр/рақамро ҳамчун маблағи мусбат бо ҳадди аксар 2 рақами даҳӣ санҷида, Decimal бармегардонад. */
export function parseAmount(input: unknown): Decimal | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const s = String(input).trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(s)) return null;
  const d = new Decimal(s);
  if (d.lte(0)) return null;
  return d;
}

export type Rates = Partial<Record<CurrencyCode, DecimalLike>>;

/**
 * Маблағро ба асъори асосӣ табдил медиҳад. Агар қурб муайян нашуда бошад, null бармегардонад
 * (асъорҳои гуногун бе қурб ҷамъ карда намешаванд).
 */
export function convert(
  amount: DecimalLike,
  from: CurrencyCode,
  base: CurrencyCode,
  rates: Rates,
): Decimal | null {
  if (from === base) return dec(amount);
  const r = rates[from];
  if (r === undefined || r === null) return null;
  const rate = dec(r);
  if (rate.lte(0)) return null;
  return dec(amount).times(rate);
}
