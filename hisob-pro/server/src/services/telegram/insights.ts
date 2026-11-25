/**
 * Telegram-бот: ҳисобкуниҳо ва матни паёмҳо (бе база ва бе шабака — пурра бо тест).
 */
import { dec, Decimal, money, type CurrencyCode, type DecimalLike } from '../../lib/money.js';
import type { CategoryChange, CategoryShare, Summary } from '../calc.js';
import { pctChange } from '../calc.js';

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
    resetLink: (link: string) =>
      `🔑 <b>Барқарорсозии парол</b>\n\nБарои гузоштани пароли нав ин линкро кушоед (1 соат эътибор дорад):\n<a href="${esc(link)}">Гузоштани пароли нав</a>\n\nАгар шумо дархост накарда бошед, ин паёмро нодида гиред.`,
    regAskContact:
      '📱 <b>Тасдиқи рақам</b>\n\nБарои ба охир расондани сабти ном дар HISOB PRO тугмаи поёнро пахш кунед — Telegram рақами шуморо худаш мефиристад.',
    regContactButton: '📱 Фиристодани рақам',
    regNotOwn: 'Лутфан рақами <b>худатонро</b> бо тугмаи «📱 Фиристодани рақам» фиристед.',
    regPhoneTaken: '❌ Ин рақам аллакай дар HISOB PRO сабт шудааст. Дар сайт бо рақам ва парол ворид шавед.',
    regTelegramTaken: '❌ Ин ҳисоби Telegram аллакай ба HISOB PRO пайваст аст. Дар сайт ворид шавед.',
    regEmailTaken: '❌ Ин email аллакай сабт шудааст. Дар сайт бо email-и дигар сабти ном кунед.',
    regClosed: '❌ Сабти ном ҳоло пӯшида аст.',
    regBadPhone: '❌ Рақамро шинохта натавонистам. Аз нав кӯшиш кунед.',
    regExpired: '⏳ Линки сабти ном кӯҳна шудааст. Дар сайт аз нав «Сабти ном»-ро пахш кунед.',
    regDone: (name: string) =>
      `✅ <b>Сабти ном тамом шуд, ${esc(name)}!</b>\n\nБа сайт баргардед — шумо худкор ворид мешавед.\nВоридшавии минбаъда: <b>рақами телефон + парол</b>.`,
    reminderTitle: '🔔 <b>Ёдраскунии қарзҳо</b>',
    dueTomorrowLent: (n: string, a: string) => `📅 Пагоҳ <b>${esc(n)}</b> бояд <b>${a}</b> баргардонад.`,
    dueTomorrowBorrowed: (n: string, a: string) => `📅 Пагоҳ шумо бояд ба <b>${esc(n)}</b> <b>${a}</b> баргардонед.`,
    dueTodayLent: (n: string, a: string) => `⏰ Имрӯз муҳлати <b>${esc(n)}</b> аст: <b>${a}</b>.`,
    dueTodayBorrowed: (n: string, a: string) => `⏰ Имрӯз шумо бояд ба <b>${esc(n)}</b> <b>${a}</b> баргардонед.`,
    overdueLent: (n: string, a: string, d: number) => `⚠️ <b>${esc(n)}</b> ${d} рӯз дер кардааст: <b>${a}</b>.`,
    overdueBorrowed: (n: string, a: string, d: number) => `⚠️ Қарзи шумо ба <b>${esc(n)}</b> ${d} рӯз муҳлатгузашта аст: <b>${a}</b>.`,
    weeklyTitle: (from: string, to: string) => `📆 <b>Ҳисоботи ҳафта</b> — ${from} – ${to}`,
    monthlyTitle: (m: string) => `🗓 <b>Ҷамъбасти моҳ — ${m}</b>`,
    vsPrevWeek: 'Нисбат ба ҳафтаи гузашта',
    vsPrevMonth: 'Нисбат ба моҳи гузашта',
    vsSameDays: 'Нисбат ба ҳамин рӯзҳои моҳи гузашта',
    changesTitle: 'Тағйироти калон аз рӯи категория:',
    newCat: 'нав',
    insightUp: (cat: string, p: number | null, period: string) =>
      p === null ? `💡 Дар ${period} ба «${esc(cat)}» харҷи нав пайдо шуд.` : `💡 Дар ${period} ба «${esc(cat)}» ${p}% бештар сарф кардед.`,
    insightDown: (cat: string, p: number, period: string) => `👍 Дар ${period} ба «${esc(cat)}» ${Math.abs(p)}% камтар сарф кардед.`,
    periodWeek: 'ин ҳафта',
    periodMonth: 'ин моҳ',
    periodLastMonth: 'моҳи гузашта',
    backupCaption: (date: string, n: number) =>
      `💾 <b>Нусхаи эҳтиётӣ</b> — ${date}\nАмалиётҳо: ${n}. Ин файлро нигоҳ доред — бо он ҳамаи маълумотро барқарор кардан мумкин аст.`,
    menu: { today: '📊 Имрӯз', month: '🗓 Моҳ', balance: '💰 Баланс', debts: '🤝 Қарзҳо', photos: '📸 Суратҳо', help: '❓ Кӯмак' },
    photoHint: '📸 Барои сабти харид бо сурат, дар зери сурат маблағ ва номро нависед, масалан: <code>50 нон</code>',
    photoSaved: '📸 Сурат нигоҳ дошта шуд — бегоҳ ҳамаи суратҳои харидҳои рӯз меоянд.',
    photosNone: '📸 Имрӯз сурати харид нест. Суратро бо навиштаи <code>50 нон</code> фиристед.',
    photosTitle: (n: number, day: string) => `📸 <b>Суратҳои харидҳо — ${day}</b> (${n})`,
    added: (type: 'INCOME' | 'EXPENSE', amount: string, cat: string, account: string, note: string) =>
      `${type === 'INCOME' ? '✅ Даромад' : '✅ Хароҷот'} сабт шуд: <b>${amount}</b>\n📂 ${esc(cat)} · 💳 ${esc(account)}${note ? `\n📝 ${esc(note)}` : ''}`,
    undo: '↩️ Бекор кардан',
    undone: '↩️ Бекор карда шуд.',
    undoFail: 'Ин амалиётро бекор кардан мумкин нест (шояд аллакай нест шудааст).',
    noAccount: 'Аввал дар сайт ҳисоб (ҳамён) созед: <b>Ҳамёнҳо ва ҳисобҳо</b>.',
    balanceTitle: '💰 <b>Баланс</b>',
    balanceTotal: 'Ҷамъ',
    debtsTitle: '🤝 <b>Қарзҳо</b>',
    debtsLent: 'Ба ман қарздоранд',
    debtsBorrowed: 'Ман қарздорам',
    debtsNone: 'Қарзи кушода нест. 👍',
    overdue: 'муҳлатгузашта',
    due: 'муҳлат',
    quickHint: '✍️ <b>Сабт бо як паём:</b>\n<code>50 хӯрок</code> — хароҷот\n<code>-20 такси</code> — хароҷот\n<code>+3000 маош</code> — даромад',
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
    resetLink: (link: string) =>
      `🔑 <b>Восстановление пароля</b>\n\nЧтобы задать новый пароль, откройте ссылку (действует 1 час):\n<a href="${esc(link)}">Задать новый пароль</a>\n\nЕсли вы не запрашивали, просто проигнорируйте это сообщение.`,
    regAskContact:
      '📱 <b>Подтверждение номера</b>\n\nЧтобы завершить регистрацию в HISOB PRO, нажмите кнопку ниже — Telegram сам отправит ваш номер.',
    regContactButton: '📱 Отправить номер',
    regNotOwn: 'Пожалуйста, отправьте <b>свой</b> номер кнопкой «📱 Отправить номер».',
    regPhoneTaken: '❌ Этот номер уже зарегистрирован в HISOB PRO. Войдите на сайте по номеру и паролю.',
    regTelegramTaken: '❌ Этот аккаунт Telegram уже подключён к HISOB PRO. Войдите на сайте.',
    regEmailTaken: '❌ Этот email уже зарегистрирован. Зарегистрируйтесь на сайте с другим email.',
    regClosed: '❌ Регистрация сейчас закрыта.',
    regBadPhone: '❌ Не удалось распознать номер. Попробуйте ещё раз.',
    regExpired: '⏳ Ссылка регистрации устарела. Нажмите «Регистрация» на сайте ещё раз.',
    regDone: (name: string) =>
      `✅ <b>Регистрация завершена, ${esc(name)}!</b>\n\nВернитесь на сайт — вы войдёте автоматически.\nДальше вход: <b>номер телефона + пароль</b>.`,
    reminderTitle: '🔔 <b>Напоминание о долгах</b>',
    dueTomorrowLent: (n: string, a: string) => `📅 Завтра <b>${esc(n)}</b> должен вернуть <b>${a}</b>.`,
    dueTomorrowBorrowed: (n: string, a: string) => `📅 Завтра вы должны вернуть <b>${esc(n)}</b> <b>${a}</b>.`,
    dueTodayLent: (n: string, a: string) => `⏰ Сегодня срок у <b>${esc(n)}</b>: <b>${a}</b>.`,
    dueTodayBorrowed: (n: string, a: string) => `⏰ Сегодня вы должны вернуть <b>${esc(n)}</b> <b>${a}</b>.`,
    overdueLent: (n: string, a: string, d: number) => `⚠️ <b>${esc(n)}</b> просрочил на ${d} дн.: <b>${a}</b>.`,
    overdueBorrowed: (n: string, a: string, d: number) => `⚠️ Ваш долг <b>${esc(n)}</b> просрочен на ${d} дн.: <b>${a}</b>.`,
    weeklyTitle: (from: string, to: string) => `📆 <b>Отчёт за неделю</b> — ${from} – ${to}`,
    monthlyTitle: (m: string) => `🗓 <b>Итоги месяца — ${m}</b>`,
    vsPrevWeek: 'По сравнению с прошлой неделей',
    vsPrevMonth: 'По сравнению с прошлым месяцем',
    vsSameDays: 'По сравнению с теми же днями прошлого месяца',
    changesTitle: 'Крупные изменения по категориям:',
    newCat: 'новое',
    insightUp: (cat: string, p: number | null, period: string) =>
      p === null ? `💡 ${period} появились траты на «${esc(cat)}».` : `💡 ${period} вы потратили на «${esc(cat)}» на ${p}% больше.`,
    insightDown: (cat: string, p: number, period: string) => `👍 ${period} вы потратили на «${esc(cat)}» на ${Math.abs(p)}% меньше.`,
    periodWeek: 'На этой неделе',
    periodMonth: 'В этом месяце',
    periodLastMonth: 'В прошлом месяце',
    backupCaption: (date: string, n: number) =>
      `💾 <b>Резервная копия</b> — ${date}\nОпераций: ${n}. Сохраните файл — по нему можно восстановить все данные.`,
    menu: { today: '📊 Сегодня', month: '🗓 Месяц', balance: '💰 Баланс', debts: '🤝 Долги', photos: '📸 Фото', help: '❓ Помощь' },
    photoHint: '📸 Чтобы записать покупку с фото, напишите под фото сумму и название, например: <code>50 хлеб</code>',
    photoSaved: '📸 Фото сохранено — вечером придут все фото покупок за день.',
    photosNone: '📸 Сегодня нет фото покупок. Отправьте фото с подписью <code>50 хлеб</code>.',
    photosTitle: (n: number, day: string) => `📸 <b>Фото покупок — ${day}</b> (${n})`,
    added: (type: 'INCOME' | 'EXPENSE', amount: string, cat: string, account: string, note: string) =>
      `${type === 'INCOME' ? '✅ Доход' : '✅ Расход'} записан: <b>${amount}</b>\n📂 ${esc(cat)} · 💳 ${esc(account)}${note ? `\n📝 ${esc(note)}` : ''}`,
    undo: '↩️ Отменить',
    undone: '↩️ Отменено.',
    undoFail: 'Эту операцию нельзя отменить (возможно, она уже удалена).',
    noAccount: 'Сначала создайте счёт на сайте: <b>Кошельки и счета</b>.',
    balanceTitle: '💰 <b>Баланс</b>',
    balanceTotal: 'Итого',
    debtsTitle: '🤝 <b>Долги</b>',
    debtsLent: 'Мне должны',
    debtsBorrowed: 'Я должен',
    debtsNone: 'Открытых долгов нет. 👍',
    overdue: 'просрочен',
    due: 'срок',
    quickHint: '✍️ <b>Запись одним сообщением:</b>\n<code>50 еда</code> — расход\n<code>-20 такси</code> — расход\n<code>+3000 зарплата</code> — доход',
  },
};

