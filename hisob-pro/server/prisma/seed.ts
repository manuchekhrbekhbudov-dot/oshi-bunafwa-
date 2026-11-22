/**
 * Маълумоти намоишӣ: demo@hisob.pro / demo12345
 * Иҷро: npm run db:seed
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { createUserDefaults } from '../src/services/defaults.js';

const prisma = new PrismaClient();
const TZ = 'Asia/Dushanbe';

function rnd(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function at(daysAgo: number, hour: number) {
  const d = new Date(Date.now() - daysAgo * 86400_000);
  const day = formatInTimeZone(d, TZ, 'yyyy-MM-dd');
  return fromZonedTime(`${day}T${String(hour).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`, TZ);
}

async function main() {
  const email = 'demo@hisob.pro';
  await prisma.user.deleteMany({ where: { email } });
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { email, name: 'Корбари Демо', passwordHash: await bcrypt.hash('demo12345', 12), language: 'tg' },
    });
    await createUserDefaults(tx, u.id);
    return u;
  });
  const userId = user.id;
  const cash = await prisma.account.findFirstOrThrow({ where: { userId, type: 'CASH' } });
  await prisma.account.update({ where: { id: cash.id }, data: { initialBalance: '2500.00' } });
  const card = await prisma.account.create({ data: { userId, name: 'Корти Алиф', type: 'CARD', currency: 'TJS', color: '#8b5cf6', initialBalance: '4000.00' } });
  const bank = await prisma.account.create({ data: { userId, name: 'Ҳисоби бонкӣ', type: 'BANK', currency: 'TJS', color: '#3b82f6', initialBalance: '15000.00' } });
  const usd = await prisma.account.create({ data: { userId, name: 'Доллар (нақд)', type: 'CASH', currency: 'USD', color: '#22c55e', initialBalance: '300.00' } });
  await prisma.account.create({ data: { userId, name: 'Ҳамёни электронӣ', type: 'EWALLET', currency: 'TJS', color: '#06b6d4', initialBalance: '350.00' } });
  await prisma.exchangeRate.createMany({ data: [{ userId, currency: 'USD', rate: '10.950000' }, { userId, currency: 'RUB', rate: '0.115000' }] });

  const cats = await prisma.category.findMany({ where: { userId } });
  const cat = (kind: 'INCOME' | 'EXPENSE', name: string) => cats.find((c) => c.kind === kind && c.name === name)!.id;

  const data: Prisma.TransactionCreateManyInput[] = [];
  for (let d = 0; d < 400; d++) {
    if (d % 30 === 3) data.push({ userId, accountId: bank.id, type: 'INCOME', amount: '8500.00', currency: 'TJS', categoryId: cat('INCOME', 'Маош'), occurredAt: at(d, 10), source: 'Ширкати «Сомон»', paymentMethod: 'BANK' });
    if (Math.random() < 0.6) data.push({ userId, accountId: cash.id, type: 'INCOME', amount: rnd(150, 900).toFixed(2), currency: 'TJS', categoryId: cat('INCOME', 'Савдо'), occurredAt: at(d, 13), source: 'Мағоза', paymentMethod: 'CASH' });
    if (Math.random() < 0.2) data.push({ userId, accountId: card.id, type: 'INCOME', amount: rnd(200, 1500).toFixed(2), currency: 'TJS', categoryId: cat('INCOME', 'Хизматрасонӣ'), occurredAt: at(d, 16), source: 'Мизоҷ', paymentMethod: 'CARD' });
    data.push({ userId, accountId: cash.id, type: 'EXPENSE', amount: rnd(30, 140).toFixed(2), currency: 'TJS', categoryId: cat('EXPENSE', 'Хӯрок'), occurredAt: at(d, 14), purpose: 'Хӯроки нисфирӯзӣ', paymentMethod: 'CASH' });
    if (Math.random() < 0.5) data.push({ userId, accountId: card.id, type: 'EXPENSE', amount: rnd(10, 60).toFixed(2), currency: 'TJS', categoryId: cat('EXPENSE', 'Нақлиёт'), occurredAt: at(d, 9), purpose: 'Такси', paymentMethod: 'CARD' });
    if (d % 30 === 1) data.push({ userId, accountId: bank.id, type: 'EXPENSE', amount: '3000.00', currency: 'TJS', categoryId: cat('EXPENSE', 'Иҷора'), occurredAt: at(d, 11), purpose: 'Иҷораи мағоза', paymentMethod: 'BANK' });
    if (d % 30 === 5) data.push({ userId, accountId: card.id, type: 'EXPENSE', amount: '250.00', currency: 'TJS', categoryId: cat('EXPENSE', 'Интернет'), occurredAt: at(d, 12), purpose: 'Интернет ва алоқа', paymentMethod: 'CARD' });
    if (d % 30 === 4) data.push({ userId, accountId: bank.id, type: 'EXPENSE', amount: '2400.00', currency: 'TJS', categoryId: cat('EXPENSE', 'Маоши кормандон'), occurredAt: at(d, 17), purpose: 'Маоши фурӯшанда', paymentMethod: 'BANK' });
    if (Math.random() < 0.15) data.push({ userId, accountId: cash.id, type: 'EXPENSE', amount: rnd(300, 1800).toFixed(2), currency: 'TJS', categoryId: cat('EXPENSE', 'Мол'), occurredAt: at(d, 8), purpose: 'Харидани мол', paymentMethod: 'CASH' });
    if (d % 45 === 10) data.push({ userId, accountId: usd.id, type: 'INCOME', amount: rnd(100, 300).toFixed(2), currency: 'USD', categoryId: cat('INCOME', 'Тиҷорат'), occurredAt: at(d, 15), source: 'Фармоиши хориҷӣ', paymentMethod: 'CASH' });
  }
  await prisma.transaction.createMany({ data });

  // Интиқол
  const when = at(2, 18);
  await prisma.transfer.create({
    data: {
      userId, fromAccountId: cash.id, toAccountId: card.id, amountFrom: '1000.00', amountTo: '1000.00', occurredAt: when, note: 'Ба корт',
      transactions: { create: [
        { userId, accountId: cash.id, type: 'TRANSFER_OUT', amount: '1000.00', currency: 'TJS', occurredAt: when, note: 'Ба корт' },
        { userId, accountId: card.id, type: 'TRANSFER_IN', amount: '1000.00', currency: 'TJS', occurredAt: when, note: 'Ба корт' },
      ] },
    },
  });

  // Қарзҳо
  const d1 = await prisma.debt.create({
    data: {
      userId, direction: 'LENT', counterparty: 'Фирдавс', phone: '+992 90 123 4567', amount: '2000.00', currency: 'TJS', accountId: cash.id,
      issuedAt: at(40, 12), dueDate: at(-20, 12), note: 'Барои таъмири мошин',
      transactions: { create: { userId, accountId: cash.id, type: 'DEBT_LENT', amount: '2000.00', currency: 'TJS', occurredAt: at(40, 12), note: 'Фирдавс' } },
    },
  });
  const p = await prisma.debtPayment.create({ data: { userId, debtId: d1.id, amount: '700.00', accountId: cash.id, paidAt: at(10, 12) } });
  await prisma.transaction.create({ data: { userId, debtId: d1.id, debtPaymentId: p.id, accountId: cash.id, type: 'DEBT_COLLECTED', amount: '700.00', currency: 'TJS', occurredAt: at(10, 12), note: 'Фирдавс' } });

  await prisma.debt.create({
    data: {
      userId, direction: 'BORROWED', counterparty: 'Таъминкунанда «Барака»', amount: '5000.00', currency: 'TJS', accountId: bank.id,
      issuedAt: at(60, 10), dueDate: at(5, 10), note: 'Мол насия',
      transactions: { create: { userId, accountId: bank.id, type: 'DEBT_BORROWED', amount: '5000.00', currency: 'TJS', occurredAt: at(60, 10), note: 'Барака' } },
    },
  });
  await prisma.debt.create({
    data: { userId, direction: 'LENT', counterparty: 'Самандар', amount: '150.00', currency: 'USD', issuedAt: at(15, 10), dueDate: at(-45, 10) },
  });

  console.log(`✔ Демо сохта шуд: ${email} / demo12345  (${data.length} амалиёт)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
