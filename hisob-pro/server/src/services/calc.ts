/**
 * Ҳисобкуниҳои софи молиявӣ (бе база). Ҳамаи ҳисоботҳо, балансҳо ва ҳолати қарзҳо аз ин ҷо мегузаранд,
 * бинобар ин онҳоро бо тестҳои автоматӣ пурра санҷидан мумкин аст.
 *
 * Қоидаҳо:
 *  - Танҳо INCOME ва EXPENSE дар даромад/хароҷот/фоида ҳисоб мешаванд.
 *  - TRANSFER_* ва DEBT_* танҳо ба баланси ҳисобҳо таъсир мерасонанд (дубора ҳисоб намешаванд).
 *  - Асъорҳои гуногун танҳо бо қурби муайяншуда ҷамъ карда мешаванд.
 */
import { CURRENCIES, convert, dec, Decimal, money, type CurrencyCode, type DecimalLike, type Rates } from '../lib/money.js';
import { dayKey, monthKey, todayKey, weekStart } from '../lib/dates.js';

export type TxTypeCode =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'DEBT_LENT'
  | 'DEBT_BORROWED'
  | 'DEBT_COLLECTED'
  | 'DEBT_REPAID';

export const TX_SIGN: Record<TxTypeCode, 1 | -1> = {
  INCOME: 1,
  EXPENSE: -1,
  TRANSFER_IN: 1,
  TRANSFER_OUT: -1,
  DEBT_LENT: -1,
  DEBT_BORROWED: 1,
  DEBT_COLLECTED: 1,
  DEBT_REPAID: -1,
};

export const isPnL = (t: TxTypeCode) => t === 'INCOME' || t === 'EXPENSE';

/** Таъсири амалиёт ба баланси ҳисоб (бо аломат) */
export function balanceDelta(type: TxTypeCode, amount: DecimalLike): Decimal {
  return dec(amount).times(TX_SIGN[type]);
}

export interface LedgerRow {
  type: TxTypeCode;
  amount: DecimalLike;
  currency: CurrencyCode;
  occurredAt: Date;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
}

export interface ViewOptions {
  base: CurrencyCode;
  rates: Rates;
  /** Агар муайян бошад — танҳо ҳамин асъор, бе табдил. Вагарна ҳама ба асъори асосӣ табдил дода мешавад. */
  currency?: CurrencyCode | null;
}

/** Маблағи сатрро дар "асъори намоиш" бармегардонад ё null (агар қурб набошад / асъор мувофиқ набошад) */
function viewAmount(row: { amount: DecimalLike; currency: CurrencyCode }, opts: ViewOptions): Decimal | null {
  if (opts.currency) return row.currency === opts.currency ? dec(row.amount) : null;
  return convert(row.amount, row.currency, opts.base, opts.rates);
}

export interface CurrencyTotals {
  income: string;
  expense: string;
  net: string;
  incomeCount: number;
  expenseCount: number;
}

export interface Summary extends CurrencyTotals {
  viewCurrency: CurrencyCode;
  byCurrency: Partial<Record<CurrencyCode, CurrencyTotals>>;
  /** Асъорҳое, ки қурб надоранд ва аз ҷамъи умумӣ хориҷ шудаанд */
  missingRates: CurrencyCode[];
}

export function summarize(rows: LedgerRow[], opts: ViewOptions): Summary {
  let income = new Decimal(0);
  let expense = new Decimal(0);
  let incomeCount = 0;
  let expenseCount = 0;
  const missing = new Set<CurrencyCode>();
  const per: Partial<Record<CurrencyCode, { income: Decimal; expense: Decimal; ic: number; ec: number }>> = {};

  for (const r of rows) {
    if (!isPnL(r.type)) continue;
    const c = (per[r.currency] ??= { income: new Decimal(0), expense: new Decimal(0), ic: 0, ec: 0 });
    if (r.type === 'INCOME') {
      c.income = c.income.plus(dec(r.amount));
      c.ic++;
    } else {
      c.expense = c.expense.plus(dec(r.amount));
      c.ec++;
    }

    const v = viewAmount(r, opts);
    if (v === null) {
      if (!opts.currency) missing.add(r.currency);
      continue;
    }
    if (r.type === 'INCOME') {
      income = income.plus(v);
      incomeCount++;
    } else {
      expense = expense.plus(v);
      expenseCount++;
    }
  }

  const byCurrency: Summary['byCurrency'] = {};
  for (const cur of CURRENCIES) {
    const c = per[cur];
    if (!c) continue;
    byCurrency[cur] = {
      income: money(c.income),
      expense: money(c.expense),
      net: money(c.income.minus(c.expense)),
      incomeCount: c.ic,
      expenseCount: c.ec,
    };
  }

  return {
    viewCurrency: opts.currency ?? opts.base,
    income: money(income),
    expense: money(expense),
    net: money(income.minus(expense)),
    incomeCount,
    expenseCount,
    byCurrency,
    missingRates: [...missing],
  };
}