const HELP_TG =
  '✍️ <b>Сабт бо як паём:</b>\n<code>50 хӯрок</code> — хароҷот\n<code>-20 такси</code> — хароҷот\n<code>+3000 маош</code> — даромад\nКатегория худкор муайян мешавад.\n📸 Сурат бо навиштаи <code>50 нон</code> — харид бо сурат.\n\n' +
  '<b>Фармонҳо:</b>\n/today — ҳисоботи имрӯз\n/month — ҳисоботи ҳамин моҳ\n/balance — баланси ҳисобҳо\n/debts — қарзҳо\n/limit — меъёри хароҷоти рӯзона\n/daily — ҳисоботи 21:00 фаъол/хомӯш\n/stop — ҷудо кардани бот';
const HELP_RU =
  '✍️ <b>Запись одним сообщением:</b>\n<code>50 еда</code> — расход\n<code>-20 такси</code> — расход\n<code>+3000 зарплата</code> — доход\nКатегория определяется автоматически.\n📸 Фото с подписью <code>50 хлеб</code> — покупка с фото.\n\n' +
  '<b>Команды:</b>\n/today — отчёт за сегодня\n/month — отчёт за месяц\n/balance — баланс счетов\n/debts — долги\n/limit — дневная норма расходов\n/daily — вкл/выкл отчёт в 21:00\n/stop — отключить бота';
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

