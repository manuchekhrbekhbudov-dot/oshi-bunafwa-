import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { fromZonedTime } from 'date-fns-tz';
import { dueDay, goalStats, recurringReminderDue, recurringStatus } from '../src/services/plans.js';
import { parseNbtXml, rateFor, type TjsRates } from '../src/services/rates.js';

const hasDb = !!process.env.TEST_DATABASE_URL;
process.env.TELEGRAM_BOT_TOKEN = 'test-token:plans';
const at = (local: string) => fromZonedTime(local, 'Asia/Dushanbe');

const NBT_XML = `<?xml version="1.0" encoding="windows-1251" ?>
<ValCurs Date="2026-11-25" name="Котировки">
<Valute ID="840"><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Доллар</Name><Value>9.2393</Value></Valute>
<Valute ID="810"><CharCode>RUB</CharCode><Nominal>1</Nominal><Name>Рубль</Name><Value>0.1126</Value></Valute>
<Valute ID="860"><CharCode>UZS</CharCode><Nominal>100</Nominal><Name>Сум</Name><Value>0.0770</Value></Valute>
</ValCurs>`;

describe('нақшаҳо ва қурб (ҳисобкунии соф)', () => {
  it('XML-и Бонки миллӣ', () => {
    const r = parseNbtXml(NBT_XML);
    expect(r.USD!.toFixed(4)).toBe('9.2393');
    expect(r.RUB!.toFixed(4)).toBe('0.1126');
    expect(r.UZS!.toFixed(6)).toBe('0.000770'); // Nominal 100
  });

  it('қурб нисбат ба асъори асосӣ', () => {
    const t: TjsRates = { source: 'nbt', date: '2026-11-25', tjsPer: { TJS: '1', USD: '9.2393', RUB: '0.1126' } };
    expect(rateFor(t, 'USD', 'TJS')).toBe('9.239300');
    expect(rateFor(t, 'RUB', 'TJS')).toBe('0.112600');
    expect(rateFor(t, 'TJS', 'USD')).toBe('0.108233');
    expect(rateFor(t, 'RUB', 'USD')).toBe('0.012187');
  });

  it('мақсад: пасандоз, фоиз ва ҳар рӯз чанд', () => {
    const deadline = fromZonedTime('2026-12-11T00:00', 'Asia/Dushanbe'); // охири 10 декабр
    const s = goalStats({ target: '3000', deadline } as never, [{ amount: '500' }, { amount: '700' }, { amount: '-200' }] as never, '2026-12-01');
    expect(s).toMatchObject({ saved: '1000.00', remaining: '2000.00', progress: 33, achieved: false, daysLeft: 10, perDay: '200.00' });
    // PlayStation: 6500 то 01.01.2027, имрӯз 25.11.2026 → 38 рӯз ≈ 1.25 моҳ
    const ps = goalStats({ target: '6500', deadline: fromZonedTime('2027-01-02T00:00', 'Asia/Dushanbe') } as never, [] as never, '2026-11-25');
    expect(ps).toMatchObject({ daysLeft: 38, perDay: '171.06', perMonth: '5206.42' });
    // корбар: «ҳар моҳ 1500 метавонам» → 6500/1500 = 5 моҳ → 25.04.2027
    const plan = goalStats({ target: '6500', deadline: null, monthly: '1500' } as never, [{ amount: '500' }] as never, '2026-11-25');
    expect(plan).toMatchObject({ monthly: '1500.00', monthsNeeded: 4, etaDate: '2027-03-25', lateForDeadline: false });
    const late = goalStats({ target: '6500', deadline: fromZonedTime('2027-01-02T00:00', 'Asia/Dushanbe'), monthly: '1500' } as never, [] as never, '2026-11-25');
    expect(late).toMatchObject({ monthsNeeded: 5, etaDate: '2027-04-25', lateForDeadline: true });
    // мӯҳлат гузашт
    expect(goalStats({ target: '100', deadline: fromZonedTime('2026-01-02T00:00', 'Asia/Dushanbe') } as never, [] as never, '2026-11-25')).toMatchObject({ daysLeft: 0, perMonth: null });
    expect(goalStats({ target: '100', deadline: null } as never, [{ amount: '150' }] as never).achieved).toBe(true);
    expect(goalStats({ target: '100', deadline: null } as never, [{ amount: '150' }] as never).progress).toBe(100);
  });

  it('пардохти доимӣ: рӯзи моҳ ва ҳолат', () => {
    expect(dueDay('2026-02', 31)).toBe('2026-02-28');
    expect(dueDay('2026-11', 5)).toBe('2026-11-05');
    const r = { dayOfMonth: 10, lastPaidKey: null, lastSkipKey: null };
    expect(recurringStatus(r, '2026-11-05')).toMatchObject({ status: 'upcoming', dueDate: '2026-11-10', daysUntil: 5 });
    expect(recurringStatus(r, '2026-11-10')).toMatchObject({ status: 'due', daysUntil: 0 });
    expect(recurringStatus(r, '2026-11-12').status).toBe('overdue');
    expect(recurringStatus({ ...r, lastPaidKey: '2026-11' }, '2026-11-12')).toMatchObject({ status: 'paid', nextDate: '2026-12-10' });
  });

  it('ёдраскунӣ: аз 09:00-и рӯзи пардохт, як бор дар моҳ', () => {
    const r = { active: true, dayOfMonth: 10, lastPaidKey: null, lastSkipKey: null, lastRemindKey: null };
    expect(recurringReminderDue(r, '2026-11-09', 12)).toBe(false);
    expect(recurringReminderDue(r, '2026-11-10', 8)).toBe(false);
    expect(recurringReminderDue(r, '2026-11-10', 9)).toBe(true);
    expect(recurringReminderDue(r, '2026-11-13', 9)).toBe(true); // сервер хоб буд
    expect(recurringReminderDue(r, '2026-11-16', 9)).toBe(false);
    expect(recurringReminderDue({ ...r, lastRemindKey: '2026-11' }, '2026-11-10', 10)).toBe(false);
    expect(recurringReminderDue({ ...r, lastPaidKey: '2026-11' }, '2026-11-10', 10)).toBe(false);
  });
});