export type Granularity = 'day' | 'week' | 'month';

export function bucketKey(d: Date, g: Granularity): string {
  if (g === 'day') return dayKey(d);
  if (g === 'month') return monthKey(d);
  return weekStart(dayKey(d));
}

export interface SeriesPoint {
  key: string;
  income: string;
  expense: string;
  net: string;
}

/** Силсилаи вақтӣ барои графикҳо. keys — ҳамаи бакетҳо (ҳатто холӣ) бо тартиб. */
export function buildSeries(rows: LedgerRow[], keys: string[], g: Granularity, opts: ViewOptions): SeriesPoint[] {
  const map = new Map<string, { income: Decimal; expense: Decimal }>();
  for (const k of keys) map.set(k, { income: new Decimal(0), expense: new Decimal(0) });

  for (const r of rows) {
    if (!isPnL(r.type)) continue;
    const v = viewAmount(r, opts);
    if (v === null) continue;
    const b = map.get(bucketKey(r.occurredAt, g));
    if (!b) continue;
    if (r.type === 'INCOME') b.income = b.income.plus(v);
    else b.expense = b.expense.plus(v);
  }

  return keys.map((key) => {
    const b = map.get(key)!;
    return { key, income: money(b.income), expense: money(b.expense), net: money(b.income.minus(b.expense)) };
  });
}

export interface CategoryShare {
  categoryId: string | null;
  name: string;
  color: string;
  amount: string;
  count: number;
  /** фоиз аз ҷамъ, бо 1 рақами даҳӣ */
  share: string;
}

export function categoryBreakdown(rows: LedgerRow[], kind: 'INCOME' | 'EXPENSE', opts: ViewOptions): CategoryShare[] {
  const map = new Map<string, { id: string | null; name: string; color: string; amount: Decimal; count: number }>();
  let total = new Decimal(0);
  for (const r of rows) {
    if (r.type !== kind) continue;
    const v = viewAmount(r, opts);
    if (v === null) continue;
    const key = r.categoryId ?? '__none__';
    const e = (map.get(key) ??
      map
        .set(key, {
          id: r.categoryId ?? null,
          name: r.categoryName ?? '—',
          color: r.categoryColor ?? '#64748b',
          amount: new Decimal(0),
          count: 0,
        })
        .get(key))!;
    e.amount = e.amount.plus(v);
    e.count++;
    total = total.plus(v);
  }
  return [...map.values()]
    .sort((a, b) => b.amount.comparedTo(a.amount))
    .map((e) => ({
      categoryId: e.id,
      name: e.name,
      color: e.color,
      amount: money(e.amount),
      count: e.count,
      share: total.isZero() ? '0.0' : e.amount.div(total).times(100).toDecimalPlaces(1).toFixed(1),
    }));
}

/* ----------------------------- Балансҳо ----------------------------- */

export interface AccountLike {
  id: string;
  currency: CurrencyCode;
  initialBalance: DecimalLike;
}

export interface DeltaRow {
  accountId: string;
  type: TxTypeCode;
  amount: DecimalLike;
}

/** Баланс = баланси аввала + Σ(аломат × маблағ) барои ҳамаи амалиётҳо */
export function computeBalances(accounts: AccountLike[], rows: DeltaRow[]): Map<string, Decimal> {
  const m = new Map<string, Decimal>();
  for (const a of accounts) m.set(a.id, dec(a.initialBalance));
  for (const r of rows) {
    const cur = m.get(r.accountId);
    if (cur === undefined) continue;
    m.set(r.accountId, cur.plus(balanceDelta(r.type, r.amount)));
  }
  return m;
}

