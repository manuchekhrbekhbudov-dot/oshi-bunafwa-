/**
 * Telegram-бот: ҳисобкуниҳо ва матни паёмҳо (бе база ва бе шабака — пурра бо тест).
 */
import { dec, Decimal, money, type CurrencyCode, type DecimalLike } from '../../lib/money.js';
import type { CategoryShare, Summary } from '../calc.js';

export type Lang = 'tg' | 'ru';
export type LimitBasis = 'manual' | 'income' | 'average';

/** Ҳиссаи даромад, ки барои хароҷот ҷудо мешавад (20% — пасандоз) */
export const SPEND_SHARE_OF_INCOME = new Decimal('0.8');
/** Агар даромад маълум набошад: меъёр = миёнаи 30 рӯз × 1.5 */
export const AVERAGE_MULTIPLIER = new Decimal('1.5');

export interface LimitInput {
  dailyLimit?: DecimalLike | null;
  monthlyIncome?: DecimalLike | null;
  /** Миёнаи хароҷоти рӯзона дар 30 рӯзи охир (бе имрӯз) */
  avgDaily30?: DecimalLike | null;
  daysInMonth: number;
}

/** Меъёри хароҷоти рӯзона: дастӣ → аз даромади моҳона → аз миёнаи 30 рӯз → нест */
export function effectiveDailyLimit(i: LimitInput): { value: string; basis: LimitBasis } | null {
  if (i.dailyLimit !== null && i.dailyLimit !== undefined && dec(i.dailyLimit).gt(0)) {
    return { value: money(i.dailyLimit), basis: 'manual' };
  }
  if (i.monthlyIncome !== null && i.monthlyIncome !== undefined && dec(i.monthlyIncome).gt(0)) {
    return { value: money(dec(i.monthlyIncome).times(SPEND_SHARE_OF_INCOME).div(i.daysInMonth)), basis: 'income' };
  }
  if (i.avgDaily30 !== null && i.avgDaily30 !== undefined && dec(i.avgDaily30).gt(0)) {
    return { value: money(dec(i.avgDaily30).times(AVERAGE_MULTIPLIER)), basis: 'average' };
  }
  return null;
}

export function isOverLimit(spentToday: DecimalLike, limit: { value: string } | null): boolean {
  return !!limit && dec(spentToday).gt(dec(limit.value));
}

/** Фоизи (a / b × 100), бутун */
export function percentOf(a: DecimalLike, b: DecimalLike): number {
  const d = dec(b);
  if (d.isZero()) return 0;
  return dec(a).div(d).times(100).toDecimalPlaces(0).toNumber();
}

/** Маблағи матнӣ аз Telegram: "500", "1 250,50" → "1250.50"; нодуруст → null */
export function parseUserAmount(text: string): string | null {
  const s = text.trim().replace(/\s+/g, '').replace(',', '.').replace(/(смн|сомонӣ|сомони|tjs)$/i, '');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  const d = new Decimal(s);
  return d.gt(0) ? d.toFixed(2) : null;
}

/* ------------------------------ Формат ------------------------------ */

const SYMBOL: Record<CurrencyCode, string> = { TJS: 'смн', USD: '$', RUB: '₽' };