/* ------------------------- Илова кардан бо паём ------------------------- */

export interface QuickEntry {
  type: 'INCOME' | 'EXPENSE';
  amount: string;
  /** Матни боқимонда: категория ва шарҳ */
  text: string;
}

/**
 * "50 хӯрок" → хароҷот, "-20 такси" → хароҷот, "+3000 маош" → даромад.
 * Бе аломат — хароҷот (аксари сабтҳо хароҷотанд).
 */
export function parseQuickEntry(input: string): QuickEntry | null {
  // Пас аз маблағ бояд фосила, асъор ё охири матн бошад — "1.234" ҳеҷ гоҳ ҳамчун 1.23 қабул намешавад
  const m = /^\s*([+-])?\s*(\d[\d ]{0,15}(?:[.,]\d{1,2})?)(?![\d.,])\s*(?:смн|сомонӣ|сомони|tjs|с\.)?(?:\s+(.*)|$)/i.exec(input);
  if (!m) return null;
  const amount = parseUserAmount(m[2]);
  if (!amount) return null;
  return { type: m[1] === '+' ? 'INCOME' : 'EXPENSE', amount, text: (m[3] ?? '').trim().slice(0, 200) };
}

/** Калимаҳое, ки ба категорияҳои пешфарз ишора мекунанд (тоҷикӣ ва русӣ) */
const KEYWORDS: Record<string, string[]> = {
  'Хӯрок': ['хӯрок', 'хурок', 'нон', 'обед', 'ужин', 'завтрак', 'кафе', 'ош', 'гӯшт', 'гушт', 'еда', 'продукт', 'бозор', 'базар', 'чой', 'кофе', 'шаурма', 'самбуса'],
  'Нақлиёт': ['нақлиёт', 'наклиёт', 'такси', 'taxi', 'автобус', 'маршрут', 'бензин', 'газ', 'транспорт', 'мошин', 'машин', 'yandex', 'яндекс'],
  'Иҷора': ['иҷора', 'ичора', 'аренда', 'квартир', 'хона', 'кварт'],
  'Интернет': ['интернет', 'internet', 'телефон', 'связь', 'алоқа', 'мобил', 'tcell', 'megafon', 'мегафон', 'babilon', 'вавилон', 'zet'],
  'Маоши кормандон': ['маоши кормандон', 'кормандон', 'зарплата сотрудн', 'сотрудник', 'коргар'],
  'Мол': ['мол', 'товар', 'закуп', 'харид'],
  'Хизматрасонӣ': ['хизмат', 'услуг', 'ремонт', 'таъмир'],
  'Маош': ['маош', 'зарплата', 'аванс', 'оклад'],
  'Савдо': ['савдо', 'фурӯш', 'фуруш', 'продаж', 'торгов'],
  'Тиҷорат': ['тиҷорат', 'тичорат', 'бизнес', 'фоида'],
};

