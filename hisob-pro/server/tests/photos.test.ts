import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { fromZonedTime } from 'date-fns-tz';
import { detectImageMime, decodePhoto } from '../src/services/photos.js';

const hasDb = !!process.env.TEST_DATABASE_URL;
process.env.TELEGRAM_BOT_TOKEN = 'test-token:photos';

// "JPEG"-и хурд: аломатҳои аввали JPEG + байтҳои дилхоҳ (сервер намудро аз рӯи байтҳо месанҷад)
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-jpeg-body-'.repeat(20))]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png')]);

describe('photos: санҷиши файл', () => {
  it('намуд аз рӯи байтҳо, на аз рӯи ном', () => {
    expect(detectImageMime(JPEG)).toBe('image/jpeg');
    expect(detectImageMime(PNG)).toBe('image/png');
    expect(detectImageMime(Buffer.from('<script>alert(1)</script>'))).toBeNull();
  });
  it('base64 ва dataURL', () => {
    expect(decodePhoto(`data:image/jpeg;base64,${JPEG.toString('base64')}`).mime).toBe('image/jpeg');
    expect(decodePhoto(JPEG.toString('base64')).data.equals(JPEG)).toBe(true);
    expect(() => decodePhoto(Buffer.from('hello world, not an image').toString('base64'))).toThrow();
    expect(() => decodePhoto('!!!not-base64!!!')).toThrow();
  });
});

