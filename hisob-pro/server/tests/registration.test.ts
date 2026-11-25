import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { normalizePhone } from '../src/services/registration.js';

const hasDb = !!process.env.TEST_DATABASE_URL;
process.env.TELEGRAM_BOT_TOKEN = 'test-token:registration';

describe('рақами телефон', () => {
  it('ба шакли ягона', () => {
    expect(normalizePhone('+992 90 123-45-67')).toBe('+992901234567');
    expect(normalizePhone('992901234567')).toBe('+992901234567');
    expect(normalizePhone('901234567')).toBe('+992901234567');
    expect(normalizePhone('00992901234567')).toBe('+992901234567');
    expect(normalizePhone('+7 999 123 45 67')).toBe('+79991234567');
    expect(normalizePhone('123')).toBeNull();
  });
});

describe.skipIf(!hasDb)('сабти ном тавассути рақами Telegram (integration)', () => {
  let app: Express;
  let prisma: (typeof import('../src/lib/prisma.js'))['prisma'];
  let bot: typeof import('../src/services/telegram/bot.js');
  let owner: ReturnType<typeof request.agent>;
  let karim: ReturnType<typeof request.agent>;
  let secret = '';
  const sent: { chat: string; text: string; markup: unknown }[] = [];
  const last = (chat: number) => sent.filter((m) => m.chat === String(chat)).at(-1);
  const hook = (u: object) => request(app).post('/api/telegram/webhook').set('x-telegram-bot-api-secret-token', secret).send(u);
  const tgText = (chat: number, text: string) => hook({ message: { text, chat: { id: chat, type: 'private' }, from: { id: chat, username: `u${chat}` } } });
  const tgContact = (chat: number, phone: string, ownerOfContact: number) =>
    hook({ message: { contact: { phone_number: phone, user_id: ownerOfContact }, chat: { id: chat, type: 'private' }, from: { id: chat } } });
  const startReg = async (agent: ReturnType<typeof request.agent>, name: string, email?: string) => {
    const r = await agent.post('/api/auth/register/telegram').send({ name, password: 'parol1234', email }).expect(201);
    expect(r.body.url).toMatch(/^https:\/\/t\.me\/hisob_test_bot\?start=reg_[\w-]+$/);
    return { code: r.body.url.split('start=')[1] as string, pollToken: r.body.pollToken as string };
  };

  beforeAll(async () => {
    process.env.REGISTRATION = 'first-user';
    ({ prisma } = await import('../src/lib/prisma.js'));
    bot = await import('../src/services/telegram/bot.js');
    bot.setTelegramSender(async (method, body) => {
      if (method === 'getMe') return { username: 'hisob_test_bot' };
      if (method === 'sendMessage') sent.push({ chat: String(body.chat_id), text: String(body.text), markup: body.reply_markup });
      return true;
    });
    secret = bot.webhookSecret();
    const { createApp } = await import('../src/app.js');
    await prisma.$executeRawUnsafe(
      'TRUNCATE "User", "Session", "PasswordResetToken", "Account", "Category", "Transaction", "TelegramLink", "TelegramLinkCode", "PendingRegistration", "AppSetting" CASCADE',
    );
    app = createApp();
    owner = request.agent(app);
    karim = request.agent(app);
  });

  afterAll(async () => {
    process.env.REGISTRATION = 'open';
    bot?.setTelegramSender(null);
    await prisma?.$disconnect();
  });

  it('корбари аввал (соҳиб) бо email сабти ном мекунад', async () => {
    expect((await request(app).get('/api/auth/registration')).body).toMatchObject({ open: true, email: true, telegram: false });
    await owner.post('/api/auth/register').send({ name: 'Соҳиб', email: 'owner@test.tj', password: 'parol1234' }).expect(201);
    expect((await owner.get('/api/auth/me')).body.user.isOwner).toBe(true);
  });

  it('баъд аз соҳиб: танҳо тавассути Telegram, бе email', async () => {
    const r = (await request(app).get('/api/auth/registration')).body;
    expect(r).toMatchObject({ open: true, email: false, telegram: true, botUsername: 'hisob_test_bot' });
    const e = await request(app).post('/api/auth/register').send({ name: 'Бегона', email: 'x@test.tj', password: 'parol1234' }).expect(403);
    expect(e.body.error.code).toBe('TELEGRAM_REQUIRED');
  });

  let reg: { code: string; pollToken: string };

  it('сабти ном: линки бот → /start → тугмаи рақам', async () => {
    reg = await startReg(karim, 'Карим');
    expect((await karim.get(`/api/auth/register/telegram/status?token=${reg.pollToken}`)).body).toEqual({ status: 'waiting', chatOpened: false });
    await tgText(5001, `/start ${reg.code}`).expect(200);
    const m = last(5001)!;
    expect(m.text).toContain('Тасдиқи рақам');
    expect(JSON.stringify(m.markup)).toContain('"request_contact":true');
    expect((await karim.get(`/api/auth/register/telegram/status?token=${reg.pollToken}`)).body.chatOpened).toBe(true);
  });

  it('карточкаи рақами каси дигар рад мешавад', async () => {
    await tgContact(5001, '992900000000', 9999).expect(200);
    expect(last(5001)!.text).toContain('худатонро');
    expect(await prisma.user.count({ where: { phone: '+992900000000' } })).toBe(0);
  });

  it('рақами худ → ҳисоб сохта мешавад, бот пайваст, браузер худкор ворид мешавад', async () => {
    await tgContact(5001, '992901234567', 5001).expect(200);
    expect(sent.filter((x) => x.chat === '5001').some((x) => x.text.includes('Сабти ном тамом шуд'))).toBe(true);
    expect(last(5001)!.text).toContain('Даромади шумо асосан аз куҷо');
    const u = await prisma.user.findUnique({ where: { phone: '+992901234567' }, include: { telegram: true } });
    expect(u).toMatchObject({ name: 'Карим', email: null, telegramUserId: '5001' });
    expect(u!.telegram!.chatId).toBe('5001');
    const st = await karim.get(`/api/auth/register/telegram/status?token=${reg.pollToken}`).expect(200);
    expect(st.body.status).toBe('done');
    expect(st.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect((await karim.get('/api/auth/me').expect(200)).body.user).toMatchObject({ name: 'Карим', phone: '+992901234567', isOwner: false });
    // токен як маротиба
    await request(app).get(`/api/auth/register/telegram/status?token=${reg.pollToken}`).expect(410);
    // маълумоти Карим аз соҳиб ҷудо
    const accs = (await karim.get('/api/accounts')).body.accounts;
    expect(accs).toHaveLength(1);
    expect((await owner.get('/api/accounts')).body.accounts.map((a: { id: string }) => a.id)).not.toContain(accs[0].id);
  });

  it('воридшавӣ бо рақам (бо +992, бе +992) ва парол', async () => {
    await request(app).post('/api/auth/login').send({ login: '+992 90 123 45 67', password: 'parol1234' }).expect(200);
    await request(app).post('/api/auth/login').send({ login: '901234567', password: 'parol1234' }).expect(200);
    await request(app).post('/api/auth/login').send({ login: '901234567', password: 'galat1234' }).expect(401);
    await request(app).post('/api/auth/login').send({ email: 'owner@test.tj', password: 'parol1234' }).expect(200);
  });

  it('як рақам — як ҳисоб: рақами сабтшуда аз Telegram-и дигар рад мешавад', async () => {
    const r2 = await startReg(request.agent(app), 'Дубликат');
    await tgText(5002, `/start ${r2.code}`).expect(200);
    await tgContact(5002, '+992901234567', 5002).expect(200);
    expect(last(5002)!.text).toContain('аллакай дар HISOB PRO сабт шудааст');
    expect((await request(app).get(`/api/auth/register/telegram/status?token=${r2.pollToken}`)).body).toEqual({ status: 'error', code: 'PHONE_TAKEN' });
    expect(await prisma.user.count()).toBe(2);
  });

  it('як Telegram — як ҳисоб: ҳамон ҳисоби Telegram бори дуюм рад мешавад', async () => {
    const r3 = await startReg(request.agent(app), 'Карим 2');
    await tgText(5001, `/start ${r3.code}`).expect(200);
    expect(last(5001)!.text).toContain('аллакай ба HISOB PRO пайваст');
  });

  it('линки кӯҳна/нодуруст', async () => {
    await tgText(5003, '/start reg_notavalidcode000000000').expect(200);
    expect(last(5003)!.text).toContain('кӯҳна шудааст');
  });

  it('email-и такрорӣ дар сабти ном рад мешавад', async () => {
    await request(app).post('/api/auth/register/telegram').send({ name: 'Иштибоҳ', email: 'owner@test.tj', password: 'parol1234' }).expect(409);
  });

  it('фаромӯш кардани парол → линк ба Telegram → пароли нав', async () => {
    await request(app).post('/api/auth/forgot-password').send({ login: '+992901234567' }).expect(200);
    const m = last(5001)!;
    expect(m.text).toContain('Барқарорсозии парол');
    const token = decodeURIComponent(m.text.match(/token=([^"&\s]+)/)![1]);
    await request(app).post('/api/auth/reset-password').send({ token, password: 'navparol55' }).expect(200);
    await request(app).post('/api/auth/login').send({ login: '901234567', password: 'navparol55' }).expect(200);
    // корбари номаълум — ҳамон ҷавоб, бе паём
    const n = sent.length;
    await request(app).post('/api/auth/forgot-password').send({ login: '+992111111111' }).expect(200);
    expect(sent.length).toBe(n);
  });

  it('соҳиб сабти номро мепӯшад; корбари дигар наметавонад', async () => {
    await karim.get('/api/auth/registration-settings').expect(401); // сессияи Карим бо иваз кардани парол бекор шуд
    await karim.post('/api/auth/login').send({ login: '901234567', password: 'navparol55' }).expect(200);
    await karim.put('/api/auth/registration-settings').send({ registration: 'closed' }).expect(403);
    expect((await owner.get('/api/auth/registration-settings').expect(200)).body.registration).toBe('telegram');
    await owner.put('/api/auth/registration-settings').send({ registration: 'closed' }).expect(200);
    expect((await request(app).get('/api/auth/registration')).body).toMatchObject({ open: false, telegram: false });
    await request(app).post('/api/auth/register/telegram').send({ name: 'Нав', password: 'parol1234' }).expect(403);
    await owner.put('/api/auth/registration-settings').send({ registration: 'telegram' }).expect(200);
    expect((await request(app).get('/api/auth/registration')).body.telegram).toBe(true);
  });
});
