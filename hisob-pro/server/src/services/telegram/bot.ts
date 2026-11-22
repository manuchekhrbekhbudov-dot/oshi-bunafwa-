/**
 * Telegram-бот: қабули паёмҳо (webhook), пайвастшавӣ, саволҳои аввал,
 * ҳисоботи ҳаррӯза (21:00) ва огоҳии фаврии хароҷоти зиёд.
 */
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { dec, money } from '../../lib/money.js';
import { endOfDayExclusiveTz, shiftDay, startOfDayTz, todayKey, TZ } from '../../lib/dates.js';
import { formatInTimeZone } from 'date-fns-tz';
import { getUserContext } from '../context.js';
import { loadLedgerRows } from '../ledger.js';
import { categoryBreakdown, debtState, summarize, summarizeDebts, totalBalance } from '../calc.js';
import { accountBalances } from '../ledger.js';
import {
  alertMessage,
  dailyMessage,
  effectiveDailyLimit,
  esc,
  fmt,
  INCOME_SOURCES,
  isOverLimit,
  matchCategory,
  parseQuickEntry,
  monthMessage,
  parseUserAmount,
  T,
  type IncomeSource,
  type Lang,
} from './insights.js';

/* ------------------------------ Telegram API ------------------------------ */

export type TgSender = (method: string, body: Record<string, unknown>) => Promise<unknown>;

export const telegramToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
export const telegramEnabled = () => !!telegramToken();

/** Сирри webhook аз токен ҳосил мешавад — Telegram онро дар header мефиристад */
export const webhookSecret = () =>
  crypto.createHash('sha256').update(`hisob-webhook:${telegramToken()}`).digest('hex').slice(0, 48);

const realSender: TgSender = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${telegramToken()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
  return data.result;
};

let sender: TgSender = realSender;
/** Барои тестҳо: паёмҳо ба ҷои Telegram ба функсияи дигар мераванд */
export function setTelegramSender(s: TgSender | null) {
  sender = s ?? realSender;
}

let cachedBotUsername: string | null = null;
export async function botUsername(): Promise<string | null> {
  if (!telegramEnabled()) return null;
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const me = (await sender('getMe', {})) as { username?: string };
    cachedBotUsername = me.username ?? null;
  } catch {
    return null;
  }
  return cachedBotUsername;
}

