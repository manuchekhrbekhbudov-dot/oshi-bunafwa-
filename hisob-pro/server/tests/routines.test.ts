import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { fromZonedTime } from 'date-fns-tz';
import { initialMarks, normalizeDays, normalizeTime, routineDue } from '../src/services/routines.js';

const hasDb = !!process.env.TEST_DATABASE_URL;
process.env.TELEGRAM_BOT_TOKEN = 'test-token:routines';
const at = (local: string) => fromZonedTime(local, 'Asia/Dushanbe');

// «Иловагӣ»: даромадан 16:00, баромадан 18:00 → хабар 17:55–18:00
const R = { days: '1234567', leaveTime: '18:00', remindBefore: 5, active: true, lastLeaveDay: null };

describe('ҷадвали рӯз (ҳисобкунии соф)', () => {
  it('вақт ва рӯзҳо', () => {
    expect(normalizeTime('9:05')).toBe('09:05');
    expect(normalizeTime('16.30')).toBe('16:30');
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('abc')).toBeNull();
    expect(normalizeDays('7135518')).toBe('1357');
  });

  it('хабар: аз 5 дақиқа пеш аз баромадан то худи соати баромадан', () => {
    expect(routineDue(R, at('2026-12-02T16:00')).leave).toBe(false); // даромадан — хабар нест
    expect(routineDue(R, at('2026-12-02T17:54')).leave).toBe(false);
    expect(routineDue(R, at('2026-12-02T17:55')).leave).toBe(true);
    expect(routineDue(R, at('2026-12-02T18:00')).leave).toBe(true);
    expect(routineDue(R, at('2026-12-02T18:01')).leave).toBe(false);
    // ҳамон рӯз бори дуюм — не
    expect(routineDue({ ...R, lastLeaveDay: '2026-12-02' }, at('2026-12-02T17:57')).leave).toBe(false);
  });

  it('рӯзҳои ҳафта ва хомӯш', () => {
    // 2026-12-02 — чоршанбе (3)
    expect(routineDue({ ...R, days: '12' }, at('2026-12-02T17:58')).leave).toBe(false);
    expect(routineDue({ ...R, days: '3' }, at('2026-12-02T17:58')).leave).toBe(true);
    expect(routineDue({ ...R, active: false }, at('2026-12-02T17:58')).leave).toBe(false);
  });

  it('ҷойи нав пас аз вақташ — хабари кӯҳна намеравад', () => {
    expect(initialMarks(R, at('2026-12-02T10:00'))).toEqual({ lastLeaveDay: null });
    expect(initialMarks(R, at('2026-12-02T17:56'))).toEqual({ lastLeaveDay: '2026-12-02' });
  });
});