describe.skipIf(!hasDb)('нақшаҳо ва қурб (integration)', () => {
  let app: Express;
  let prisma: (typeof import('../src/lib/prisma.js'))['prisma'];
  let bot: typeof import('../src/services/telegram/bot.js');
  let rates: typeof import('../src/services/rates.js');
  let A: ReturnType<typeof request.agent>;
  let B: ReturnType<typeof request.agent>;
  let userId = '';
  let cash = '';
  let rent = '';
  const CHAT = 990888;
  const sent: { text: string; markup: unknown }[] = [];
  const hook = (u: object) => request(app).post('/api/telegram/webhook').set('x-telegram-bot-api-secret-token', bot.webhookSecret()).send(u).expect(200);
  const say = (text: string) => hook({ message: { text, chat: { id: CHAT, type: 'private' }, from: { id: CHAT } } });
  const press = (data: string) => hook({ callback_query: { id: 'p', data, message: { chat: { id: CHAT, type: 'private' } } } });
  const last = () => sent[sent.length - 1]?.text ?? '';

  beforeAll(async () => {
    ({ prisma } = await import('../src/lib/prisma.js'));
    bot = await import('../src/services/telegram/bot.js');
    rates = await import('../src/services/rates.js');
    bot.setTelegramSender(async (method, body) => {
      if (method === 'getMe') return { username: 'hisob_test_bot' };
      if (method === 'sendMessage') sent.push({ text: String(body.text), markup: body.reply_markup });
      return true;
    });
    const { createApp } = await import('../src/app.js');
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Session", "Account", "Category", "Transaction", "TelegramLink", "TelegramLinkCode", "Goal", "RecurringPayment", "AppSetting", "ExchangeRate" CASCADE');
    app = createApp();
    A = request.agent(app);
    B = request.agent(app);
    userId = (await A.post('/api/auth/register').send({ name: 'Алӣ', email: 'plans@test.tj', password: 'parol1234' }).expect(201)).body.user.id;
    await B.post('/api/auth/register').send({ name: 'Вали', email: 'plans2@test.tj', password: 'parol1234' });
    cash = (await A.get('/api/accounts')).body.accounts[0].id;
    rent = (await A.get('/api/categories?kind=EXPENSE')).body.categories.find((c: { name: string }) => c.name === 'Иҷора').id;
    const code = (await A.post('/api/telegram/link').expect(200)).body.url.split('start=')[1];
    await say(`/start ${code}`);
    await press('income:skip');
  });

  afterAll(() => {
    bot?.setTelegramSender(null);
    rates?.setRatesFetcher(null);
  });

  it('мақсад: сохтан, пул гузоштан, иҷро шудан (табрик дар Telegram)', async () => {
    await A.post('/api/goals').send({ title: '', target: '100' }).expect(400);
    await A.post('/api/goals').send({ title: 'Телефон', target: '-5' }).expect(400);
    await A.post('/api/goals').send({ title: 'Кӯҳна', target: '100', deadline: '2020-01-01' }).expect(400); // санаи гузашта
    const g = (await A.post('/api/goals').send({ title: 'Телефон', target: '3000', deadline: '2027-03-01' }).expect(201)).body.goal;
    expect(g).toMatchObject({ title: 'Телефон', target: '3000.00', saved: '0.00', progress: 0, deadline: '2027-03-01' });
    let r = (await A.post(`/api/goals/${g.id}/contributions`).send({ amount: '1000' }).expect(201)).body.goal;
    expect(r).toMatchObject({ saved: '1000.00', remaining: '2000.00', progress: 33 });
    r = (await A.post(`/api/goals/${g.id}/contributions`).send({ amount: '200', withdraw: true }).expect(201)).body.goal;
    expect(r.saved).toBe('800.00');
    await A.post(`/api/goals/${g.id}/contributions`).send({ amount: 'abc' }).expect(400);
    // корбари дигар — не
    await B.post(`/api/goals/${g.id}/contributions`).send({ amount: '10' }).expect(404);
    await B.delete(`/api/goals/${g.id}`).expect(404);
    sent.length = 0;
    r = (await A.post(`/api/goals/${g.id}/contributions`).send({ amount: '2200' }).expect(201)).body.goal;
    expect(r.achieved).toBe(true);
    expect(last()).toContain('Мақсади «Телефон» иҷро шуд');
    // пасандоз ба даромад/хароҷот дохил намешавад
    expect(await prisma.transaction.count({ where: { userId } })).toBe(0);
  });

  it('бот: /goal рӯйхат ва /goal 150', async () => {
    const g2 = (await A.post('/api/goals').send({ title: 'Таътил', target: '1000' }).expect(201)).body.goal;
    await say('/goal');
    expect(last()).toContain('Телефон');
    expect(last()).toContain('Таътил');
    await say('/goal 150 таътил');
    expect(last()).toContain('Ба «Таътил» 150.00 смн гузошта шуд');
    expect((await A.get('/api/goals')).body.goals.find((g: { id: string }) => g.id === g2.id).saved).toBe('150.00');
    await say('/goal 50'); // мақсади аввали иҷронашуда
    expect(last()).toContain('«Таътил»');
  });

  it('пардохти доимӣ: санҷиш ва ҳолат', async () => {
    await A.post('/api/recurring').send({ title: 'Иҷора', amount: '1500', dayOfMonth: 32 }).expect(400);
    await A.post('/api/recurring').send({ title: 'Иҷора', amount: '1500', dayOfMonth: 5, currency: 'USD', accountId: cash }).expect(400); // асъор мувофиқ нест
    const r = (await A.post('/api/recurring').send({ title: 'Иҷора', amount: '1500', dayOfMonth: 5, categoryId: rent, accountId: cash }).expect(201)).body.recurring;
    expect(r).toMatchObject({ title: 'Иҷора', amount: '1500.00', type: 'EXPENSE', accountName: 'Пули нақд', categoryName: 'Иҷора' });
    expect(['upcoming', 'due', 'overdue']).toContain(r.status);
    await B.post(`/api/recurring/${r.id}/pay`).send({}).expect(404);
  });

  it('бот: 09:00-и рӯзи пардохт ёдрас мекунад; «✅ Пардохт шуд» хароҷот сабт мекунад', async () => {
    const r = await prisma.recurringPayment.findFirstOrThrow({ where: { userId } });
    await prisma.recurringPayment.update({ where: { id: r.id }, data: { dayOfMonth: 15 } });
    sent.length = 0;
    expect((await bot.sendRecurringReminders(at('2026-12-15T08:30'))).sent).toBe(0);
    expect((await bot.sendRecurringReminders(at('2026-12-15T09:05'))).sent).toBe(1);
    expect(last()).toContain('«Иҷора»');
    expect(last()).toContain('1 500.00 смн');
    expect(JSON.stringify(sent[0].markup)).toContain(`rp:pay:${r.id}`);
    expect((await bot.sendRecurringReminders(at('2026-12-15T12:00'))).sent).toBe(0); // як бор
    // тугма (моҳи ҷорӣ)
    await press(`rp:pay:${r.id}`);
    expect(last()).toContain('«Иҷора» — 1 500.00 смн сабт шуд');
    const tx = await prisma.transaction.findFirstOrThrow({ where: { userId } });
    expect(tx).toMatchObject({ type: 'EXPENSE', purpose: 'Иҷора', categoryId: rent, accountId: cash, note: 'Пардохти доимӣ' });
    expect(tx.amount.toString()).toBe('1500');
    // бори дуюм — не
    await press(`rp:pay:${r.id}`);
    expect(last()).toContain('аллакай сабт');
    expect(await prisma.transaction.count({ where: { userId } })).toBe(1);
    expect((await A.get('/api/recurring')).body.recurring[0].status).toBe('paid');
  });

  it('сайт: «Пардохт шуд» бо маблағи дигар; «Ин моҳ не»', async () => {
    const inc = (await A.post('/api/recurring').send({ title: 'Маош', type: 'INCOME', amount: '5000', dayOfMonth: 1 }).expect(201)).body.recurring;
    const p = (await A.post(`/api/recurring/${inc.id}/pay`).send({ amount: '5200' }).expect(201)).body;
    expect(p.transaction).toMatchObject({ type: 'INCOME', amount: '5200.00', source: 'Маош' });
    expect(p.recurring.status).toBe('paid');
    const net = (await A.post('/api/recurring').send({ title: 'Интернет', amount: '150', dayOfMonth: 20 }).expect(201)).body.recurring;
    expect((await A.post(`/api/recurring/${net.id}/skip`).expect(200)).body.recurring.status).toBe('skipped');
    await press(`rp:skip:${net.id}`);
    expect(last()).toContain('гузаронида шуд');
  });

  it('қурби худкор: Бонки миллӣ → ба ҳамаи корбарон; дастӣ → худкор хомӯш', async () => {
    rates.setRatesFetcher(async (url) => ({ ok: url.includes('nbt.tj'), status: 200, text: async () => NBT_XML }));
    const u = await rates.updateAutoRates({ force: true });
    expect(u.updated).toBe(2);
    let body = (await A.get('/api/rates').expect(200)).body;
    expect(body).toMatchObject({ autoRates: true, auto: { source: 'nbt' } });
    expect(body.rates.find((r: { currency: string }) => r.currency === 'USD')).toMatchObject({ rate: '9.239300', source: 'nbt' });
    // як бор дар рӯз
    expect((await rates.updateAutoRates()).updated).toBe(0);
    // дастӣ
    body = (await A.put('/api/rates').send({ rates: { USD: '10.5' } }).expect(200)).body;
    expect(body.autoRates).toBe(false);
    expect(body.rates.find((r: { currency: string }) => r.currency === 'USD')).toMatchObject({ rate: '10.500000', source: 'manual' });
    await rates.updateAutoRates({ force: true });
    expect((await A.get('/api/rates')).body.rates.find((r: { currency: string }) => r.currency === 'USD').rate).toBe('10.500000');
    // аз нав худкор
    body = (await A.put('/api/rates/auto').send({ enabled: true }).expect(200)).body;
    expect(body.rates.find((r: { currency: string }) => r.currency === 'USD').rate).toBe('9.239300');
    // nbt.tj кор намекунад → захира (бозор)
    rates.setRatesFetcher(async (url) =>
      url.includes('nbt.tj') ? { ok: false, status: 503, text: async () => '' } : { ok: true, status: 200, text: async () => JSON.stringify({ rates: { TJS: 9.2, RUB: 80 } }) },
    );
    body = (await A.post('/api/rates/refresh').expect(200)).body;
    expect(body.auto.source).toBe('market');
    expect(body.rates.find((r: { currency: string }) => r.currency === 'RUB').rate).toBe('0.115000');
  });
});