export async function send(chatId: string, text: string, extra: Record<string, unknown> = {}) {
  return sender('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}

/** Ҳангоми оғози сервер: webhook-ро ба суроғаи сайт насб мекунад */
export async function setupWebhook(publicUrl: string) {
  if (!telegramEnabled() || !/^https:\/\//.test(publicUrl)) return false;
  await sender('setWebhook', {
    url: `${publicUrl.replace(/\/$/, '')}/api/telegram/webhook`,
    secret_token: webhookSecret(),
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
  await sender('setMyCommands', {
    commands: [
      { command: 'today', description: 'Ҳисоботи имрӯз / Отчёт за сегодня' },
      { command: 'month', description: 'Ҳисоботи моҳ / Отчёт за месяц' },
      { command: 'balance', description: 'Баланс' },
      { command: 'debts', description: 'Қарзҳо / Долги' },
      { command: 'limit', description: 'Меъёри рӯзона / Дневная норма' },
      { command: 'daily', description: 'Ҳисоботи 21:00 / Отчёт в 21:00' },
      { command: 'help', description: 'Кӯмак / Помощь' },
    ],
  }).catch(() => undefined);
  return true;
}

/* ------------------------------ Пайвастшавӣ ------------------------------ */

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Коди яккаратаи 15-дақиқаӣ барои t.me/bot?start=CODE */
export async function createLinkCode(userId: string) {
  const code = crypto.randomBytes(18).toString('base64url');
  await prisma.telegramLinkCode.deleteMany({ where: { userId } });
  await prisma.telegramLinkCode.create({
    data: { userId, codeHash: hash(code), expiresAt: new Date(Date.now() + 15 * 60_000) },
  });
  return code;
}

async function consumeLinkCode(code: string) {
  const rec = await prisma.telegramLinkCode.findUnique({ where: { codeHash: hash(code) } });
  if (!rec) return null;
  await prisma.telegramLinkCode.delete({ where: { id: rec.id } });
  if (rec.expiresAt < new Date()) return null;
  return rec.userId;
}

/* ------------------------------ Маълумоти рӯз ------------------------------ */

function daysInMonth(day: string) {
  const [y, m] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Ҳамаи рақамҳо барои ҳисобот ва огоҳӣ (дар асъори асосӣ) */
export async function computeDay(userId: string, day: string) {
  const ctx = await getUserContext(userId);
  const view = { base: ctx.base, rates: ctx.rates };
  const monthStart = `${day.slice(0, 7)}-01`;
  const from30 = shiftDay(day, -30);
  const earliest = monthStart < from30 ? monthStart : from30;
  const rows = await loadLedgerRows(userId, startOfDayTz(earliest), endOfDayExclusiveTz(day));
  const dayStart = startOfDayTz(day).getTime();
  const within = (a: string, b: string) => {
    const s = startOfDayTz(a).getTime();
    const e = endOfDayExclusiveTz(b).getTime();
    return rows.filter((r) => r.occurredAt.getTime() >= s && r.occurredAt.getTime() < e);
  };
  const todayRows = rows.filter((r) => r.occurredAt.getTime() >= dayStart);
  const prev30 = summarize(within(from30, shiftDay(day, -1)), view);
  const avgDaily30 = money(dec(prev30.expense).div(30));
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  const limit = effectiveDailyLimit({
    dailyLimit: link?.dailyLimit,
    monthlyIncome: link?.monthlyIncome,
    avgDaily30: prev30.expenseCount >= 5 ? avgDaily30 : null, // миёна танҳо бо маълумоти кофӣ
    daysInMonth: daysInMonth(day),
  });
  return {
    day,
    base: ctx.base,
    summary: summarize(todayRows, view),
    operations: todayRows.length,
    expenseByCategory: categoryBreakdown(todayRows, 'EXPENSE', view),
    avgDaily30,
    limit,
    month: summarize(within(monthStart, day), view),
    monthExpenseByCategory: categoryBreakdown(within(monthStart, day), 'EXPENSE', view),
  };
}

async function userLang(userId: string): Promise<Lang> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { language: true } });
  return (u?.language as Lang) ?? 'tg';
}

/* ------------------------------ Огоҳӣ ------------------------------ */

/**
 * Пас аз ҳар хароҷот даъват мешавад. Агар хароҷоти имрӯз аз меъёр гузарад —
 * як бор дар рӯз огоҳӣ мефиристад. Хатогиҳо ҳеҷ гоҳ ба корбар таъсир намерасонанд.
 */
export async function checkSpendingAlert(userId: string, now = new Date()) {
  if (!telegramEnabled()) return false;
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  if (!link || link.step !== 'done') return false;
  const day = todayKey(now);
  if (link.lastAlertDay === day) return false;
  const d = await computeDay(userId, day);
  if (!isOverLimit(d.summary.expense, d.limit)) return false;
  // Идемпотент: танҳо як дархост "соҳиб"-и огоҳии имрӯз мешавад
  const claimed = await prisma.telegramLink.updateMany({
    where: { id: link.id, OR: [{ lastAlertDay: null }, { lastAlertDay: { not: day } }] },
    data: { lastAlertDay: day },
  });
  if (claimed.count !== 1) return false;
  const lang = await userLang(userId);
  await send(link.chatId, alertMessage(d.summary.expense, d.limit!, d.avgDaily30, d.expenseByCategory, d.base, lang));
  return true;
}

/* ------------------------------ Ҳисоботи 21:00 ------------------------------ */

export const DAILY_HOUR = 21;

/**
 * Ба ҳамаи корбарони пайвастшуда ҳисоботи рӯзро мефиристад (агар соат ≥ 21:00 бошад
 * ва имрӯз ҳанӯз нафиристода бошад). Бехатар аст, ки бисёр маротиба даъват шавад.
 */
export async function sendDailySummaries(now = new Date()) {
  if (!telegramEnabled()) return { sent: 0 };
  const hour = Number(formatInTimeZone(now, TZ, 'H'));
  if (hour < DAILY_HOUR) return { sent: 0, waiting: true };
  const day = todayKey(now);
  const links = await prisma.telegramLink.findMany({
    where: { notifyDaily: true, step: 'done', OR: [{ lastDailyDay: null }, { lastDailyDay: { not: day } }] },
  });
  let sent = 0;
  for (const link of links) {
    const claimed = await prisma.telegramLink.updateMany({
      where: { id: link.id, OR: [{ lastDailyDay: null }, { lastDailyDay: { not: day } }] },
      data: { lastDailyDay: day },
    });
    if (claimed.count !== 1) continue;
    try {
      const d = await computeDay(link.userId, day);
      await send(link.chatId, dailyMessage(d, await userLang(link.userId)));
      sent++;
    } catch (e) {
      // Агар фиристода нашуд — бори дигар кӯшиш карда шавад
      await prisma.telegramLink.update({ where: { id: link.id }, data: { lastDailyDay: link.lastDailyDay } });
      console.error('[telegram] daily failed', e);
    }
  }
  return { sent };
}

/* ------------------------------ Қабули паёмҳо ------------------------------ */

interface TgUpdate {
  message?: { text?: string; chat: { id: number; type: string }; from?: { username?: string } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number; type: string } }; from?: { username?: string } };
}

function sourceKeyboard(lang: Lang) {
  const t = T[lang];
  const b = (s: IncomeSource) => ({ text: t.src[s], callback_data: `src:${s}` });
  return { inline_keyboard: [[b('SALARY'), b('BUSINESS')], [b('TRADE'), b('SERVICES')], [b('OTHER')]] };
}

const skipKeyboard = (lang: Lang) => ({ inline_keyboard: [[{ text: T[lang].skip, callback_data: 'income:skip' }]] });

/** Менюи доимӣ дар поёни чат */
export function menuKeyboard(lang: Lang) {
  const m = T[lang].menu;
  return {
    keyboard: [[{ text: m.today }, { text: m.month }], [{ text: m.balance }, { text: m.debts }], [{ text: m.help }]],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: lang === 'ru' ? '50 еда · +3000 зарплата' : '50 хӯрок · +3000 маош',
  };
}

/** Тугмаҳои меню (ҳар ду забон) → фармон */
function menuCommand(text: string): string | null {
  for (const lang of ['tg', 'ru'] as const) {
    const m = T[lang].menu;
    if (text === m.today) return 'today';
    if (text === m.month) return 'month';
    if (text === m.balance) return 'balance';
    if (text === m.debts) return 'debts';
    if (text === m.help) return 'help';
  }
  return null;
}

async function finishOnboarding(chatId: string, userId: string, lang: Lang) {
  await prisma.telegramLink.update({ where: { userId }, data: { step: 'done' } });
  const d = await computeDay(userId, todayKey());
  await send(chatId, T[lang].done(d.limit ? `${money(d.limit.value)} смн` : null), { reply_markup: menuKeyboard(lang) });
}

/** Баланси ҳамаи ҳисобҳо */
export async function balanceMessage(userId: string, lang: Lang) {
  const t = T[lang];
  const [{ accounts, balances }, ctx] = await Promise.all([accountBalances(userId, undefined, false), getUserContext(userId)]);
  if (!accounts.length) return t.noAccount;
  const total = totalBalance(accounts, balances, ctx.base, ctx.rates);
  const lines = [t.balanceTitle, ''];
  for (const a of accounts) lines.push(`• ${esc(a.name)} — <b>${fmt(balances.get(a.id) ?? 0, a.currency)}</b>`);
  lines.push('', `${t.balanceTotal}: <b>${fmt(total.total, ctx.base)}</b>`);
  if (total.missingRates.length) lines.push(t.missing(total.missingRates.join(', ')));
  return lines.join('\n');
}

/** Қарзҳои кушода */
export async function debtsMessage(userId: string, lang: Lang) {
  const t = T[lang];
  const [debts, ctx] = await Promise.all([
    prisma.debt.findMany({ where: { userId }, include: { payments: true }, orderBy: { issuedAt: 'desc' } }),
    getUserContext(userId),
  ]);
  const open = debts
    .map((d) => ({ d, s: debtState(d, d.payments) }))
    .filter((x) => x.s.status !== 'PAID')
    .sort((a, b) => (a.s.status === 'OVERDUE' ? -1 : 0) - (b.s.status === 'OVERDUE' ? -1 : 0));
  if (!open.length) return `${t.debtsTitle}\n\n${t.debtsNone}`;
  const sum = summarizeDebts(debts, ctx.base, ctx.rates);
  const lines = [
    t.debtsTitle,
    '',
    `🟢 ${t.debtsLent}: <b>${fmt(sum.lent.remaining, ctx.base)}</b>`,
    `🔴 ${t.debtsBorrowed}: <b>${fmt(sum.borrowed.remaining, ctx.base)}</b>`,
    '',
  ];
  for (const { d, s } of open.slice(0, 10)) {
    const icon = d.direction === 'LENT' ? '🟢' : '🔴';
    const due = d.dueDate
      ? s.status === 'OVERDUE'
        ? ` · ⚠️ ${t.overdue} (${formatInTimeZone(d.dueDate, TZ, 'dd.MM.yyyy')})`
        : ` · ${t.due} ${formatInTimeZone(d.dueDate, TZ, 'dd.MM.yyyy')}`
      : '';
    lines.push(`${icon} ${esc(d.counterparty)} — <b>${fmt(s.remaining, d.currency)}</b>${due}`);
  }
  if (sum.missingRates.length) lines.push('', t.missing(sum.missingRates.join(', ')));
  return lines.join('\n');
}

/** Сабти даромад/хароҷот аз паёми "50 хӯрок" */
async function quickAdd(chatId: string, userId: string, lang: Lang, entry: { type: 'INCOME' | 'EXPENSE'; amount: string; text: string }) {
  const t = T[lang];
  const ctx = await getUserContext(userId);
  const accounts = await prisma.account.findMany({ where: { userId, archived: false }, orderBy: { createdAt: 'asc' } });
  // Ҳисоби пешфарз: нақд дар асъори асосӣ → ҳар ҳисоби асъори асосӣ → аввалин
  const account =
    accounts.find((a) => a.type === 'CASH' && a.currency === ctx.base) ??
    accounts.find((a) => a.currency === ctx.base) ??
    accounts[0];
  if (!account) return send(chatId, t.noAccount);
  const categories = await prisma.category.findMany({ where: { userId, kind: entry.type }, orderBy: { createdAt: 'asc' } });
  const category = matchCategory(entry.text, categories);
  const tx = await prisma.transaction.create({
    data: {
      userId,
      accountId: account.id,
      type: entry.type,
      amount: entry.amount,
      currency: account.currency,
      categoryId: category?.id ?? null,
      occurredAt: new Date(),
      paymentMethod: account.type === 'CASH' ? 'CASH' : account.type === 'BANK' ? 'BANK' : 'CARD',
      source: entry.type === 'INCOME' ? entry.text || null : null,
      purpose: entry.type === 'EXPENSE' ? entry.text || null : null,
      note: 'Telegram',
    },
  });
  await send(chatId, t.added(entry.type, fmt(entry.amount, account.currency), category?.name ?? '—', account.name, entry.text), {
    reply_markup: { inline_keyboard: [[{ text: t.undo, callback_data: `undo:${tx.id}` }]] },
  });
  if (entry.type === 'EXPENSE') await checkSpendingAlert(userId).catch((e) => console.error('[telegram] alert', e));
}

export async function handleUpdate(update: TgUpdate) {
  // Callback (тугмаҳо)
  if (update.callback_query) {
    const cq = update.callback_query;
    await sender('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => undefined);
    const chat = cq.message?.chat;
    if (!chat || chat.type !== 'private') return;
    const chatId = String(chat.id);
    const link = await prisma.telegramLink.findUnique({ where: { chatId } });
    if (!link) return;
    const lang = await userLang(link.userId);
    const data = cq.data ?? '';
    if (data.startsWith('src:') && (INCOME_SOURCES as readonly string[]).includes(data.slice(4))) {
      await prisma.telegramLink.update({ where: { id: link.id }, data: { incomeSource: data.slice(4), step: 'monthly_income' } });
      await send(chatId, T[lang].askIncome, { reply_markup: skipKeyboard(lang) });
    } else if (data === 'income:skip') {
      await finishOnboarding(chatId, link.userId, lang);
    } else if (data.startsWith('undo:')) {
      // Танҳо амалиёти худи ҳамин корбар, ки аз Telegram сабт шудааст
      const del = await prisma.transaction.deleteMany({
        where: { id: data.slice(5), userId: link.userId, note: 'Telegram', type: { in: ['INCOME', 'EXPENSE'] } },
      });
      await send(chatId, del.count ? T[lang].undone : T[lang].undoFail);
    }
    return;
  }

  const msg = update.message;
  if (!msg || !msg.text) return;
  // Маълумоти молиявӣ танҳо дар чати шахсӣ — ҳеҷ гоҳ дар гурӯҳҳо
  if (msg.chat.type !== 'private') return;
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const [cmdRaw, ...args] = text.split(/\s+/);
  const cmd = cmdRaw.startsWith('/') ? cmdRaw.slice(1).split('@')[0].toLowerCase() : menuCommand(text) ?? '';

  // /start CODE — пайвастшавӣ
  if (cmd === 'start' && args[0]) {
    const userId = await consumeLinkCode(args[0]);
    if (!userId) return send(chatId, T.tg.badCode);
    const lang = await userLang(userId);
    await prisma.$transaction([
      // чат ё корбар метавонад пештар бо дигаре пайваст бошад
      prisma.telegramLink.deleteMany({ where: { OR: [{ chatId }, { userId }] } }),
      prisma.telegramLink.create({ data: { userId, chatId, username: msg.from?.username ?? null, step: 'income_source' } }),
    ]);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    await send(chatId, T[lang].linked(u.name));
    await send(chatId, T[lang].askSource, { reply_markup: sourceKeyboard(lang) });
    return;
  }

  const link = await prisma.telegramLink.findUnique({ where: { chatId } });
  if (!link) return send(chatId, T.tg.notLinked);
  const lang = await userLang(link.userId);
  const t = T[lang];

  // Саволи даромади моҳона (бе фармон)
  if (!cmd && link.step === 'monthly_income') {
    const amount = parseUserAmount(text);
    if (!amount) return send(chatId, t.badAmount, { reply_markup: skipKeyboard(lang) });
    await prisma.telegramLink.update({ where: { id: link.id }, data: { monthlyIncome: amount } });
    return finishOnboarding(chatId, link.userId, lang);
  }
  if (!cmd && link.step === 'income_source') {
    return send(chatId, t.askSource, { reply_markup: sourceKeyboard(lang) });
  }

  // "50 хӯрок", "+3000 маош" — сабти зуд
  if (!cmd) {
    const entry = parseQuickEntry(text);
    if (entry) return quickAdd(chatId, link.userId, lang, entry);
    return send(chatId, `${t.unknown}\n\n${t.quickHint}`, { reply_markup: menuKeyboard(lang) });
  }

  switch (cmd) {
    case 'start':
    case 'help':
      return send(chatId, t.help, { reply_markup: menuKeyboard(lang) });
    case 'balance':
      return send(chatId, await balanceMessage(link.userId, lang));
    case 'debts':
      return send(chatId, await debtsMessage(link.userId, lang));
    case 'today': {
      const d = await computeDay(link.userId, todayKey());
      return send(chatId, dailyMessage({ ...d, month: undefined }, lang));
    }
    case 'month': {
      const d = await computeDay(link.userId, todayKey());
      return send(chatId, monthMessage(d.day.slice(0, 7), d.month, d.monthExpenseByCategory, lang));
    }
    case 'limit': {
      if (!args[0]) {
        const d = await computeDay(link.userId, todayKey());
        return send(chatId, t.limitNow(d.limit ? `${d.limit.value} смн` : null, d.limit?.basis ?? null));
      }
      if (/^(auto|авто|худкор)$/i.test(args[0])) {
        await prisma.telegramLink.update({ where: { id: link.id }, data: { dailyLimit: null } });
        const d = await computeDay(link.userId, todayKey());
        return send(chatId, t.limitAuto(d.limit ? `${d.limit.value} смн` : null));
      }
      const amount = parseUserAmount(args.join(''));
      if (!amount) return send(chatId, t.badAmount);
      await prisma.telegramLink.update({ where: { id: link.id }, data: { dailyLimit: amount, lastAlertDay: null } });
      return send(chatId, t.limitSet(`${amount} смн`));
    }
    case 'daily': {
      const on = !link.notifyDaily;
      await prisma.telegramLink.update({ where: { id: link.id }, data: { notifyDaily: on } });
      return send(chatId, on ? t.dailyOn : t.dailyOff);
    }
    case 'stop':
      await prisma.telegramLink.delete({ where: { id: link.id } });
      return send(chatId, t.unlinked);
    default:
      return send(chatId, t.unknown);
  }
}