describe.skipIf(!hasDb)('photos (integration)', () => {
  let app: Express;
  let prisma: (typeof import('../src/lib/prisma.js'))['prisma'];
  let bot: typeof import('../src/services/telegram/bot.js');
  let A: ReturnType<typeof request.agent>;
  let B: ReturnType<typeof request.agent>;
  let cash: string;
  let txId: string;
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const uploads: { method: string; fields: Record<string, string>; files: { field: string; data: Buffer }[] }[] = [];
  const CHAT = 880001;
  let secret = '';
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dushanbe' }).format(new Date());

  beforeAll(async () => {
    ({ prisma } = await import('../src/lib/prisma.js'));
    bot = await import('../src/services/telegram/bot.js');
    bot.setTelegramSender(async (method, body) => {
      calls.push({ method, body });
      if (method === 'getMe') return { username: 'hisob_test_bot' };
      if (method === 'getFile') return { file_path: 'photos/file_1.jpg' };
      return true;
    });
    bot.setTelegramTransport({
      upload: async (method, fields, files) => {
        uploads.push({ method, fields, files });
        return true;
      },
      download: async () => JPEG,
    });
    secret = bot.webhookSecret();
    const { createApp } = await import('../src/app.js');
    await prisma.$executeRawUnsafe(
      'TRUNCATE "User", "Session", "Account", "Category", "Transaction", "TransactionPhoto", "TelegramLink", "TelegramLinkCode" CASCADE',
    );
    app = createApp();
    A = request.agent(app);
    B = request.agent(app);
    await A.post('/api/auth/register').send({ name: 'Алӣ', email: 'photo-a@test.tj', password: 'parol1234' }).expect(201);
    await B.post('/api/auth/register').send({ name: 'Валӣ', email: 'photo-b@test.tj', password: 'parol1234' }).expect(201);
    cash = (await A.get('/api/accounts')).body.accounts[0].id;
  });

  afterAll(async () => {
    bot?.setTelegramSender(null);
    bot?.setTelegramTransport(null);
    await prisma?.$disconnect();
  });

  it('сурат ба хароҷот: боргузорӣ, дидан, hasPhoto', async () => {
    txId = (await A.post('/api/transactions').send({ type: 'EXPENSE', amount: '35', accountId: cash, occurredAt: `${day}T12:00`, purpose: 'нон' }).expect(201)).body.transaction.id;
    await A.put(`/api/transactions/${txId}/photo`).send({ data: `data:image/jpeg;base64,${JPEG.toString('base64')}` }).expect(200);
    const img = await A.get(`/api/transactions/${txId}/photo`).buffer(true).parse((res, cb) => {
      const c: Buffer[] = [];
      res.on('data', (x: Buffer) => c.push(x));
      res.on('end', () => cb(null, Buffer.concat(c)));
    }).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect((img.body as Buffer).equals(JPEG)).toBe(true);
    const list = (await A.get('/api/transactions')).body.items;
    expect(list.find((t: { id: string }) => t.id === txId).hasPhoto).toBe(true);
  });

  it('файли на-сурат рад мешавад; корбари дигар суратро намебинад', async () => {
    await A.put(`/api/transactions/${txId}/photo`).send({ data: Buffer.from('<html>evil</html>').toString('base64') }).expect(400);
    await B.get(`/api/transactions/${txId}/photo`).expect(404);
    await B.put(`/api/transactions/${txId}/photo`).send({ data: JPEG.toString('base64') }).expect(404);
    await B.delete(`/api/transactions/${txId}/photo`).expect(404);
  });

  it('сурати калон (то 5 MB) қабул мешавад, на зиёд', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(3 * 1024 * 1024, 1)]);
    await A.put(`/api/transactions/${txId}/photo`).send({ data: big.toString('base64') }).expect(200);
    const tooBig = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024 + 10, 1)]);
    await A.put(`/api/transactions/${txId}/photo`).send({ data: tooBig.toString('base64') }).expect(400);
    await A.put(`/api/transactions/${txId}/photo`).send({ data: JPEG.toString('base64') }).expect(200);
  });

  it('Telegram: сурат бо навиштаи "120 гӯшт бозор" → хароҷот бо сурат', async () => {
    const r = await A.post('/api/telegram/link').expect(200);
    const code = r.body.url.split('start=')[1];
    const hook = (u: object) => request(app).post('/api/telegram/webhook').set('x-telegram-bot-api-secret-token', secret).send(u);
    await hook({ message: { text: `/start ${code}`, chat: { id: CHAT, type: 'private' } } }).expect(200);
    await hook({ callback_query: { id: 'c', data: 'income:skip', message: { chat: { id: CHAT, type: 'private' } } } }).expect(200);
    // бе навишта → маслиҳат
    await hook({ message: { photo: [{ file_id: 'small', width: 90, height: 90 }], chat: { id: CHAT, type: 'private' } } }).expect(200);
    expect(String(calls.filter((c) => c.method === 'sendMessage').at(-1)!.body.text)).toContain('<code>50 нон</code>');
    await hook({
      message: {
        caption: '120 гӯшт бозор',
        photo: [{ file_id: 'small', width: 90, height: 90, file_size: 2000 }, { file_id: 'big', width: 1280, height: 960, file_size: 150000 }],
        chat: { id: CHAT, type: 'private' },
      },
    }).expect(200);
    expect(calls.some((c) => c.method === 'getFile' && c.body.file_id === 'big')).toBe(true);
    const tx = (await A.get('/api/transactions?q=' + encodeURIComponent('бозор'))).body.items[0];
    expect(tx.amount).toBe('120.00');
    expect(tx.category.name).toBe('Хӯрок');
    expect(tx.hasPhoto).toBe(true);
    const stored = await prisma.transactionPhoto.findUnique({ where: { transactionId: tx.id } });
    expect(stored?.telegramFileId).toBe('big');
  });

  it('бегоҳ: пас аз ҳисоботи рӯз албоми суратҳои харид меояд', async () => {
    const at = fromZonedTime(`${day}T21:05:00`, 'Asia/Dushanbe');
    const before = uploads.length;
    expect((await bot.sendDailySummaries(at)).sent).toBe(1);
    const album = uploads.slice(before).find((u) => u.method === 'sendMediaGroup');
    expect(album).toBeTruthy();
    const media = JSON.parse(album!.fields.media) as { media: string; caption: string }[];
    expect(media).toHaveLength(2);
    expect(media.some((m) => m.media === 'big')).toBe(true); // аз Telegram — бе боргирии дубора
    expect(media.some((m) => m.media.startsWith('attach://'))).toBe(true); // аз сайт — бо файл
    expect(media.map((m) => m.caption).join('|')).toContain('35.00 смн');
    expect(calls.some((c) => c.method === 'sendMessage' && String(c.body.text).includes('Суратҳои харидҳо'))).toBe(true);
  });

  it('нест кардани сурат ва амалиёт', async () => {
    await A.delete(`/api/transactions/${txId}/photo`).expect(200);
    await A.get(`/api/transactions/${txId}/photo`).expect(404);
    await A.put(`/api/transactions/${txId}/photo`).send({ data: JPEG.toString('base64') }).expect(200);
    await A.delete(`/api/transactions/${txId}`).expect(200);
    expect(await prisma.transactionPhoto.count({ where: { transactionId: txId } })).toBe(0);
  });
});