export interface TotalBalance {
  base: CurrencyCode;
  /** ҷамъ дар асъори асосӣ — танҳо аз ҳисобҳое, ки қурб доранд */
  total: string;
  byCurrency: Partial<Record<CurrencyCode, string>>;
  missingRates: CurrencyCode[];
}

export function totalBalance(
  accounts: AccountLike[],
  balances: Map<string, Decimal>,
  base: CurrencyCode,
  rates: Rates,
): TotalBalance {
  const per: Partial<Record<CurrencyCode, Decimal>> = {};
  for (const a of accounts) per[a.currency] = (per[a.currency] ?? new Decimal(0)).plus(balances.get(a.id) ?? 0);
  let total = new Decimal(0);
  const missing: CurrencyCode[] = [];
  const byCurrency: TotalBalance['byCurrency'] = {};
  for (const cur of CURRENCIES) {
    const v = per[cur];
    if (v === undefined) continue;
    byCurrency[cur] = money(v);
    const c = convert(v, cur, base, rates);
    if (c === null) missing.push(cur);
    else total = total.plus(c);
  }
  return { base, total: money(total), byCurrency, missingRates: missing };
}

/* ----------------------------- Қарзҳо ----------------------------- */

export type DebtStatus = 'ACTIVE' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface DebtState {
  paid: string;
  remaining: string;
  status: DebtStatus;
  progress: string; // фоизи пардохт
}

export function debtState(
  debt: { amount: DecimalLike; dueDate?: Date | null },
  payments: { amount: DecimalLike }[],
  now = new Date(),
): DebtState {
  const total = dec(debt.amount);
  const paid = payments.reduce<Decimal>((a, p) => a.plus(dec(p.amount)), new Decimal(0));
  let remaining = total.minus(paid);
  if (remaining.lt(0)) remaining = new Decimal(0);

  let status: DebtStatus;
  if (remaining.lte(0)) status = 'PAID';
  else if (debt.dueDate && dayKey(debt.dueDate) < todayKey(now)) status = 'OVERDUE';
  else if (paid.gt(0)) status = 'PARTIAL';
  else status = 'ACTIVE';

  return {
    paid: money(paid),
    remaining: money(remaining),
    status,
    progress: total.isZero() ? '100.0' : Decimal.min(paid.div(total).times(100), 100).toDecimalPlaces(1).toFixed(1),
  };
}

export interface DebtLike {
  direction: 'LENT' | 'BORROWED';
  amount: DecimalLike;
  currency: CurrencyCode;
  dueDate?: Date | null;
  payments: { amount: DecimalLike }[];
}

/** Ҷамъбасти қарзҳои кушода (бақия) дар асъори асосӣ */
export function summarizeDebts(debts: DebtLike[], base: CurrencyCode, rates: Rates, now = new Date()) {
  let lent = new Decimal(0);
  let borrowed = new Decimal(0);
  let lentCount = 0;
  let borrowedCount = 0;
  let overdue = 0;
  const per: Partial<Record<CurrencyCode, { lent: Decimal; borrowed: Decimal }>> = {};
  const missing = new Set<CurrencyCode>();
  for (const d of debts) {
    const s = debtState(d, d.payments, now);
    if (s.status === 'PAID') continue;
    if (s.status === 'OVERDUE') overdue++;
    const rem = dec(s.remaining);
    const bc = (per[d.currency] ??= { lent: new Decimal(0), borrowed: new Decimal(0) });
    const c = convert(rem, d.currency, base, rates);
    if (c === null) missing.add(d.currency);
    if (d.direction === 'LENT') {
      lentCount++;
      bc.lent = bc.lent.plus(rem);
      if (c) lent = lent.plus(c);
    } else {
      borrowedCount++;
      bc.borrowed = bc.borrowed.plus(rem);
      if (c) borrowed = borrowed.plus(c);
    }
  }
  const byCurrency: Partial<Record<CurrencyCode, { lent: string; borrowed: string }>> = {};
  for (const cur of CURRENCIES) {
    const v = per[cur];
    if (v) byCurrency[cur] = { lent: money(v.lent), borrowed: money(v.borrowed) };
  }
  return {
    base,
    lent: { remaining: money(lent), count: lentCount },
    borrowed: { remaining: money(borrowed), count: borrowedCount },
    /** Мавқеи софи қарзӣ: ба ман қарздоранд − ман қарздорам */
    net: money(lent.minus(borrowed)),
    overdue,
    byCurrency,
    missingRates: [...missing],
  };
}
