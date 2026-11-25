/**
 * Амалҳои нақшаҳо, ки ҳам сайт ва ҳам бот истифода мебаранд:
 * сабти пардохти доимӣ ва гузоштани пул ба мақсад.
 */
import { prisma } from '../lib/prisma.js';
import { todayKey } from '../lib/dates.js';
import { badRequest, notFound } from '../lib/errors.js';
import { dec, money } from '../lib/money.js';
import { goalStats } from './plans.js';
import { send, telegramEnabled } from './telegram/transport.js';
import { T, fmt } from './telegram/insights.js';

const pmFor = (type: string) => (type === 'CASH' ? 'CASH' : type === 'BANK' ? 'BANK' : 'CARD') as 'CASH' | 'BANK' | 'CARD';

/** «✅ Пардохт шуд»: амалиёти даромад/хароҷот сабт мешавад ва моҳ «сабтшуда» қайд мегардад */
export async function payRecurring(userId: string, id: string, opts: { accountId?: string | null; amount?: string | null } = {}) {
  const r = await prisma.recurringPayment.findFirst({ where: { id, userId } });
  if (!r) throw notFound('Пардохт ёфт нашуд');
  const month = todayKey().slice(0, 7);
  if (r.lastPaidKey === month) throw badRequest('ALREADY_PAID', 'Ин моҳ аллакай сабт шудааст');
  const accounts = await prisma.account.findMany({ where: { userId, archived: false, currency: r.currency }, orderBy: { createdAt: 'asc' } });
  const wanted = opts.accountId ?? r.accountId;
  const account = accounts.find((a) => a.id === wanted) ?? accounts.find((a) => a.type === 'CASH') ?? accounts[0];
  if (!account) throw badRequest('NO_ACCOUNT', `Ҳисоб бо асъори ${r.currency} нест`);
  const amount = opts.amount ?? r.amount.toFixed(2);
  const [tx] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        type: r.type,
        amount,
        currency: r.currency,
        categoryId: r.categoryId,
        occurredAt: new Date(),
        paymentMethod: pmFor(account.type),
        source: r.type === 'INCOME' ? r.title : null,
        purpose: r.type === 'EXPENSE' ? r.title : null,
        note: 'Пардохти доимӣ',
      },
    }),
    prisma.recurringPayment.update({ where: { id: r.id }, data: { lastPaidKey: month, lastRemindKey: month } }),
  ]);
  return { tx, account, recurring: r };
}

export async function skipRecurring(userId: string, id: string) {
  const r = await prisma.recurringPayment.findFirst({ where: { id, userId } });
  if (!r) throw notFound('Пардохт ёфт нашуд');
  const month = todayKey().slice(0, 7);
  await prisma.recurringPayment.update({ where: { id: r.id }, data: { lastSkipKey: month, lastRemindKey: month } });
  return r;
}

/** Пул ба мақсад (манфӣ — гирифтан). Мақсад иҷро шуд → табрик дар Telegram. */
export async function contributeToGoal(userId: string, goalId: string, amount: string, note: string | null) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } });
  if (!goal) throw notFound('Мақсад ёфт нашуд');
  if (dec(amount).isZero()) throw badRequest('VALIDATION_ERROR', 'Маблағ сифр буда наметавонад');
  const contribution = await prisma.goalContribution.create({ data: { goalId, userId, amount, note } });
  const all = await prisma.goalContribution.findMany({ where: { goalId }, select: { amount: true } });
  const stats = goalStats(goal, all);
  if (stats.achieved && !goal.achievedAt) {
    await prisma.goal.update({ where: { id: goal.id }, data: { achievedAt: new Date() } });
    if (telegramEnabled()) {
      const link = await prisma.telegramLink.findUnique({ where: { userId }, include: { user: { select: { language: true } } } });
      if (link) {
        const lang = link.user.language === 'ru' ? 'ru' : 'tg';
        await send(link.chatId, T[lang].goalAchieved(goal.title, fmt(goal.target, goal.currency))).catch(() => undefined);
      }
    }
  } else if (!stats.achieved && goal.achievedAt) {
    await prisma.goal.update({ where: { id: goal.id }, data: { achievedAt: null } });
  }
  return { contribution, stats, goal, savedText: money(stats.saved) };
}
