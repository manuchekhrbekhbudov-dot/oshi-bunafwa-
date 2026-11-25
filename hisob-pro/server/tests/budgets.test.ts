import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { fromZonedTime } from 'date-fns-tz';
import { buildTips, gradeFor } from '../src/services/budgets.js';

const hasDb = !!process.env.TEST_DATABASE_URL;
process.env.TELEGRAM_BOT_TOKEN = 'test-token:budgets';
const at = (local: string) => fromZonedTime(local, 'Asia/Dushanbe');
const cat = (name: string, amount: string) => ({ categoryId: name, name, color: '#000', amount, count: 1, share: '0' });

describe('маслиҳат (ҳисобкунии соф)', () => {
  it('баҳо аз рӯи ҳиссаи пасандоз', () => {
    expect(gradeFor('10000', '7000')).toEqual({ grade: 'A', rate: 30 });
    expect(gradeFor('10000', '8500')).toEqual({ grade: 'B', rate: 15 });
    expect(gradeFor('10000', '9800')).toEqual({ grade: 'C', rate: 2 });
    expect(gradeFor('10000', '12000')).toEqual({ grade: 'D', rate: -20 });
    expect(gradeFor('0', '500')).toEqual({ grade: null, rate: null });
  });

  it('маслиҳатҳо: кам кардан, афзоиш, буҷетҳо', () => {
    const tips = buildTips(
      { income: '10000', expense: '11000' },
      [cat('Хӯрок', '3000'), cat('Такси', '1200')],
      [cat('Хӯрок', '2400'), cat('Такси', '1500')],
      [{ name: 'Хӯрок', amount: '2500', spent: '3000' }, { name: 'Такси', amount: '1500', spent: '1200' }],
    );
    expect(tips).toContainEqual({ kind: 'negative', gap: '1000.00' });
    expect(tips).toContainEqual({ kind: 'up', category: 'Хӯрок', pct: 25, diff: '600.00' });
    expect(tips).toContainEqual({ kind: 'cut', category: 'Хӯрок', amount: '3000.00', save: '300.00' });
    expect(tips).toContainEqual({ kind: 'down', category: 'Такси', pct: 20 });
    expect(tips).toContainEqual({ kind: 'budgets', kept: 1, total: 2, over: ['Хӯрок'] });
    expect(buildTips({ income: '10000', expense: '6000' }, [], [], []).at(-1)).toEqual({ kind: 'great', rate: 40 });
  });
});

