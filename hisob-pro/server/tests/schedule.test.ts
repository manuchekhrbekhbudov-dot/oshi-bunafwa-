import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { fromZonedTime } from 'date-fns-tz';
import { categoryChanges, pctChange } from '../src/services/calc.js';

const hasDb = !!process.env.TEST_DATABASE_URL;
process.env.TELEGRAM_BOT_TOKEN = 'test-token:schedule';
const at = (local: string) => fromZonedTime(local, 'Asia/Dushanbe');

describe('муқоиса (ҳисобкунии соф)', () => {
  it('фоизи тағйир', () => {
    expect(pctChange('600', '500')).toBe(20);
    expect(pctChange('100', '200')).toBe(-50);
    expect(pctChange('100', '0')).toBeNull();
  });
  it('тағйироти категорияҳо: калонтарин аввал, бе тағйир — не', () => {
    const cat = (id: string, amount: string) => ({ categoryId: id, name: id, color: '#000', amount, count: 1, share: '0' });
    const r = categoryChanges([cat('food', '600'), cat('taxi', '100'), cat('same', '50')], [cat('food', '500'), cat('taxi', '200'), cat('same', '50'), cat('old', '30')]);
    expect(r.map((x) => [x.name, x.diff, x.pct])).toEqual([
      ['food', '100.00', 20],
      ['taxi', '-100.00', -50],
      ['old', '-30.00', -100],
    ]);
  });
});

