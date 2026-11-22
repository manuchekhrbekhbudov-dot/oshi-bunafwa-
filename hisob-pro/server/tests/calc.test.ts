import { describe, expect, it } from 'vitest';
import {
  buildSeries,
  categoryBreakdown,
  computeBalances,
  debtState,
  summarize,
  summarizeDebts,
  totalBalance,
  type LedgerRow,
} from '../src/services/calc.js';
import { parseLocalDateTime } from '../src/lib/dates.js';

const at = (s: string) => parseLocalDateTime(s)!;
const base = { base: 'TJS' as const, rates: {} };

const rows: LedgerRow[] = [
  { type: 'INCOME', amount: '1000.00', currency: 'TJS', occurredAt: at('2026-11-20T09:00'), categoryId: 'c1', categoryName: 'Маош' },
  { type: 'INCOME', amount: '250.50', currency: 'TJS', occurredAt: at('2026-11-21T10:00'), categoryId: 'c2', categoryName: 'Савдо' },
  { type: 'EXPENSE', amount: '120.25', currency: 'TJS', occurredAt: at('2026-11-21T12:00'), categoryId: 'e1', categoryName: 'Хӯрок' },
  { type: 'EXPENSE', amount: '379.75', currency: 'TJS', occurredAt: at('2026-11-21T23:59'), categoryId: 'e2', categoryName: 'Иҷора' },
  // Интиқол ва қарзҳо набояд ба даромад/хароҷот дохил шаванд
  { type: 'TRANSFER_OUT', amount: '500.00', currency: 'TJS', occurredAt: at('2026-11-21T13:00') },
  { type: 'TRANSFER_IN', amount: '500.00', currency: 'TJS', occurredAt: at('2026-11-21T13:00') },
  { type: 'DEBT_LENT', amount: '300.00', currency: 'TJS', occurredAt: at('2026-11-21T14:00') },
  { type: 'DEBT_BORROWED', amount: '700.00', currency: 'TJS', occurredAt: at('2026-11-21T15:00') },
  { type: 'DEBT_COLLECTED', amount: '100.00', currency: 'TJS', occurredAt: at('2026-11-21T16:00') },
  { type: 'DEBT_REPAID', amount: '50.00', currency: 'TJS', occurredAt: at('2026-11-21T17:00') },
];

describe('summarize', () => {
  it('Натиҷа = Даромад − Хароҷот; интиқол ва қарзҳо ҳисоб намешаванд', () => {
    const s = summarize(rows, base);
    expect(s.income).toBe('1250.50');
    expect(s.expense).toBe('500.00');
    expect(s.net).toBe('750.50');
    expect(s.incomeCount).toBe(2);
    expect(s.expenseCount).toBe(2);
    expect(s.missingRates).toEqual([]);
  });

  it('асъорҳои бе қурб аз ҷамъ хориҷ ва қайд карда мешаванд', () => {
    const r: LedgerRow[] = [
      ...rows,
      { type: 'INCOME', amount: '100.00', currency: 'USD', occurredAt: at('2026-11-21T10:00') },
    ];
    const s = summarize(r, base);
    expect(s.income).toBe('1250.50');
    expect(s.missingRates).toEqual(['USD']);
    expect(s.byCurrency.USD?.income).toBe('100.00');
    expect(s.byCurrency.TJS?.income).toBe('1250.50');
  });

  it('бо қурб ба асъори асосӣ табдил дода мешавад', () => {
    const r: LedgerRow[] = [
      { type: 'INCOME', amount: '100.00', currency: 'USD', occurredAt: at('2026-11-21T10:00') },
      { type: 'EXPENSE', amount: '1000.00', currency: 'RUB', occurredAt: at('2026-11-21T10:00') },
    ];
    const s = summarize(r, { base: 'TJS', rates: { USD: '10.95', RUB: '0.1234' } });
    expect(s.income).toBe('1095.00');
    expect(s.expense).toBe('123.40');
    expect(s.net).toBe('971.60');
  });

  it('филтри як асъор — бе табдил', () => {
    const r: LedgerRow[] = [
      ...rows,
      { type: 'INCOME', amount: '100.00', currency: 'USD', occurredAt: at('2026-11-21T10:00') },
    ];
    const s = summarize(r, { ...base, currency: 'USD' });
    expect(s.income).toBe('100.00');
    expect(s.expense).toBe('0.00');
    expect(s.viewCurrency).toBe('USD');
    expect(s.missingRates).toEqual([]);
  });
});

describe('buildSeries', () => {
  it('рӯзҳои холӣ бо 0 пур мешаванд, рӯзҳо аз рӯи вақти Душанбе', () => {
    const s = buildSeries(rows, ['2026-11-19', '2026-11-20', '2026-11-21'], 'day', base);
    expect(s).toEqual([
      { key: '2026-11-19', income: '0.00', expense: '0.00', net: '0.00' },
      { key: '2026-11-20', income: '1000.00', expense: '0.00', net: '1000.00' },
      { key: '2026-11-21', income: '250.50', expense: '500.00', net: '-249.50' },
    ]);
  });

  it('моҳона', () => {
    const s = buildSeries(rows, ['2026-10', '2026-11'], 'month', base);
    expect(s[1]).toEqual({ key: '2026-11', income: '1250.50', expense: '500.00', net: '750.50' });
    expect(s[0].income).toBe('0.00');
  });
});