export function fmt(v: DecimalLike, cur: CurrencyCode = 'TJS', sign = false): string {
  const d = dec(v);
  const neg = d.lt(0);
  const [i, f] = d.abs().toFixed(2).split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const s = `${neg ? '−' : sign && d.gt(0) ? '+' : ''}${g}.${f}`;
  return cur === 'USD' ? s.replace(/^([−+]?)/, '$1$') : `${s} ${SYMBOL[cur]}`;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const MONTHS: Record<Lang, string[]> = {
  tg: ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
export function dayLabel(day: string, lang: Lang) {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[lang][m - 1]} ${y}`;
}

export const INCOME_SOURCES = ['SALARY', 'BUSINESS', 'TRADE', 'SERVICES', 'OTHER'] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];

export const T = {
  tg: {
    src: { SALARY: 'Маош', BUSINESS: 'Тиҷорат', TRADE: 'Савдо', SERVICES: 'Хизматрасонӣ', OTHER: 'Дигар' } as Record<IncomeSource, string>,
    linked: (name: string) => `✅ Ҳисоби HISOB PRO-и <b>${esc(name)}</b> пайваст шуд!`,
    askSource: '💼 Даромади шумо асосан аз куҷо меояд?',
    askIncome: '💰 Даромади моҳонаи шумо тақрибан чанд аст (смн)?\nМасалан: <code>5000</code>\n\nАз ин меъёри хароҷоти рӯзонаро ҳисоб мекунам.',
    skip: 'Гузаштан ⏭',
    badAmount: 'Лутфан танҳо рақам нависед, масалан: <code>5000</code>',
    done: (limit: string | null) =>
      `🎉 Тайёр!\n\n` +
      (limit
        ? `📏 Меъёри хароҷоти рӯзонаи шумо: <b>${limit}</b>\n(80% даромад тақсим ба рӯзҳои моҳ — 20% пасандоз)\n\n`
        : `📏 Меъёри рӯзона баъд аз 1–2 ҳафтаи истифода аз хароҷоти миёнаи шумо худкор ҳисоб мешавад.\n\n`) +
      `Ман ба шумо:\n• ҳар бегоҳ соати <b>21:00</b> ҳисоботи рӯзро мефиристам;\n• агар хароҷот аз меъёр зиёд шавад, фавран огоҳ мекунам.\n\n` +
      HELP_TG,
    help: '',
    notLinked:
      '👋 Салом! Ман боти <b>HISOB PRO</b> ҳастам.\n\nБарои пайваст кардан: дар сайт <b>Танзимот → Telegram-бот → «Пайваст кардан»</b>-ро пахш кунед.',
    badCode: '❌ Линк нодуруст ё кӯҳна аст. Дар сайт <b>Танзимот → Telegram-бот</b> линки навро гиред.',
    unlinked: '🔌 Бот аз ҳисоби HISOB PRO ҷудо шуд.',
    limitSet: (v: string) => `✅ Меъёри рӯзона: <b>${v}</b>`,
    limitAuto: (v: string | null) => `✅ Меъёри рӯзона худкор: <b>${v ?? '— (ҳоло маълумот кам аст)'}</b>`,
    limitNow: (v: string | null, basis: LimitBasis | null) =>
      `📏 Меъёри ҳозира: <b>${v ?? 'муайян нашудааст'}</b>${basis ? ` (${{ manual: 'дастӣ', income: 'аз даромад', average: 'аз миёнаи 30 рӯз' }[basis]})` : ''}\n\nИваз: <code>/limit 500</code>\nХудкор: <code>/limit auto</code>`,
    dailyOn: '🔔 Ҳисоботи ҳаррӯза фаъол шуд (21:00).',
    dailyOff: '🔕 Ҳисоботи ҳаррӯза хомӯш шуд.',
    unknown: 'Ин фармонро намефаҳмам. /help',
    reportTitle: (d: string) => `📊 <b>Ҳисоботи рӯз — ${d}</b>`,
    monthTitle: (m: string) => `🗓 <b>Ҳамин моҳ — ${m}</b>`,
    income: 'Даромад',
    expense: 'Хароҷот',
    net: 'Натиҷа',
    ops: 'Амалиётҳо',
    where: 'Пул ба куҷо рафт:',
    nothing: 'Имрӯз ягон даромад ё хароҷот сабт нашудааст.',
    vsAvg: (avg: string, p: number) => `Нисбат ба миёнаи 30 рӯз (${avg}): ${p >= 0 ? '+' : ''}${p}%`,
    limitLine: (limit: string, p: number) => `Меъёри рӯз: ${limit} — ${p}% ${p > 100 ? '⚠️' : '✅'}`,
    monthLine: 'Ҳамин моҳ',
    tip: (cat: string, p: number) => `💡 Бештари пул ба <b>«${esc(cat)}»</b> меравад (${p}%).`,
    missing: (c: string) => `ℹ️ Қурб барои ${c} муайян нашудааст — ин маблағҳо ба ҷамъ дохил нестанд.`,
    alertTitle: '⚠️ <b>Имрӯз бисёр сарф кардед!</b>',
    alertBody: (spent: string, limit: string, over: number) =>
      `Хароҷоти имрӯз: <b>${spent}</b>\nМеъёри рӯз: ${limit} — <b>${over}%</b> зиёд.`,
    alertAvg: (avg: string) => `Миёнаи рӯзонаи шумо: ${avg}`,
    alertWhere: 'Пул ба куҷо меравад:',
    open: '📱 Кушодани HISOB PRO',
  },
  ru: {
    src: { SALARY: 'Зарплата', BUSINESS: 'Бизнес', TRADE: 'Торговля', SERVICES: 'Услуги', OTHER: 'Другое' } as Record<IncomeSource, string>,
    linked: (name: string) => `✅ Аккаунт HISOB PRO <b>${esc(name)}</b> подключён!`,
    askSource: '💼 Откуда в основном ваш доход?',
    askIncome: '💰 Какой у вас примерный доход в месяц (сомони)?\nНапример: <code>5000</code>\n\nИз этого я рассчитаю дневную норму расходов.',
    skip: 'Пропустить ⏭',
    badAmount: 'Пожалуйста, напишите только число, например: <code>5000</code>',
    done: (limit: string | null) =>
      `🎉 Готово!\n\n` +
      (limit
        ? `📏 Ваша дневная норма расходов: <b>${limit}</b>\n(80% дохода на дни месяца — 20% в сбережения)\n\n`
        : `📏 Дневная норма будет рассчитана автоматически через 1–2 недели по вашим средним расходам.\n\n`) +
      `Я буду:\n• каждый вечер в <b>21:00</b> присылать отчёт за день;\n• сразу предупреждать, если расходы превысят норму.\n\n` +
      HELP_RU,
    help: '',
    notLinked:
      '👋 Здравствуйте! Я бот <b>HISOB PRO</b>.\n\nЧтобы подключить: на сайте нажмите <b>Настройки → Telegram-бот → «Подключить»</b>.',
    badCode: '❌ Ссылка неверна или устарела. Получите новую на сайте: <b>Настройки → Telegram-бот</b>.',
    unlinked: '🔌 Бот отключён от аккаунта HISOB PRO.',
    limitSet: (v: string) => `✅ Дневная норма: <b>${v}</b>`,
    limitAuto: (v: string | null) => `✅ Дневная норма автоматически: <b>${v ?? '— (пока мало данных)'}</b>`,
    limitNow: (v: string | null, basis: LimitBasis | null) =>
      `📏 Текущая норма: <b>${v ?? 'не задана'}</b>${basis ? ` (${{ manual: 'вручную', income: 'из дохода', average: 'из среднего за 30 дней' }[basis]})` : ''}\n\nИзменить: <code>/limit 500</code>\nАвтоматически: <code>/limit auto</code>`,
    dailyOn: '🔔 Ежедневный отчёт включён (21:00).',
    dailyOff: '🔕 Ежедневный отчёт выключен.',
    unknown: 'Не понимаю эту команду. /help',
    reportTitle: (d: string) => `📊 <b>Отчёт за день — ${d}</b>`,
    monthTitle: (m: string) => `🗓 <b>Этот месяц — ${m}</b>`,
    income: 'Доход',
    expense: 'Расход',
    net: 'Итог',
    ops: 'Операций',
    where: 'Куда ушли деньги:',
    nothing: 'Сегодня не записано ни доходов, ни расходов.',
    vsAvg: (avg: string, p: number) => `К среднему за 30 дней (${avg}): ${p >= 0 ? '+' : ''}${p}%`,
    limitLine: (limit: string, p: number) => `Дневная норма: ${limit} — ${p}% ${p > 100 ? '⚠️' : '✅'}`,
    monthLine: 'Этот месяц',
    tip: (cat: string, p: number) => `💡 Больше всего денег уходит на <b>«${esc(cat)}»</b> (${p}%).`,
    missing: (c: string) => `ℹ️ Не задан курс для ${c} — эти суммы не включены в итог.`,
    alertTitle: '⚠️ <b>Сегодня вы много потратили!</b>',
    alertBody: (spent: string, limit: string, over: number) =>
      `Расходы за сегодня: <b>${spent}</b>\nДневная норма: ${limit} — превышение <b>${over}%</b>.`,
    alertAvg: (avg: string) => `Ваш средний расход в день: ${avg}`,
    alertWhere: 'Куда уходят деньги:',
    open: '📱 Открыть HISOB PRO',
  },
};

const HELP_TG =
  '<b>Фармонҳо:</b>\n/today — ҳисоботи имрӯз\n/month — ҳисоботи ҳамин моҳ\n/limit — меъёри хароҷоти рӯзона\n/daily — ҳисоботи 21:00 фаъол/хомӯш\n/stop — ҷудо кардани бот';
const HELP_RU =
  '<b>Команды:</b>\n/today — отчёт за сегодня\n/month — отчёт за месяц\n/limit — дневная норма расходов\n/daily — вкл/выкл отчёт в 21:00\n/stop — отключить бота';
T.tg.help = HELP_TG;
T.ru.help = HELP_RU;

function categoryLines(cats: CategoryShare[], cur: CurrencyCode, max = 4): string[] {
  return cats.slice(0, max).map((c) => `• ${esc(c.name === '—' ? '—' : c.name)} — ${fmt(c.amount, cur)} (${Math.round(Number(c.share))}%)`);
}

export interface DayData {
  day: string;
  summary: Summary;
  operations: number;
  expenseByCategory: CategoryShare[];
  avgDaily30: string;
  limit: { value: string; basis: LimitBasis } | null;
  month?: Summary;
}

/** Ҳисоботи рӯз (21:00 ва /today) */
export function dailyMessage(d: DayData, lang: Lang): string {
  const t = T[lang];
  const c = d.summary.viewCurrency;
  const lines = [t.reportTitle(dayLabel(d.day, lang)), ''];
  if (d.summary.incomeCount + d.summary.expenseCount === 0) {
    lines.push(t.nothing);
  } else {
    lines.push(
      `💰 ${t.income}: <b>${fmt(d.summary.income, c)}</b>`,
      `💸 ${t.expense}: <b>${fmt(d.summary.expense, c)}</b>`,
      `📈 ${t.net}: <b>${fmt(d.summary.net, c, true)}</b>`,
      `🧾 ${t.ops}: ${d.operations}`,
    );
    if (d.expenseByCategory.length) {
      lines.push('', t.where, ...categoryLines(d.expenseByCategory, c));
    }
    const extra: string[] = [];
    if (dec(d.avgDaily30).gt(0) && dec(d.summary.expense).gt(0)) {
      extra.push(t.vsAvg(fmt(d.avgDaily30, c), percentOf(dec(d.summary.expense).minus(d.avgDaily30), d.avgDaily30)));
    }
    if (d.limit) extra.push(t.limitLine(fmt(d.limit.value, c), percentOf(d.summary.expense, d.limit.value)));
    if (extra.length) lines.push('', ...extra);
    const top = d.expenseByCategory[0];
    if (top && d.expenseByCategory.length > 1 && Number(top.share) >= 40) lines.push('', t.tip(top.name, Math.round(Number(top.share))));
  }
  if (d.month) {
    lines.push(
      '',
      `🗓 ${t.monthLine}: ${t.income.toLowerCase()} ${fmt(d.month.income, c)} · ${t.expense.toLowerCase()} ${fmt(d.month.expense, c)} · ${t.net.toLowerCase()} ${fmt(d.month.net, c, true)}`,
    );
  }
  if (d.summary.missingRates.length) lines.push('', t.missing(d.summary.missingRates.join(', ')));
  return lines.join('\n');
}

/** Ҳисоботи моҳ (/month) */
export function monthMessage(monthKey: string, s: Summary, cats: CategoryShare[], lang: Lang): string {
  const t = T[lang];
  const c = s.viewCurrency;
  const [y, m] = monthKey.split('-').map(Number);
  const name = `${MONTHS[lang][m - 1]} ${y}`;
  const lines = [
    t.monthTitle(name),
    '',
    `💰 ${t.income}: <b>${fmt(s.income, c)}</b>`,
    `💸 ${t.expense}: <b>${fmt(s.expense, c)}</b>`,
    `📈 ${t.net}: <b>${fmt(s.net, c, true)}</b>`,
  ];
  if (cats.length) lines.push('', t.where, ...categoryLines(cats, c, 6));
  const top = cats[0];
  if (top && cats.length > 1 && Number(top.share) >= 40) lines.push('', t.tip(top.name, Math.round(Number(top.share))));
  if (s.missingRates.length) lines.push('', t.missing(s.missingRates.join(', ')));
  return lines.join('\n');
}

/** Огоҳии фаврӣ: хароҷоти имрӯз аз меъёр гузашт */
export function alertMessage(
  spent: string,
  limit: { value: string },
  avgDaily30: string,
  cats: CategoryShare[],
  cur: CurrencyCode,
  lang: Lang,
): string {
  const t = T[lang];
  const over = percentOf(dec(spent).minus(limit.value), limit.value);
  const lines = [t.alertTitle, '', t.alertBody(fmt(spent, cur), fmt(limit.value, cur), over)];
  if (dec(avgDaily30).gt(0)) lines.push(t.alertAvg(fmt(avgDaily30, cur)));
  if (cats.length) lines.push('', t.alertWhere, ...categoryLines(cats, cur, 3));
  const top = cats[0];
  if (top) lines.push('', t.tip(top.name, Math.round(Number(top.share))));
  return lines.join('\n');
}
