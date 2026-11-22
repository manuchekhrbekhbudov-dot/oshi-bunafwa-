import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

const hasDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasDb)('API (integration, PostgreSQL)', () => {
  let app: Express;
  let prisma: (typeof import('../src/lib/prisma.js'))['prisma'];
  let A: ReturnType<typeof request.agent>;
  let B: ReturnType<typeof request.agent>;
  let cash: string;
  let card: string;
  let usd: string;
  let incomeCat: string;
  let foodCat: string;
  const day = '2026-11-10';

  beforeAll(async () => {
    ({ prisma } = await import('../src/lib/prisma.js'));
    const { createApp } = await import('../src/app.js');
    // Тоза кардани базаи тестӣ
    await prisma.$executeRawUnsafe(
      'TRUNCATE "User", "Session", "PasswordResetToken", "Account", "Category", "Transaction", "Transfer", "Debt", "DebtPayment", "ExchangeRate" CASCADE',
    );
    app = createApp();
    A = request.agent(app);
    B = request.agent(app);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe('auth', () => {
    it('бе сессия → 401', async () => {
      await request(app).get('/api/accounts').expect(401);
      await request(app).get('/api/auth/me').expect(401);
    });

    it('сабти ном: пароли заиф рад мешавад', async () => {
      const r = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'weak@test.tj', password: '123' })
        .expect(400);
      expect(r.body.error.details.fields.password).toBeTruthy();
    });

    it('сабти ном → категорияҳо ва ҳисоби пешфарз сохта мешаванд', async () => {
      const r = await A.post('/api/auth/register')
        .send({ name: 'Алӣ', email: 'Ali@Test.tj', password: 'parol1234' })
        .expect(201);
      expect(r.body.user.email).toBe('ali@test.tj');
      expect(r.headers['set-cookie'][0]).toMatch(/HttpOnly/);
      const cats = await A.get('/api/categories').expect(200);
      expect(cats.body.categories.filter((c: { kind: string }) => c.kind === 'INCOME')).toHaveLength(5);
      expect(cats.body.categories.filter((c: { kind: string }) => c.kind === 'EXPENSE')).toHaveLength(8);
      incomeCat = cats.body.categories.find((c: { name: string; kind: string }) => c.name === 'Маош' && c.kind === 'INCOME').id;
      foodCat = cats.body.categories.find((c: { name: string }) => c.name === 'Хӯрок').id;
      const acc = await A.get('/api/accounts').expect(200);
      expect(acc.body.accounts).toHaveLength(1);
      cash = acc.body.accounts[0].id;
    });

    it('email-и такрорӣ → 409', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Икс', email: 'ali@test.tj', password: 'parol1234' })
        .expect(409);
    });

    it('login: пароли нодуруст → 401, дуруст → 200', async () => {
      await request(app).post('/api/auth/login').send({ email: 'ali@test.tj', password: 'nodurust1' }).expect(401);
      await request(app).post('/api/auth/login').send({ email: 'nobody@test.tj', password: 'nodurust1' }).expect(401);
      await B.post('/api/auth/register').send({ name: 'Валӣ', email: 'vali@test.tj', password: 'parol5678' }).expect(201);
    });

    it('CSRF: Origin-и бегона рад мешавад', async () => {
      await request(app)
        .post('/api/auth/login')
        .set('Origin', 'https://evil.example')
        .send({ email: 'ali@test.tj', password: 'parol1234' })
        .expect(403);
    });
  });

  describe('accounts & transactions', () => {
    it('ҳисобҳои нав', async () => {
      card = (await A.post('/api/accounts').send({ name: 'Корти Алиф', type: 'CARD', currency: 'TJS' }).expect(201)).body.account.id;
      usd = (await A.post('/api/accounts').send({ name: 'Доллар', type: 'CASH', currency: 'USD', initialBalance: '100' }).expect(201)).body.account.id;
      await A.patch(`/api/accounts/${cash}`).send({ initialBalance: '500.00' }).expect(200);
    });

    it('даромад ва хароҷот баланс ва ҳисоботро фавран нав мекунанд', async () => {
      const inc = await A.post('/api/transactions')
        .send({ type: 'INCOME', amount: '1500.50', accountId: cash, categoryId: incomeCat, occurredAt: `${day}T09:00`, source: 'Ширкат', paymentMethod: 'CASH' })
        .expect(201);
      expect(inc.body.transaction.amount).toBe('1500.50');
      expect(inc.body.transaction.currency).toBe('TJS');
      await A.post('/api/transactions')
        .send({ type: 'EXPENSE', amount: '0.10', accountId: cash, categoryId: foodCat, occurredAt: `${day}T12:00` })
        .expect(201);
      await A.post('/api/transactions')
        .send({ type: 'EXPENSE', amount: '0.20', accountId: cash, categoryId: foodCat, occurredAt: `${day}T13:00`, purpose: 'Чой' })
        .expect(201);

      const acc = await A.get('/api/accounts').expect(200);
      const c = acc.body.accounts.find((a: { id: string }) => a.id === cash);
      expect(c.balance).toBe('2000.20'); // 500 + 1500.50 − 0.30

      const r = await A.get(`/api/reports/daily?date=${day}`).expect(200);
      expect(r.body.summary.income).toBe('1500.50');
      expect(r.body.summary.expense).toBe('0.30');
      expect(r.body.summary.net).toBe('1500.20');
      expect(r.body.operationsCount).toBe(3);
    });

    it('валидатсия: маблағи нодуруст, асъори номувофиқ, категорияи нодуруст', async () => {
      await A.post('/api/transactions').send({ type: 'INCOME', amount: '-5', accountId: cash, occurredAt: `${day}T09:00` }).expect(400);
      await A.post('/api/transactions').send({ type: 'INCOME', amount: '5', accountId: cash, currency: 'USD', occurredAt: `${day}T09:00` }).expect(400);
      await A.post('/api/transactions').send({ type: 'INCOME', amount: '5', accountId: cash, categoryId: foodCat, occurredAt: `${day}T09:00` }).expect(400);
      await A.post('/api/transactions').send({ type: 'INCOME', amount: '5', accountId: cash, occurredAt: 'дирӯз' }).expect(400);
    });

    it('таҳрири амалиёт ҳисоботро дуруст нав мекунад', async () => {
      const list = await A.get('/api/transactions?type=INCOME').expect(200);
      const id = list.body.items[0].id;
      await A.patch(`/api/transactions/${id}`).send({ amount: '1000.00' }).expect(200);
      const r = await A.get(`/api/reports/daily?date=${day}`).expect(200);
      expect(r.body.summary.income).toBe('1000.00');
      expect(r.body.summary.net).toBe('999.70');
      // Интиқол ба рӯзи дигар
      await A.patch(`/api/transactions/${id}`).send({ occurredAt: '2026-11-11T09:00' }).expect(200);
      expect((await A.get(`/api/reports/daily?date=${day}`)).body.summary.income).toBe('0.00');
      await A.patch(`/api/transactions/${id}`).send({ occurredAt: `${day}T09:00` }).expect(200);
    });

    it('ҳисоби бойгонӣ: амалиёти нав манъ, таҳрири амалиёти кӯҳна иҷозат', async () => {
      const arch = (await A.post('/api/accounts').send({ name: 'Кӯҳна', type: 'CASH', currency: 'TJS' }).expect(201)).body.account.id;
      const tx = (await A.post('/api/transactions').send({ type: 'EXPENSE', amount: '5', accountId: arch, occurredAt: '2026-10-01T10:00' }).expect(201)).body.transaction.id;
      await A.patch(`/api/accounts/${arch}`).send({ archived: true }).expect(200);
      await A.post('/api/transactions').send({ type: 'EXPENSE', amount: '5', accountId: arch, occurredAt: '2026-10-01T10:00' }).expect(400);
      await A.patch(`/api/transactions/${tx}`).send({ note: 'ислоҳ' }).expect(200);
      await A.delete(`/api/transactions/${tx}`).expect(200);
      await A.delete(`/api/accounts/${arch}`).expect(200);
    });

    it('ҷустуҷӯ, филтр, саҳифабандӣ, сорт', async () => {
      const r = await A.get('/api/transactions?q=чой').expect(200);
      expect(r.body.total).toBe(1);
      const p = await A.get('/api/transactions?type=EXPENSE&pageSize=1&page=2&sort=amount&order=asc').expect(200);
      expect(p.body.total).toBe(2);
      expect(p.body.pages).toBe(2);
      expect(p.body.items[0].amount).toBe('0.20');
      const f = await A.get(`/api/transactions?from=${day}&to=${day}&categoryId=${foodCat}`).expect(200);
      expect(f.body.total).toBe(2);
    });
  });

  describe('изолятсияи маълумот байни истифодабарандагон', () => {
    it('B маълумоти A-ро намебинад ва тағйир дода наметавонад', async () => {
      const list = await B.get('/api/transactions').expect(200);
      expect(list.body.total).toBe(0);
      const aTx = (await A.get('/api/transactions')).body.items[0].id;
      await B.get(`/api/transactions/${aTx}`).expect(404);
      await B.patch(`/api/transactions/${aTx}`).send({ amount: '1' }).expect(404);
      await B.delete(`/api/transactions/${aTx}`).expect(404);
      // B ба ҳисоби A амалиёт илова карда наметавонад
      await B.post('/api/transactions').send({ type: 'INCOME', amount: '5', accountId: cash, occurredAt: `${day}T09:00` }).expect(404);
      await B.patch(`/api/accounts/${cash}`).send({ name: 'hack' }).expect(404);
      const rb = await B.get(`/api/reports/daily?date=${day}`).expect(200);
      expect(rb.body.summary.income).toBe('0.00');
    });
  });

  describe('transfers', () => {
    it('интиқол балансро иваз мекунад, вале даромад/хароҷот НЕ', async () => {
      const before = (await A.get(`/api/reports/daily?date=${day}`)).body.summary;
      const totalBefore = (await A.get('/api/accounts')).body.total.total;
      const t = await A.post('/api/transfers').send({ fromAccountId: cash, toAccountId: card, amount: '300', occurredAt: `${day}T15:00` }).expect(201);
      const after = (await A.get(`/api/reports/daily?date=${day}`)).body;
      expect(after.summary.income).toBe(before.income);
      expect(after.summary.expense).toBe(before.expense);
      const accs = (await A.get('/api/accounts')).body;
      expect(accs.accounts.find((a: { id: string }) => a.id === card).balance).toBe('300.00');
      expect(accs.total.total).toBe(totalBefore);

      // таҳрир
      await A.put(`/api/transfers/${t.body.transfer.id}`).send({ fromAccountId: cash, toAccountId: card, amount: '250', occurredAt: `${day}T15:00` }).expect(200);
      expect((await A.get('/api/accounts')).body.accounts.find((a: { id: string }) => a.id === card).balance).toBe('250.00');
    });

    it('интиқол байни асъорҳои гуногун маблағи қабулшударо талаб мекунад', async () => {
      await A.post('/api/transfers').send({ fromAccountId: cash, toAccountId: usd, amount: '109.5', occurredAt: `${day}T16:00` }).expect(400);
      await A.post('/api/transfers').send({ fromAccountId: cash, toAccountId: usd, amount: '109.5', amountTo: '10', occurredAt: `${day}T16:00` }).expect(201);
      const accs = (await A.get('/api/accounts')).body;
      expect(accs.accounts.find((a: { id: string }) => a.id === usd).balance).toBe('110.00');
      await A.post('/api/transfers').send({ fromAccountId: cash, toAccountId: cash, amount: '1', occurredAt: `${day}T16:00` }).expect(400);
    });

    it('нест кардани сатри интиқол аз таърих ҳарду тарафро нест мекунад', async () => {
      const list = (await A.get('/api/transactions?type=TRANSFER')).body.items;
      expect(list.length).toBe(4);
      await A.delete(`/api/transactions/${list[0].id}`).expect(200);
      expect((await A.get('/api/transactions?type=TRANSFER')).body.total).toBe(2);
    });
  });

  describe('rates', () => {
    it('баланси умумӣ бе қурб USD-ро ҷамъ намекунад, бо қурб — мекунад', async () => {
      const t1 = (await A.get('/api/accounts')).body.total;
      expect(t1.missingRates).toContain('USD');
      await A.put('/api/rates').send({ rates: { USD: '10.95' } }).expect(200);
      const t2 = (await A.get('/api/accounts')).body.total;
      expect(t2.missingRates).toEqual([]);
      // TJS + 100 USD × 10.95
      const tjs = Number(t2.byCurrency.TJS);
      expect(t2.total).toBe((tjs + 100 * 10.95).toFixed(2));
      await A.put('/api/rates').send({ rates: { USD: '-1' } }).expect(400);
    });
  });

  describe('debts', () => {
    let debtId: string;
    it('қарз додан балансро кам мекунад, вале хароҷот нест', async () => {
      const bal0 = (await A.get('/api/accounts')).body.accounts.find((a: { id: string }) => a.id === cash).balance;
      const d = await A.post('/api/debts')
        .send({ direction: 'LENT', counterparty: 'Карим', amount: '1000', currency: 'TJS', accountId: cash, issuedAt: `${day}T10:00`, dueDate: '2026-12-01' })
        .expect(201);
      debtId = d.body.debt.id;
      expect(d.body.debt.status).toBe('ACTIVE');
      const bal1 = (await A.get('/api/accounts')).body.accounts.find((a: { id: string }) => a.id === cash).balance;
      expect((Number(bal0) - Number(bal1)).toFixed(2)).toBe('1000.00');
      const r = (await A.get(`/api/reports/daily?date=${day}`)).body.summary;
      expect(r.expense).toBe('0.30');
    });

    it('пардохти қисм-қисм ва ҳолатҳо', async () => {
      let d = (await A.post(`/api/debts/${debtId}/payments`).send({ amount: '400', accountId: cash, paidAt: `${day}T18:00` }).expect(201)).body.debt;
      expect(d.status).toBe('PARTIAL');
      expect(d.remaining).toBe('600.00');
      await A.post(`/api/debts/${debtId}/payments`).send({ amount: '600.01', accountId: cash, paidAt: `${day}T18:00` }).expect(400);
      d = (await A.post(`/api/debts/${debtId}/payments`).send({ amount: '600', paidAt: `${day}T19:00` }).expect(201)).body.debt;
      expect(d.status).toBe('PAID');
      expect(d.progress).toBe('100.0');
      // Пардохтҳо ба даромад дохил намешаванд
      const r = (await A.get(`/api/reports/daily?date=${day}`)).body.summary;
      expect(r.income).toBe('1000.00');
      // Нест кардани пардохт → боз қисман
      d = (await A.delete(`/api/debts/${debtId}/payments/${d.payments[0].id}`).expect(200)).body.debt;
      expect(d.status).toBe('PARTIAL');
    });

    it('маблағи қарз аз пардохтшуда кам буда наметавонад; ҳисоби бо асъори дигар рад мешавад', async () => {
      await A.put(`/api/debts/${debtId}`)
        .send({ direction: 'LENT', counterparty: 'Карим', amount: '300', currency: 'TJS', accountId: cash, issuedAt: `${day}T10:00` })
        .expect(400);
      await A.post('/api/debts')
        .send({ direction: 'BORROWED', counterparty: 'Бонк', amount: '50', currency: 'TJS', accountId: usd, issuedAt: `${day}T10:00` })
        .expect(400);
    });

    it('муҳлатгузашта ва ҷамъбаст', async () => {
      await A.post('/api/debts')
        .send({ direction: 'BORROWED', counterparty: 'Ҳасан', amount: '200', currency: 'TJS', issuedAt: '2026-01-01T10:00', dueDate: '2026-02-01' })
        .expect(201);
      const s = (await A.get('/api/debts/summary').expect(200)).body;
      expect(s.lent.remaining).toBe('600.00');
      expect(s.borrowed.remaining).toBe('200.00');
      expect(s.overdue).toBe(1);
      const overdue = (await A.get('/api/debts?status=OVERDUE')).body.debts;
      expect(overdue).toHaveLength(1);
      await B.get(`/api/debts/${debtId}`).expect(404);
    });

    it('амалиёти қарзӣ аз таърих нест карда намешавад', async () => {
      const t = (await A.get('/api/transactions?type=DEBT')).body.items[0];
      await A.delete(`/api/transactions/${t.id}`).expect(409);
    });

    it('нест кардани қарз балансро барқарор мекунад', async () => {
      const before = (await A.get('/api/accounts')).body.accounts.find((a: { id: string }) => a.id === cash).balance;
      await A.delete(`/api/debts/${debtId}`).expect(200);
      const after = (await A.get('/api/accounts')).body.accounts.find((a: { id: string }) => a.id === cash).balance;
      // −1000 (додан) + 400 (баргашт) бекор шуд → +600
      expect((Number(after) - Number(before)).toFixed(2)).toBe('600.00');
    });
  });

  describe('reports', () => {
    it('ҳисоботи давра бо силсила ва категорияҳо', async () => {
      const r = (await A.get('/api/reports/period?from=2026-11-01&to=2026-11-30').expect(200)).body;
      expect(r.granularity).toBe('day');
      expect(r.series).toHaveLength(30);
      expect(r.summary.income).toBe('1000.00');
      expect(r.expenseByCategory[0].name).toBe('Хӯрок');
      const y = (await A.get('/api/reports/period?from=2026-01-01&to=2026-12-31').expect(200)).body;
      expect(y.granularity).toBe('month');
      expect(y.series).toHaveLength(12);
      await A.get('/api/reports/period?from=2026-12-01&to=2026-01-01').expect(400);
    });

    it('баланси охири рӯз = баланси аввал + тағйироти рӯз', async () => {
      const r = (await A.get(`/api/reports/daily?date=${day}`)).body;
      const acc = r.accounts.find((a: { id: string }) => a.id === card);
      expect(acc.openingBalance).toBe('0.00');
      expect(acc.balance).toBe('250.00');
      const prev = (await A.get(`/api/reports/daily?date=2026-11-09`)).body;
      expect(prev.closingBalance.total).toBe(r.openingBalance.total);
    });

    it('dashboard', async () => {
      const d = (await A.get('/api/reports/dashboard').expect(200)).body;
      expect(d.charts.days7).toHaveLength(7);
      expect(d.charts.days30).toHaveLength(30);
      expect(d.charts.months12).toHaveLength(12);
      expect(d.balance.base).toBe('TJS');
      expect(d.debts.borrowed.remaining).toBe('200.00');
    });

    it('содирот: CSV, XLSX, PDF', async () => {
      const csv = await A.get(`/api/reports/export?kind=daily&format=csv&date=${day}`).expect(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      expect(csv.text).toContain('Даромад');
      const xlsx = await A.get('/api/reports/export?kind=period&format=xlsx&from=2026-11-01&to=2026-11-30').buffer(true).expect(200);
      expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
      const pdf = await A.get(`/api/reports/export?kind=daily&format=pdf&date=${day}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      const tx = await A.get('/api/reports/transactions/export?format=csv&type=EXPENSE').expect(200);
      expect(tx.text.split('\r\n').filter(Boolean)).toHaveLength(3);
    });
  });

  describe('password', () => {
    it('иваз кардани парол', async () => {
      await A.post('/api/auth/change-password').send({ currentPassword: 'galat1234', newPassword: 'navparol1' }).expect(400);
      await A.post('/api/auth/change-password').send({ currentPassword: 'parol1234', newPassword: 'navparol1' }).expect(200);
      await request(app).post('/api/auth/login').send({ email: 'ali@test.tj', password: 'navparol1' }).expect(200);
    });

    it('фаромӯш кардани парол → линк → пароли нав', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await request(app).post('/api/auth/forgot-password').send({ email: 'ali@test.tj' }).expect(200);
      await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@test.tj' }).expect(200);
      const out = spy.mock.calls.map((c) => String(c[0])).join('\n');
      spy.mockRestore();
      const token = decodeURIComponent(out.match(/token=([^\s]+)/)![1]);
      await request(app).post('/api/auth/reset-password').send({ token, password: 'reset12345' }).expect(200);
      // токен як маротиба кор мекунад
      await request(app).post('/api/auth/reset-password').send({ token, password: 'reset12345' }).expect(400);
      // сессияҳои кӯҳна бекор шуданд
      await A.get('/api/auth/me').expect(401);
      await request(app).post('/api/auth/login').send({ email: 'ali@test.tj', password: 'reset12345' }).expect(200);
    });

    it('logout', async () => {
      await B.post('/api/auth/logout').expect(200);
      await B.get('/api/auth/me').expect(401);
    });
  });
});