/** Ҳарфҳои тоҷикӣ ба русӣ — то "хурок" ва "хӯрок", "нак" ва "нақлиёт" якхела бошанд */
const TJ: Record<string, string> = { 'қ': 'к', 'ғ': 'г', 'ҳ': 'х', 'ҷ': 'ч', 'ӣ': 'и', 'ӯ': 'у', 'ё': 'е' };
const norm = (s: string) => s.toLowerCase().replace(/[қғҳҷӣӯё]/g, (c) => TJ[c]).trim();

/**
 * Категорияро аз матн меёбад: аввал номи худи категория (ҳамчунин категорияҳои корбар),
 * баъд калимаҳои калидӣ. Агар наёбад — "Дигар" ё null.
 */
export function matchCategory<C extends { id: string; name: string }>(text: string, categories: C[]): C | null {
  const t = norm(text);
  if (t) {
    // 1) номи категория дар матн ё матн бо номи категория сар мешавад
    const byName = [...categories]
      .sort((a, b) => b.name.length - a.name.length)
      .find((c) => {
        const n = norm(c.name);
        return n.length >= 2 && (t.includes(n) || (t.split(/\s+/)[0].length >= 3 && n.startsWith(t.split(/\s+/)[0])));
      });
    if (byName) return byName;
    // 2) калимаҳои калидӣ — ғолиб калимаест, ки дар матн аз ҳама пештар омадааст ("такси то бозор" → Нақлиёт)
    let best: { c: C; pos: number } | null = null;
    for (const [catName, words] of Object.entries(KEYWORDS)) {
      const c = categories.find((x) => norm(x.name) === norm(catName));
      if (!c) continue;
      for (const w of words) {
        const pos = t.indexOf(norm(w));
        if (pos >= 0 && (!best || pos < best.pos)) best = { c, pos };
      }
    }
    if (best) return best.c;
  }
  return categories.find((c) => ['дигар', 'другое', 'прочее'].includes(norm(c.name))) ?? null;
}