describe('categoryBreakdown', () => {
  it('категорияи бештар сарфшуда аввал, ҳиссаҳо дуруст', () => {
    const c = categoryBreakdown(rows, 'EXPENSE', base);
    expect(c.map((x) => x.name)).toEqual(['Иҷора', 'Хӯрок']);
    expect(c[0].amount).toBe('379.75');
    expect(c[0].share).toBe('76.0');
    expect(c[1].share).toBe('24.1');
  });
});

describe('balances', () => {
  const accounts = [
    { id: 'cash', currency: 'TJS' as const, initialBalance: '100.00' },
    { id: 'card', currency: 'TJS' as const, initialBalance: '0' },
    { id: 'usd', currency: 'USD' as const, initialBalance: '50.00' },
  ];

  it('баланс = аввала + даромад − хароҷот ± интиқол ± қарз', () => {
    const b = computeBalances(accounts, [
      { accountId: 'cash', type: 'INCOME', amount: '1000' },
      { accountId: 'cash', type: 'EXPENSE', amount: '200.50' },
      { accountId: 'cash', type: 'TRANSFER_OUT', amount: '300' },
      { accountId: 'card', type: 'TRANSFER_IN', amount: '300' },
      { accountId: 'cash', type: 'DEBT_LENT', amount: '100' },
      { accountId: 'cash', type: 'DEBT_COLLECTED', amount: '40' },
      { accountId: 'card', type: 'DEBT_BORROWED', amount: '500' },
      { accountId: 'card', type: 'DEBT_REPAID', amount: '125.25' },
      { accountId: 'unknown', type: 'INCOME', amount: '999' },
    ]);
    expect(b.get('cash')!.toFixed(2)).toBe('539.50');
    expect(b.get('card')!.toFixed(2)).toBe('674.75');
    expect(b.get('usd')!.toFixed(2)).toBe('50.00');
  });

  it('интиқол баланси умумиро тағйир намедиҳад', () => {
    const before = computeBalances(accounts.slice(0, 2), []);
    const after = computeBalances(accounts.slice(0, 2), [
      { accountId: 'cash', type: 'TRANSFER_OUT', amount: '77.77' },
      { accountId: 'card', type: 'TRANSFER_IN', amount: '77.77' },
    ]);
    expect(totalBalance(accounts.slice(0, 2), after, 'TJS', {}).total).toBe(
      totalBalance(accounts.slice(0, 2), before, 'TJS', {}).total,
    );
  });

  it('баланси умумӣ: асъори бе қурб ҷамъ карда намешавад', () => {
    const b = computeBalances(accounts, []);
    const t = totalBalance(accounts, b, 'TJS', {});
    expect(t.total).toBe('100.00');
    expect(t.missingRates).toEqual(['USD']);
    expect(t.byCurrency).toEqual({ TJS: '100.00', USD: '50.00' });
    expect(totalBalance(accounts, b, 'TJS', { USD: '11' }).total).toBe('650.00');
  });
});

describe('debts', () => {
  const now = new Date('2026-11-22T06:00:00Z');
  it('ҳолатҳо: фаъол, қисман, пурра, муҳлатгузашта', () => {
    expect(debtState({ amount: '1000' }, [], now).status).toBe('ACTIVE');
    const partial = debtState({ amount: '1000' }, [{ amount: '250.50' }, { amount: '100' }], now);
    expect(partial).toEqual({ paid: '350.50', remaining: '649.50', status: 'PARTIAL', progress: '35.1' });
    expect(debtState({ amount: '1000' }, [{ amount: '600' }, { amount: '400' }], now).status).toBe('PAID');
    expect(debtState({ amount: '1000', dueDate: at('2026-11-21') }, [{ amount: '1' }], now).status).toBe('OVERDUE');
    // Рӯзи муҳлат худаш ҳанӯз муҳлатгузашта нест
    expect(debtState({ amount: '1000', dueDate: at('2026-11-22') }, [], now).status).toBe('ACTIVE');
    // Пурра пардохтшуда ҳеҷ гоҳ муҳлатгузашта нест
    expect(debtState({ amount: '10', dueDate: at('2020-01-01') }, [{ amount: '10' }], now).status).toBe('PAID');
  });

  it('ҷамъбасти қарзҳо', () => {
    const s = summarizeDebts(
      [
        { direction: 'LENT', amount: '1000', currency: 'TJS', payments: [{ amount: '400' }] },
        { direction: 'LENT', amount: '100', currency: 'USD', payments: [] },
        { direction: 'BORROWED', amount: '300', currency: 'TJS', payments: [], dueDate: at('2026-01-01') },
        { direction: 'BORROWED', amount: '50', currency: 'TJS', payments: [{ amount: '50' }] },
      ],
      'TJS',
      { USD: '10' },
      now,
    );
    expect(s.lent).toEqual({ remaining: '1600.00', count: 2 });
    expect(s.borrowed).toEqual({ remaining: '300.00', count: 1 });
    expect(s.net).toBe('1300.00');
    expect(s.overdue).toBe(1);
    expect(s.byCurrency.USD).toEqual({ lent: '100.00', borrowed: '0.00' });
  });
});