describe.skipIf(!hasDb)('ҷадвали Telegram: ёдраскунӣ, ҳафта, моҳ, нусхаи эҳтиётӣ (integration)', () => {
  let app: Express;
  let prisma: (typeof import('../src/lib/prisma.js'))['prisma'];
  let bot: typeof import('../src/services/telegram/bot.js');
  let A: ReturnType<typeof request.agent>;
  let userId = '';
  let cash = '';
  let food = '';
  let taxi = '';
  const CHAT = 990001;
  const msgs: string[] = [];
  const docs: { fields: Record<string, string>; data: Buffer; filename: string }[] = [];
  let secret = '';

  const expense = (amount: string, categoryId: string, when: string) =>
    A.post('/api/transactions').send({ type: 'EXPENSE', amount, accountId: cash, categoryId, occurredAt: when }).expect(201);

  beforeAll(async () => {
    ({ prisma } = await import('../src/lib/prisma.js'));
    bot = await import('../src/services/telegram/bot.js');
    bot.setTelegramSender(async (method, body) => {
      if (method === 'getMe') return { username: 'hisob_test_bot' };
      if (method === 'sendMessage') msgs.push(String(body.text));
      return true;
    });
    bot.setTelegramTransport({
      upload: async (method, fields, files) => {
        if (method === 'sendDocument') docs.push({ fields, data: files[0].data, filename: files[0].filename });
        return true;
      },
    });
    secret = bot.webhookSecret();
    const { createApp } = await import('../src/app.js');
    await prisma.$executeRawUnsafe(
      'TRUNCATE "User", "Session", "Account", "Category", "Transaction", "Transfer", "Debt", "DebtPayment", "ExchangeRate", "TelegramLink", "TelegramLinkCode", "TransactionPhoto" CASCADE',
    );
    app = createApp();
    A = request.agent(app);
    userId = (await A.post('/api/auth/register').send({ name: 'Алӣ', email: 'sched@test.tj', password: 'parol1234' }).expect(201)).body.user.id;
    cash = (await A.get('/api/accounts')).body.accounts[0].id;
    const cats = (await A.get('/api/categories?kind=EXPENSE')).body.categories as { id: string; name: string }[];
    food = cats.find((c) => c.name === 'Хӯрок')!.id;
    taxi = cats.find((c) => c.name === 'Нақлиёт')!.id;
    // пайвасти Telegram
    const code = (await A.post('/api/telegram/link').expect(200)).body.url.split('start=')[1];
    const hook = (u: object) => request(app).post('/api/telegram/webhook').set('x-telegram-bot-api-secret-token', secret).send(u);
    await hook({ message: { text: `/start ${code}`, chat: { id: CHAT, type: 'private' }, from: { id: CHAT } } }).expect(200);
    await hook({ callback_query: { id: 'c', data: 'income:skip', message: { chat: { id: CHAT, type: 'private' } } } }).expect(200);

    // Ҳафтаи 16–22 ноябр: Хӯрок 600, Нақлиёт 100; ҳафтаи 9–15: Хӯрок 500, Нақлиёт 200; октябр: Хӯрок 1000
    await expense('600', food, '2026-11-18T13:00');
    await expense('100', taxi, '2026-11-19T09:00');
    await expense('500', food, '2026-11-11T13:00');
    await expense('200', taxi, '2026-11-12T09:00');
    await expense('1000', food, '2026-10-10T13:00');

    // Қарзҳо нисбат ба "имрӯз" = 2026-11-22
    const debt = (counterparty: string, direction: string, dueDate: string, amount = '300') =>
      A.post('/api/debts').send({ direction, counterparty, amount, currency: 'TJS', issuedAt: '2026-10-01T10:00', dueDate }).expect(201);
    await debt('Карим', 'LENT', '2026-11-23'); // пагоҳ
    await debt('Барака', 'BORROWED', '2026-11-22', '5000'); // имрӯз
    await debt('Ҳасан', 'LENT', '2026-11-21'); // 1 рӯз дер
    await debt('Ваҳоб', 'LENT', '2026-11-14'); // 8 рӯз дер
    await debt('Ориф', 'LENT', '2026-11-19'); // 3 рӯз — ин рӯз ёдрас намешавад
    const paid = (await debt('Пардохтшуда', 'LENT', '2026-11-23', '100')).body.debt.id;
    await A.post(`/api/debts/${paid}/payments`).send({ amount: '100', paidAt: '2026-11-20T10:00' }).expect(201);
  });

  afterAll(async () => {
    bot?.setTelegramSender(null);
    bot?.setTelegramTransport(null);
    await prisma?.$disconnect();
  });

  it('ёдраскунии қарзҳо: соати 09:00, як бор дар рӯз', async () => {
    expect((await bot.sendDebtReminders(at('2026-11-22T08:59:00'))).sent).toBe(0);
    const n = msgs.length;
    expect((await bot.sendDebtReminders(at('2026-11-22T09:05:00'))).sent).toBe(1);
    const m = msgs.slice(n).join('\n');
    expect(m).toContain('Ёдраскунии қарзҳо');
    expect(m).toContain('Пагоҳ <b>Карим</b> бояд <b>300.00 смн</b> баргардонад');
    expect(m).toContain('Имрӯз шумо бояд ба <b>Барака</b> <b>5 000.00 смн</b> баргардонед');
    expect(m).toContain('<b>Ҳасан</b> 1 рӯз дер кардааст');
    expect(m).toContain('<b>Ваҳоб</b> 8 рӯз дер кардааст');
    expect(m).not.toContain('Ориф');
    expect(m).not.toContain('Пардохтшуда');
    // муҳлатгузаштаҳо аввал
    expect(m.indexOf('Ҳасан')).toBeLessThan(m.indexOf('Карим'));
    expect((await bot.sendDebtReminders(at('2026-11-22T15:00:00'))).sent).toBe(0);
  });

  it('ҳисоботи ҳафта: якшанбе баъд аз 21:00, бо муқоиса', async () => {
    expect((await bot.sendWeeklyReports(at('2026-11-22T20:00:00'))).sent).toBe(0);
    expect((await bot.sendWeeklyReports(at('2026-11-21T22:00:00'))).sent).toBe(0); // шанбе
    const n = msgs.length;
    expect((await bot.sendWeeklyReports(at('2026-11-22T21:10:00'))).sent).toBe(1);
    const m = msgs.slice(n).join('\n');
    expect(m).toContain('Ҳисоботи ҳафта');
    expect(m).toContain('16 ноябр 2026');
    expect(m).toContain('Нисбат ба ҳафтаи гузашта');
    expect(m).toContain('700.00 смн → <b>700.00 смн</b> (0%)'); // хароҷот: 700 → 700
    expect(m).toContain('Хӯрок: 500.00 смн → 600.00 смн (+20%)');
    expect(m).toContain('Нақлиёт: 200.00 смн → 100.00 смн (-50%)');
    expect(m).toContain('«Хӯрок» 20% бештар сарф кардед');
    // душанбе — ҳамон ҳафта дубора не
    expect((await bot.sendWeeklyReports(at('2026-11-23T08:00:00'))).sent).toBe(0);
  });

  it('ҷамъбасти моҳ: 1-уми моҳ баъд аз 09:00, ноябр нисбат ба октябр', async () => {
    expect((await bot.sendMonthlyReports(at('2026-12-01T08:30:00'))).sent).toBe(0);
    expect((await bot.sendMonthlyReports(at('2026-12-04T10:00:00'))).sent).toBe(0);
    const n = msgs.length;
    expect((await bot.sendMonthlyReports(at('2026-12-01T09:30:00'))).sent).toBe(1);
    const m = msgs.slice(n).join('\n');
    expect(m).toContain('Ҷамъбасти моҳ — ноябр 2026');
    expect(m).toContain('1 400.00 смн'); // хароҷоти ноябр
    expect(m).toContain('Хӯрок: 1 000.00 смн → 1 100.00 смн (+10%)');
    expect(m).toContain('Нақлиёт: 0.00 смн → 300.00 смн (нав)');
    expect((await bot.sendMonthlyReports(at('2026-12-02T09:30:00'))).sent).toBe(0);
  });

  it('/month: муқоиса бо ҳамон рӯзҳои моҳи гузашта', async () => {
    await request(app).post('/api/telegram/webhook').set('x-telegram-bot-api-secret-token', secret)
      .send({ message: { text: '/month', chat: { id: CHAT, type: 'private' }, from: { id: CHAT } } }).expect(200);
    expect(msgs.at(-1)).toContain('Нисбат ба ҳамин рӯзҳои моҳи гузашта');
  });

  let backup: Buffer;

  it('нусхаи эҳтиётӣ: ҳар бегоҳ баъд аз 21:00, бе садо, як бор', async () => {
    expect((await bot.sendBackups(at('2026-11-22T20:59:00'))).sent).toBe(0);
    expect((await bot.sendBackups(at('2026-11-22T21:30:00'))).sent).toBe(1);
    const d = docs.at(-1)!;
    expect(d.filename).toBe('hisob-pro-backup-2026-11-22.xlsx');
    expect(d.fields.disable_notification).toBe('true');
    expect(d.fields.caption).toContain('Нусхаи эҳтиётӣ');
    expect(d.data.subarray(0, 2).toString()).toBe('PK'); // xlsx = zip
    backup = d.data;
    expect((await bot.sendBackups(at('2026-11-22T22:30:00'))).sent).toBe(0);
  });

  it('барқарорсозӣ аз нусха: маълумот пурра ва балансҳо айнан', async () => {
    const before = {
      accounts: (await A.get('/api/accounts')).body,
      debts: (await A.get('/api/debts/summary')).body,
      period: (await A.get('/api/reports/period?from=2026-10-01&to=2026-11-30')).body.summary,
      count: (await A.get('/api/transactions')).body.total,
    };
    // "база нест шуд": ҳамаи маълумоти молиявӣ тоза
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.debtPayment.deleteMany({ where: { userId } });
    await prisma.debt.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    expect((await A.get('/api/transactions')).body.total).toBe(0);

    const { restoreBackup } = await import('../src/services/backup.js');
    const r = await restoreBackup(userId, backup);
    expect(r.transactions).toBe(before.count);
    expect((await A.get('/api/accounts')).body).toEqual(before.accounts);
    expect((await A.get('/api/debts/summary')).body).toEqual(before.debts);
    expect((await A.get('/api/reports/period?from=2026-10-01&to=2026-11-30')).body.summary).toEqual(before.period);
    // файли бегона рад мешавад
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('x');
    await expect(restoreBackup(userId, Buffer.from(await wb.xlsx.writeBuffer()))).rejects.toThrow('нусхаи эҳтиётии HISOB PRO нест');
  });

  it('сайт: ҳисоботи давра бо муқоиса', async () => {
    const r = (await A.get('/api/reports/period?from=2026-11-16&to=2026-11-22').expect(200)).body;
    expect(r.previous).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
    expect(r.previous.summary.expense).toBe('700.00');
    expect(r.changes.find((x: { name: string }) => x.name === 'Хӯрок')).toMatchObject({ cur: '600.00', prev: '500.00', pct: 20 });
    const m = (await A.get('/api/reports/period?from=2026-10-01&to=2026-10-31')).body;
    expect(m.previous).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    // моҳи ҷорӣ бо рӯзҳои оянда → бо ҳамон рӯзҳои моҳи гузашта
    const { todayKey, shiftMonth, shiftDay } = await import('../src/lib/dates.js');
    const today = todayKey();
    const month = today.slice(0, 7);
    const last = shiftDay(`${shiftMonth(month, 1)}-01`, -1);
    if (today !== last) {
      const cur = (await A.get(`/api/reports/period?from=${month}-01&to=${last}`)).body;
      expect(cur.previous.to.slice(8)).toBe(today.slice(8));
    }
  });

  it('runScheduledJobs ва /tick', async () => {
    const r = await bot.runScheduledJobs(at('2026-11-24T12:00:00'));
    expect(Object.keys(r).sort()).toEqual(['backups', 'daily', 'monthly', 'reminders', 'routines', 'weekly']);
    await request(app).post('/api/telegram/tick').expect(200);
  });
});