/* ------------------------- Муқоиса, ҳафта, моҳ, ёдраскунӣ ------------------------- */

export function pctLabel(p: number | null, lang: Lang): string {
  if (p === null) return T[lang].newCat;
  return `${p > 0 ? '+' : ''}${p}%`;
}

/** Блоки муқоиса: хароҷот/даромад, тағйироти категорияҳо ва як маслиҳат */
export function comparisonBlock(
  cur: Summary,
  prev: Summary,
  changes: CategoryChange[],
  label: string,
  period: string,
  lang: Lang,
): string[] {
  const t = T[lang];
  const c = cur.viewCurrency;
  const lines = [
    `📊 <b>${label}</b>:`,
    `💸 ${t.expense}: ${fmt(prev.expense, c)} → <b>${fmt(cur.expense, c)}</b> (${pctLabel(pctChange(cur.expense, prev.expense), lang)})`,
    `💰 ${t.income}: ${fmt(prev.income, c)} → <b>${fmt(cur.income, c)}</b> (${pctLabel(pctChange(cur.income, prev.income), lang)})`,
  ];
  if (changes.length) {
    lines.push('', t.changesTitle);
    for (const ch of changes.slice(0, 3)) {
      lines.push(`• ${esc(ch.name === '—' ? '—' : ch.name)}: ${fmt(ch.prev, c)} → ${fmt(ch.cur, c)} (${pctLabel(ch.pct, lang)})`);
    }
    const up = changes.find((ch) => dec(ch.diff).gt(0));
    const down = changes.find((ch) => dec(ch.diff).lt(0) && ch.pct !== null);
    if (up) lines.push('', t.insightUp(up.name, up.pct, period));
    else if (down) lines.push('', t.insightDown(down.name, down.pct!, period));
  }
  return lines;
}

