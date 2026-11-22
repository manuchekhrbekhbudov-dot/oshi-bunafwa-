import { describe, expect, it } from 'vitest';
import {
  alertMessage,
  dailyMessage,
  effectiveDailyLimit,
  fmt,
  isOverLimit,
  parseUserAmount,
  percentOf,
} from '../src/services/telegram/insights.js';
import type { Summary } from '../src/services/calc.js';

const S = (income: string, expense: string, ic = 1, ec = 1): Summary => ({
  viewCurrency: 'TJS', income, expense, net: (Number(income) - Number(expense)).toFixed(2),
  incomeCount: ic, expenseCount: ec, byCurrency: {}, missingRates: [],
});

describe('меъёри рӯзона', () => {
  it('дастӣ → аз даромад (80% / рӯзҳо) → аз миёна ×1.5 → нест', () => {
    expect(effectiveDailyLimit({ dailyLimit: '300', monthlyIncome: '6000', avgDaily30: '100', daysInMonth: 30 })).toEqual({ value: '300.00', basis: 'manual' });
    expect(effectiveDailyLimit({ monthlyIncome: '6000', avgDaily30: '100', daysInMonth: 30 })).toEqual({ value: '160.00', basis: 'income' });
    expect(effectiveDailyLimit({ monthlyIncome: '5000', daysInMonth: 31 })).toEqual({ value: '129.03', basis: 'income' });
    expect(effectiveDailyLimit({ avgDaily30: '100.10', daysInMonth: 30 })).toEqual({ value: '150.15', basis: 'average' });
    expect(effectiveDailyLimit({ daysInMonth: 30 })).toBeNull();
    expect(effectiveDailyLimit({ dailyLimit: '0', daysInMonth: 30 })).toBeNull();
  });
  it('аз меъёр гузашт — қатъан зиёд', () => {
    expect(isOverLimit('160.01', { value: '160.00' })).toBe(true);
    expect(isOverLimit('160.00', { value: '160.00' })).toBe(false);
    expect(isOverLimit('999', null)).toBe(false);
  });
  it('фоиз', () => {
    expect(percentOf('650', '500')).toBe(130);
    expect(percentOf('1', '0')).toBe(0);
  });
});

describe('маблағи матнӣ', () => {
  it('рақамҳоро мефаҳмад', () => {
    expect(parseUserAmount('5000')).toBe('5000.00');
    expect(parseUserAmount('5 000,50')).toBe('5000.50');
    expect(parseUserAmount('5000 смн')).toBe('5000.00');
    expect(parseUserAmount('панҷ ҳазор')).toBeNull();
    expect(parseUserAmount('0')).toBeNull();
    expect(parseUserAmount('-5')).toBeNull();
  });
  it('формат', () => {
    expect(fmt('1234567.5')).toBe('1 234 567.50 смн');
    expect(fmt('-5', 'TJS')).toBe('−5.00 смн');
    expect(fmt('10', 'TJS', true)).toBe('+10.00 смн');
  });
});

describe('паёмҳо', () => {
  const cats = [
    { categoryId: 'a', name: 'Хӯрок', color: '#f00', amount: '300.00', count: 3, share: '60.0' },
    { categoryId: 'b', name: 'Нақлиёт <taxi>', color: '#0f0', amount: '200.00', count: 2, share: '40.0' },
  ];
  it('ҳисоботи рӯз: рақамҳо, категорияҳо, меъёр, маслиҳат, HTML-escape', () => {
    const m = dailyMessage({ day: '2026-11-22', summary: S('1000', '500'), operations: 6, expenseByCategory: cats, avgDaily30: '250', limit: { value: '400.00', basis: 'income' } }, 'tg');
    expect(m).toContain('22 ноябр 2026');
    expect(m).toContain('1 000.00 смн');
    expect(m).toContain('+500.00 смн');
    expect(m).toContain('Хӯрок — 300.00 смн (60%)');
    expect(m).toContain('Нақлиёт &lt;taxi&gt;');
    expect(m).toContain('+100%'); // 500 нисбат ба миёнаи 250
    expect(m).toContain('125% ⚠️');
    expect(m).toContain('Бештари пул ба <b>«Хӯрок»</b>');
  });
  it('рӯзи холӣ', () => {
    expect(dailyMessage({ day: '2026-11-22', summary: S('0', '0', 0, 0), operations: 0, expenseByCategory: [], avgDaily30: '0', limit: null }, 'ru')).toContain('не записано');
  });
  it('огоҳӣ', () => {
    const m = alertMessage('650.00', { value: '500.00' }, '210.00', cats, 'TJS', 'tg');
    expect(m).toContain('Имрӯз бисёр сарф кардед');
    expect(m).toContain('<b>30%</b> зиёд');
    expect(m).toContain('210.00 смн');
    expect(m).toContain('Хӯрок — 300.00 смн');
  });
});

import { matchCategory, parseQuickEntry } from '../src/services/telegram/insights.js';

describe('илова кардан бо паём', () => {
  it('аломат, маблағ ва матн', () => {
    expect(parseQuickEntry('50 хӯрок')).toEqual({ type: 'EXPENSE', amount: '50.00', text: 'хӯрок' });
    expect(parseQuickEntry('-20,50 такси то бозор')).toEqual({ type: 'EXPENSE', amount: '20.50', text: 'такси то бозор' });
    expect(parseQuickEntry('+3 000 маош')).toEqual({ type: 'INCOME', amount: '3000.00', text: 'маош' });
    expect(parseQuickEntry('+3000смн маош')).toEqual({ type: 'INCOME', amount: '3000.00', text: 'маош' });
    expect(parseQuickEntry('120')).toEqual({ type: 'EXPENSE', amount: '120.00', text: '' });
    expect(parseQuickEntry('салом')).toBeNull();
    expect(parseQuickEntry('0 хӯрок')).toBeNull();
    expect(parseQuickEntry('1.234 нон')).toBeNull();
  });
  const cats = [
    { id: '1', name: 'Хӯрок' }, { id: '2', name: 'Нақлиёт' }, { id: '3', name: 'Интернет' },
    { id: '4', name: 'Маоши кормандон' }, { id: '5', name: 'Дигар' }, { id: '6', name: 'Мол' },
  ];
  it('категорияро меёбад: ном, аввали калима, калимаи калидӣ, "Дигар"', () => {
    expect(matchCategory('хӯрок', cats)?.id).toBe('1');
    expect(matchCategory('Хурок нисфирӯзӣ', cats)?.id).toBe('1');
    expect(matchCategory('нак', cats)?.id).toBe('2');
    expect(matchCategory('такси то бозор', cats)?.id).toBe('2');
    expect(matchCategory('обед в кафе', cats)?.id).toBe('1');
    expect(matchCategory('маоши кормандон барои ноябр', cats)?.id).toBe('4');
    expect(matchCategory('Tcell пополнение', cats)?.id).toBe('3');
    expect(matchCategory('чизи номаълум', cats)?.id).toBe('5');
    expect(matchCategory('', cats)?.id).toBe('5');
    expect(matchCategory('xyz', [{ id: '9', name: 'Хӯрок' }])).toBeNull();
  });
});
