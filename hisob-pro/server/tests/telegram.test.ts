import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { fromZonedTime } from 'date-fns-tz';

const hasDb = !!process.env.TEST_DATABASE_URL;
process.env.TELEGRAM_BOT_TOKEN = 'test-token:123';

describe.skipIf(!hasDb)('Telegram-бот (integration)', () => {
  let app: Express;
  let prisma: (typeof import('../src/lib/prisma.js'))['prisma'];
  let bot: typeof import('../src/services/telegram/bot.js');
  let A: ReturnType<typeof request.agent>;
  let cash: string;
  let food: string;
  const sent: { method: string; body: Record<string, unknown> }[] = [];
  const messages = () => sent.filter((s) => s.method === 'sendMessage').map((s) => String(s.body.text));
  const lastMsg = () => messages().at(-1) ?? '';
  const CHAT = 777001;

  let secret = '';
  const hook = (update: object, s = secret) =>
    request(app).post('/api/telegram/webhook').set('x-telegram-bot-api-secret-token', s).send(update);
  const text = (t: string, chatType = 'private') => hook({ message: { text: t, chat: { id: CHAT, type: chatType }, from: { username: 'ali_tj' } } });
  const press = (data: string) => hook({ callback_query: { id: 'cb1', data, message: { chat: { id: CHAT, type: 'private' } } } });
  const waitFor = async (cond: () => boolean) => {
    for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
  };

  beforeAll(async () => {
    ({ prisma } = await import('../src/lib/prisma.js'));
    bot = await import('../src/services/telegram/bot.js');
    bot.setTelegramSender(async (method, body) => {
      sent.push({ method, body });
      if (method === 'getMe') return { username: 'hisob_test_bot' };
      return true;
    });
    secret = bot.webhookSecret();
    const { createApp } = await import('../src/app.js');
    await prisma.$executeRawUnsafe(
      'TRUNCATE "User", "Session", "PasswordResetToken", "Account", "Category", "Transaction", "Transfer", "Debt", "DebtPayment", "ExchangeRate", "TelegramLink", "TelegramLinkCode" CASCADE',
    );
    app = createApp();
    A = request.agent(app);
    await A.post('/api/auth/register').send({ name: 'Алӣ', email: 'tg@test.tj', password: 'parol1234' }).expect(201);
    cash = (await A.get('/api/accounts')).body.accounts[0].id;
    food = (await A.get('/api/categories?kind=EXPENSE')).body.categories.find((c: { name: string }) => c.name === 'Хӯрок').id;
  });
  afterAll(async () => {
    bot?.setTelegramSender(null);
    await prisma?.$disconnect();
  });

  it('webhook бе сирри дуруст рад мешавад', async () => {
    await hook({ message: { text: '/help', chat: { id: CHAT, type: 'private' } } }, 'wrong').expect(401);
    expect(sent).toHaveLength(0);
  });

  it('чати пайвастнашуда дастур мегирад, маълумот не', async () => {
    await text('/today').expect(200);
    expect(lastMsg()).toContain('Танзимот → Telegram-бот');
  });

  it('пайвастшавӣ: линк аз сайт → /start CODE → саволи манбаи даромад', async () => {
    const r = await A.post('/api/telegram/link').expect(200);
    expect(r.body.url).toMatch(/^https:\/\/t\.me\/hisob_test_bot\?start=[\w-]+$/);
    const code = r.body.url.split('start=')[1];
    await text(`/start ${code}`).expect(200);
    expect(messages().some((m) => m.includes('пайваст шуд'))).toBe(true);
    expect(lastMsg()).toContain('Даромади шумо асосан аз куҷо');
    // кодро бори дуюм истифода бурдан мумкин нест
    await text(`/start ${code}`);
    expect(lastMsg()).toContain('нодуруст ё кӯҳна');
    const s = (await A.get('/api/telegram/settings').expect(200)).body;
    expect(s.linked).toBe(true);
    expect(s.onboarding).toBe(true);
  });

  it('саволҳо: манбаъ → даромади моҳона → меъёр', async () => {
    await press('src:SALARY').expect(200);
    expect(lastMsg()).toContain('Даромади моҳонаи шумо');
    await text('бисёр');
    expect(lastMsg()).toContain('танҳо рақам');
    await text('6000');
    expect(lastMsg()).toContain('Тайёр');
    const s = (await A.get('/api/telegram/settings')).body;
    expect(s.onboarding).toBe(false);
    expect(s.incomeSource).toBe('SALARY');
    expect(s.monthlyIncome).toBe('6000.00');
    expect(s.effectiveLimit.basis).toBe('income');
  });

  it('огоҳӣ: хароҷот аз меъёр гузашт → як паём, на бештар', async () => {
    await A.patch('/api/telegram/settings').send({ dailyLimit: '100' }).expect(200);
    const before = messages().length;
    const now = new Date(Date.now() - 60_000).toISOString();
    await A.post('/api/transactions').send({ type: 'EXPENSE', amount: '60', accountId: cash, categoryId: food, occurredAt: now }).expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(messages().length).toBe(before); // 60 < 100
    await A.post('/api/transactions').send({ type: 'EXPENSE', amount: '70', accountId: cash, categoryId: food, occurredAt: now }).expect(201);
    await waitFor(() => messages().length > before);
    expect(lastMsg()).toContain('Имрӯз бисёр сарф кардед');
    expect(lastMsg()).toContain('130.00 смн');
    expect(lastMsg()).toContain('Хӯрок');
    await A.post('/api/transactions').send({ type: 'EXPENSE', amount: '10', accountId: cash, occurredAt: now }).expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(messages().filter((m) => m.includes('бисёр сарф')).length).toBe(1);
  });

  it('/today ва /month', async () => {
    await text('/today');
    expect(lastMsg()).toContain('Ҳисоботи рӯз');
    expect(lastMsg()).toContain('140.00 смн');
    await text('/month');
    expect(lastMsg()).toContain('Ҳамин моҳ');
  });

  it('/limit', async () => {
    await text('/limit 250');
    expect(lastMsg()).toContain('250.00 смн');
    await text('/limit auto');
    expect(lastMsg()).toContain('худкор');
  });

  it('паёмҳо дар гурӯҳ сарфи назар мешаванд', async () => {
    const n = sent.length;
    await text('/today', 'group').expect(200);
    expect(sent.length).toBe(n);
  });

  it('ҳисоботи 21:00: пеш аз 21 не, баъд як бор', async () => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dushanbe' }).format(new Date());
    const at = (hm: string) => fromZonedTime(`${day}T${hm}:00`, 'Asia/Dushanbe');
    expect((await bot.sendDailySummaries(at('20:59'))).sent).toBe(0);
    expect((await bot.sendDailySummaries(at('21:00'))).sent).toBe(1);
    expect(lastMsg()).toContain('Ҳисоботи рӯз');
    expect(lastMsg()).toContain('Ҳамин моҳ');
    expect((await bot.sendDailySummaries(at('21:30'))).sent).toBe(0);
    await request(app).post('/api/telegram/tick').expect(200);
  });

  it('/daily хомӯш мекунад; /stop ҷудо мекунад', async () => {
    await text('/daily');
    expect(lastMsg()).toContain('хомӯш');
    await text('/stop');
    expect(lastMsg()).toContain('ҷудо шуд');
    expect((await A.get('/api/telegram/settings')).body.linked).toBe(false);
  });
});