export interface PeriodCompare {
  cur: { summary: Summary; cats: CategoryShare[] };
  prev: { summary: Summary; cats: CategoryShare[] };
  changes: CategoryChange[];
}

export function weeklyMessage(from: string, to: string, d: PeriodCompare, lang: Lang): string {
  const t = T[lang];
  const s = d.cur.summary;
  const c = s.viewCurrency;
  const lines = [
    t.weeklyTitle(dayLabel(from, lang), dayLabel(to, lang)),
    '',
    `💰 ${t.income}: <b>${fmt(s.income, c)}</b>`,
    `💸 ${t.expense}: <b>${fmt(s.expense, c)}</b>`,
    `📈 ${t.net}: <b>${fmt(s.net, c, true)}</b>`,
  ];
  if (d.cur.cats.length) lines.push('', t.where, ...d.cur.cats.slice(0, 4).map((x) => `• ${esc(x.name)} — ${fmt(x.amount, c)} (${Math.round(Number(x.share))}%)`));
  lines.push('', ...comparisonBlock(s, d.prev.summary, d.changes, t.vsPrevWeek, t.periodWeek, lang));
  if (s.missingRates.length) lines.push('', t.missing(s.missingRates.join(', ')));
  return lines.join('\n');
}

const MONTH_NAMES: Record<Lang, string[]> = {
  tg: ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
};
export const monthName = (key: string, lang: Lang) => `${MONTH_NAMES[lang][Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

export function monthlyReportMessage(monthKey: string, d: PeriodCompare, lang: Lang): string {
  const t = T[lang];
  const s = d.cur.summary;
  const c = s.viewCurrency;
  const lines = [
    t.monthlyTitle(monthName(monthKey, lang)),
    '',
    `💰 ${t.income}: <b>${fmt(s.income, c)}</b>`,
    `💸 ${t.expense}: <b>${fmt(s.expense, c)}</b>`,
    `📈 ${t.net}: <b>${fmt(s.net, c, true)}</b>`,
  ];
  if (d.cur.cats.length) lines.push('', t.where, ...d.cur.cats.slice(0, 5).map((x) => `• ${esc(x.name)} — ${fmt(x.amount, c)} (${Math.round(Number(x.share))}%)`));
  lines.push('', ...comparisonBlock(s, d.prev.summary, d.changes, t.vsPrevMonth, t.periodLastMonth, lang));
  if (s.missingRates.length) lines.push('', t.missing(s.missingRates.join(', ')));
  return lines.join('\n');
}

export interface ReminderItem {
  kind: 'tomorrow' | 'today' | 'overdue';
  direction: 'LENT' | 'BORROWED';
  name: string;
  amount: string; // аллакай формат шуда
  days?: number;
}

export function reminderMessage(items: ReminderItem[], lang: Lang): string {
  const t = T[lang];
  const order = { overdue: 0, today: 1, tomorrow: 2 } as const;
  const lines = [t.reminderTitle, ''];
  for (const i of [...items].sort((a, b) => order[a.kind] - order[b.kind])) {
    const lent = i.direction === 'LENT';
    if (i.kind === 'tomorrow') lines.push(lent ? t.dueTomorrowLent(i.name, i.amount) : t.dueTomorrowBorrowed(i.name, i.amount));
    else if (i.kind === 'today') lines.push(lent ? t.dueTodayLent(i.name, i.amount) : t.dueTodayBorrowed(i.name, i.amount));
    else lines.push(lent ? t.overdueLent(i.name, i.amount, i.days ?? 1) : t.overdueBorrowed(i.name, i.amount, i.days ?? 1));
  }
  return lines.join('\n');
}