describe.skipIf(!hasDb)('буҷет ва маслиҳат (integration)', () => {
  let app: Express;
  let prisma: (typeof import('../src/lib/prisma.js'))['prisma'];
  let bot: typeof import('../src/services/telegram/bot.js');
  let A: ReturnType<typeof request.agent>;
  let B: ReturnType<typeof request.agent>;
  let cash = '';
  let food = '';
  let salary = '';
  const CHAT = 990999;
  const sent: string[] = [];
  const hook = (u: object) => request(app).post('/api/telegram/webhook').set('x-telegram-bot-api-secret-token', bot.webhookSecret()).send(u).expect(200);
  const say = (text: string) => hook({ message: { text, chat: { id: CHAT, type: 'private' }, from: { id: CHAT } } });
  const last = () => sent[sent.length - 1] ?? '';
  const expense = (amount: string, categoryId = food) => A.post('/api/transactions').send({ type: 'EXPENSE', amount, accountId: cash, categoryId, occurredAt: new Date().toISOString().slice(0, 16) }).expect(201);
  const wait = () => new Promise((r) => setTimeout(r, 300));

  beforeAll(async () => {
    ({ prisma } = await import('../src/lib/prisma.js'));
    bot = await import('../src/services/telegram/bot.js');
    bot.setTelegramSender(async (method, body) => {
      if (method === 'getMe') return { username: 'hisob_test_bot' };
      if (method === 'sendMessage') sent.push(String(body.text));
      return true;
    });
    const { createApp } = await import('../src/app.js');
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Session", "Account", "Category", "Transaction", "TelegramLink", "TelegramLinkCode", "Budget" CASCADE');
    app = createApp();
    A = request.agent(app);
    B = request.agent(app);
    await A.post('/api/auth/register').send({ name: 'Алӣ', email: 'budget@test.tj', password: 'parol1234' }).expect(201);
    await B.post('/api/auth/register').send({ name: 'Вали', email: 'budget2@test.tj', password: 'parol1234' });
    cash = (await A.get('/api/accounts')).body.accounts[0].id;
    food = (await A.get('/api/categories?kind=EXPENSE')).body.categories.find((c: { name: string }) => c.name === 'Хӯрок').id;
    salary = (await A.get('/api/categories?kind=INCOME')).body.categories[0].id;
    const code = (await A.post('/api/telegram/link').expect(200)).body.url.split('start=')[1];
    await say(`/start ${code}`);
    await hook({ callback_query: { id: 'c', data: 'income:skip', message: { chat: { id: CHAT, type: 'private' } } } });
  });
  afterAll(() => bot?.setTelegramSender(null));

  it('гузоштан: санҷиш ва ҳуқуқ', async () => {
    await A.put(`/api/budgets/${salary}`).send({ amount: '100' }).expect(400); // категорияи даромад — не
    await A.put(`/api/budgets/${food}`).send({ amount: '-5' }).expect(400);
    await B.put(`/api/budgets/${food}`).send({ amount: '100' }).expect(404); // категорияи каси дигар
    const r = (await A.put(`/api/budgets/${food}`).send({ amount: '1000' }).expect(200)).body;
    expect(r.budgets[0]).toMatchObject({ name: 'Хӯрок', amount: '1000.00', spent: '0.00', pct: 0, state: 'ok' });
    expect(r.budgets[0].alert80Key).toBeUndefined();
  });

  it('80% ва 100% — огоҳӣ дар Telegram, ҳар кадом як бор', async () => {
    sent.length = 0;
    await expense('500'); await wait();
    expect(sent.some((m) => m.includes('Буҷети'))).toBe(false);
    await expense('350'); await wait(); // 85%
    expect(last()).toContain('Буҷети «Хӯрок»: 85% сарф шуд');
    expect(last()).toContain('Монд: <b>150.00 смн</b>');
    await expense('10'); await wait(); // 86% — дубора не
    expect(sent.filter((m) => m.includes('Буҷети «Хӯрок»')).length).toBe(1);
    await expense('200'); await wait(); // 106%
    expect(last()).toContain('Буҷети «Хӯрок» тамом шуд');
    const st = (await A.get('/api/budgets')).body;
    expect(st.budgets[0]).toMatchObject({ spent: '1060.00', remaining: '-60.00', pct: 106, state: 'over' });
    await say('/budget');
    expect(last()).toContain('🔴 Хӯрок: 1 060.00 смн / 1 000.00 смн (106%)');
  });

  it('маслиҳат: сайт ва бот', async () => {
    await A.post('/api/transactions').send({ type: 'INCOME', amount: '5000', accountId: cash, categoryId: salary, occurredAt: new Date().toISOString().slice(0, 16) }).expect(201);
    const cur = new Date().toISOString().slice(0, 7);
    const a = (await A.get(`/api/advice?month=${cur}`).expect(200)).body;
    expect(a).toMatchObject({ month: cur, partial: true, grade: 'A', savingsRate: 79 });
    expect(a.tips).toContainEqual(expect.objectContaining({ kind: 'cut', category: 'Хӯрок' }));
    expect(a.tips).toContainEqual({ kind: 'budgets', kept: 0, total: 1, over: ['Хӯрок'] });
    await A.get('/api/advice?month=2026-13').expect(400);
    // моҳи гузашта холӣ → ҳамин моҳ
    expect((await A.get('/api/advice').expect(200)).body.month).toBe(cur);
    await say('/advice');
    expect(last()).toContain('Баҳои моҳ: <b>A</b>');
    expect(last()).toContain('10% камтар');
  });

  it('ҳисоботи моҳона бо маслиҳат', async () => {
    sent.length = 0;
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const key = next.toISOString().slice(0, 7);
    await bot.sendMonthlyReports(at(`${key}-01T10:00`));
    expect(last()).toContain('Маслиҳат');
    expect(last()).toContain('Баҳои моҳ');
  });
});