describe.skipIf(!hasDb)('ҷадвали рӯз: API ва Telegram (integration)', () => {
  let app: Express;
  let prisma: (typeof import('../src/lib/prisma.js'))['prisma'];
  let bot: typeof import('../src/services/telegram/bot.js');
  let A: ReturnType<typeof request.agent>;
  let B: ReturnType<typeof request.agent>;
  let userId = '';
  let study = '';
  const CHAT = 990777;
  const sent: { text: string; markup: unknown }[] = [];
  const hook = (u: object) => request(app).post('/api/telegram/webhook').set('x-telegram-bot-api-secret-token', bot.webhookSecret()).send(u).expect(200);
  const say = (text: string) => hook({ message: { text, chat: { id: CHAT, type: 'private' }, from: { id: CHAT } } });
  const last = () => sent[sent.length - 1]?.text ?? '';

  beforeAll(async () => {
    ({ prisma } = await import('../src/lib/prisma.js'));
    bot = await import('../src/services/telegram/bot.js');
    bot.setTelegramSender(async (method, body) => {
      if (method === 'getMe') return { username: 'hisob_test_bot' };
      if (method === 'sendMessage') sent.push({ text: String(body.text), markup: body.reply_markup });
      return true;
    });
    const { createApp } = await import('../src/app.js');
    await prisma.$executeRawUnsafe(
      'TRUNCATE "User", "Session", "Account", "Category", "Transaction", "TelegramLink", "TelegramLinkCode", "Routine" CASCADE',
    );
    app = createApp();
    A = request.agent(app);
    B = request.agent(app);
    userId = (await A.post('/api/auth/register').send({ name: 'Алӣ', email: 'routine@test.tj', password: 'parol1234' }).expect(201)).body.user.id;
    await B.post('/api/auth/register').send({ name: 'Вали', email: 'other@test.tj', password: 'parol1234' });
    const cats = (await A.get('/api/categories?kind=EXPENSE')).body.categories as { id: string; name: string }[];
    study = cats.find((c) => c.name === 'Таҳсил')?.id ?? cats[0].id;
    const code = (await A.post('/api/telegram/link').expect(200)).body.url.split('start=')[1];
    await say(`/start ${code}`);
    await hook({ callback_query: { id: 'c', data: 'income:skip', message: { chat: { id: CHAT, type: 'private' } } } });
  });

  afterAll(() => {
    bot?.setTelegramSender(null);
  });

  it('пас аз саволҳои аввал бот мепурсад: «пулро дар куҷо сарф мекунед?»', () => {
    expect(sent.some((m) => m.text.includes('/routine Иловагӣ 16:00-18:00'))).toBe(true);
  });

  it('сайт: аввал савол нишон дода мешавад, баъд не', async () => {
    expect((await A.get('/api/routines').expect(200)).body).toEqual({ routines: [], asked: false });
    await A.post('/api/routines/asked').expect(200);
    expect((await A.get('/api/routines')).body.asked).toBe(true);
  });

  it('илова: санҷиши маълумот', async () => {
    await A.post('/api/routines').send({ title: 'Иловагӣ', days: '1234567', leaveTime: '25:00' }).expect(400);
    await A.post('/api/routines').send({ title: 'Иловагӣ', days: '', leaveTime: '16:00' }).expect(400);
    // баромадан пеш аз даромадан — не
    await A.post('/api/routines').send({ title: 'Иловагӣ', days: '1234567', arriveTime: '18:00', leaveTime: '16:00' }).expect(400);
    const otherCat = (await B.get('/api/categories?kind=EXPENSE')).body.categories[0].id;
    await A.post('/api/routines').send({ title: 'Иловагӣ', days: '1234567', leaveTime: '16:00', categoryId: otherCat }).expect(400);
    const r = await A.post('/api/routines')
      .send({ title: 'Иловагӣ', days: '1234567', arriveTime: '16:00', leaveTime: '18:00', categoryId: study })
      .expect(201);
    expect(r.body.routine).toMatchObject({ title: 'Иловагӣ', arriveTime: '16:00', leaveTime: '18:00', remindBefore: 5, active: true });
    // Корбари дигар онро тағйир ё нест карда наметавонад
    await B.patch(`/api/routines/${r.body.routine.id}`).send({ title: 'x' }).expect(404);
    await A.patch(`/api/routines/${r.body.routine.id}`).send({ leaveTime: '15:00' }).expect(400);
    await B.delete(`/api/routines/${r.body.routine.id}`).expect(404);
    expect((await B.get('/api/routines')).body.routines).toHaveLength(0);
    // барои санҷиши ҷадвал — хабари имрӯза ҳанӯз нафиристода
    await prisma.routine.updateMany({ data: { lastLeaveDay: null } });
  });

  it('5 дақиқа пеш аз баромадан хабар меояд — танҳо як бор', async () => {
    sent.length = 0;
    expect((await bot.sendRoutineReminders(at('2026-12-02T16:00'))).sent).toBe(0); // соати даромадан — хабар нест
    expect((await bot.sendRoutineReminders(at('2026-12-02T17:50'))).sent).toBe(0);
    expect((await bot.sendRoutineReminders(at('2026-12-02T17:55'))).sent).toBe(1);
    expect(last()).toContain('5 дақиқа баъд');
    expect(last()).toContain('аз «Иловагӣ» мебароед (18:00)');
    expect(last()).toContain('пардохти хароҷотро сабт кунед');
    expect(JSON.stringify(sent[0].markup)).toContain('rt:none:');
    expect((await bot.sendRoutineReminders(at('2026-12-02T17:58'))).sent).toBe(0);
  });

  it('ҷавоби танҳо бо рақам ба ҳамон ҷой ва категория сабт мешавад', async () => {
    await say('10');
    const tx = await prisma.transaction.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } });
    expect(tx).toMatchObject({ type: 'EXPENSE', purpose: 'Иловагӣ', categoryId: study });
    expect(tx.amount.toString()).toBe('10');
    // хабари навбатӣ дигар ба ҷадвал вобаста нест
    expect((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).pendingRoutineId).toBeNull();
  });

  it('«Хароҷот набуд» — ҳеҷ чиз сабт намешавад; рӯзи дигар хабар аз нав', async () => {
    const before = await prisma.transaction.count({ where: { userId } });
    expect((await bot.sendRoutineReminders(at('2026-12-03T17:56'))).sent).toBe(1);
    const id = (await prisma.routine.findFirstOrThrow({ where: { userId } })).id;
    await hook({ callback_query: { id: 'n', data: `rt:none:${id}`, message: { chat: { id: CHAT, type: 'private' } } } });
    expect(last()).toContain('хароҷот нест');
    await say('7');
    const tx = await prisma.transaction.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } });
    expect(tx.purpose).toBeNull(); // дигар ба ҷадвал вобаста нест
    expect(await prisma.transaction.count({ where: { userId } })).toBe(before + 1);
  });

  it('фармони /routine: илова ва рӯйхат', async () => {
    await say('/routine Бозор 10:00-11:30');
    expect(last()).toContain('«Бозор» илова шуд');
    await say('/routine');
    expect(last()).toContain('Бозор');
    expect(last()).toContain('10:00–11:30');
    expect(last()).toContain('16:00–18:00');
    expect(last()).toContain('Иловагӣ');
    await say('/routine Хато 18:00-16:00');
    expect(last()).toContain('/routine Иловагӣ 16:00-18:00');
    await say('/routine бе вақт');
    expect(last()).toContain('/routine Иловагӣ 16:00-18:00');
    expect(await prisma.routine.count({ where: { userId } })).toBe(2);
  });

  it('нест кардан', async () => {
    const id = (await prisma.routine.findFirstOrThrow({ where: { userId, title: 'Бозор' } })).id;
    await A.patch(`/api/routines/${id}`).send({ active: false }).expect(200);
    await A.delete(`/api/routines/${id}`).expect(200);
    expect((await A.get('/api/routines')).body.routines).toHaveLength(1);
  });
});
