# HISOB PRO

**Пулҳои худро оқилона идора кунед.**

Платформаи пурраи идоракунии маблағҳои шахсӣ ва тиҷорати хурд: даромад, хароҷот, ҳамёнҳо, интиқолҳо, қарзҳо, ҳисоботҳо (PDF / Excel / CSV), ду забон (тоҷикӣ / русӣ), мавзӯи торик ва равшан.

| Қисм | Технология |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide, TanStack Query |
| Backend | Node.js, Express, TypeScript, Zod |
| База | PostgreSQL 16 + Prisma ORM |
| Амният | Сессияҳои httpOnly cookie (токен дар база hash шуда), bcrypt (12 давр), rate-limit, helmet, CSRF-guard |
| Тестҳо | Vitest + Supertest (unit + интегратсионӣ бо PostgreSQL-и воқеӣ) |

---

## 1. Структураи проект

```
hisob-pro/
├── package.json              # npm workspaces: server + client
├── docker-compose.yml        # PostgreSQL 16 (ихтиёрӣ)
├── docker/init-test-db.sql   # базаи тестӣ
├── .vscode/                  # тавсияи extension-ҳо, debug
├── server/
│   ├── prisma/
│   │   ├── schema.prisma     # User, Session, Account, Category, Transaction, Transfer, Debt, DebtPayment, ExchangeRate
│   │   ├── migrations/       # SQL-миграцияҳо
│   │   └── seed.ts           # корбари демо + ~1000 амалиёт
│   ├── assets/fonts/         # DejaVu Sans (кириллитсаи тоҷикӣ дар PDF)
│   ├── src/
│   │   ├── index.ts          # оғози сервер
│   │   ├── app.ts            # Express, middleware, роутҳо
│   │   ├── config.ts
│   │   ├── lib/              # money.ts (Decimal), dates.ts (Asia/Dushanbe), validators, errors
│   │   ├── middleware/       # auth.ts (сессия, CSRF), error.ts
│   │   ├── services/
│   │   │   ├── calc.ts       # ★ ҳамаи ҳисобкуниҳои молиявӣ (бе база, бо тест)
│   │   │   ├── ledger.ts     # баланс ва сатрҳои амалиёт аз база
│   │   │   ├── reports.ts    # рӯзона, давра, dashboard
│   │   │   ├── export.ts     # CSV, XLSX (exceljs), PDF (pdfkit)
│   │   │   └── auth.ts, defaults.ts, mail.ts, ownership.ts, serialize.ts
│   │   └── routes/           # auth, accounts, categories, transactions, transfers, debts, reports, rates
│   └── tests/                # money, dates, calc (unit) + api (интегратсионӣ)
└── client/
    ├── index.html, vite.config.ts, tailwind.config.js
    └── src/
        ├── main.tsx, App.tsx          # провайдерҳо ва роутинг
        ├── lib/                       # api.ts, format.ts, dates.ts, types.ts
        ├── i18n/                      # луғати тоҷикӣ ва русӣ
        ├── hooks/                     # useAuth, useTheme, queries (React Query)
        ├── components/
        │   ├── ui/                    # Button, Field, Modal, ConfirmDialog, Toast, Card, Badge, Pagination…
        │   ├── layout/                # AppLayout (sidebar + top nav + mobile), AuthLayout, QuickAdd
        │   ├── charts/                # Area, Bar, Donut, CategoryBars
        │   ├── forms/                 # Transaction, Transfer, Account, Debt, Payment
        │   └── TxTable.tsx            # ҷадвали амалиётҳо (desktop + mobile)
        └── pages/                     # Dashboard, KindPage (Даромад/Хароҷот), History, Accounts, Debts, Reports, Settings, auth/*
```

## 2. Қоидаҳои ҳисобдорӣ (чӣ тавр амалӣ шудаанд)

1. **Decimal, на float.** Дар база `NUMERIC(18,2)`, дар сервер `decimal.js`. API маблағҳоро ҳамчун сатр (`"1250.50"`) бармегардонад. Клиент танҳо формат мекунад.
2. **Асъорҳо бе қурб ҷамъ намешаванд.** Қурбро корбар дар «Танзимот» муайян мекунад (`1 USD = X TJS`). Агар қурб набошад, маблағ аз ҷамъи умумӣ хориҷ мешавад ва огоҳӣ (`missingRates`) нишон дода мешавад; ҷамъ аз рӯи ҳар асъор (`byCurrency`) ҳамеша дастрас аст. Асъори амалиёт ҳамеша ба асъори ҳисоб баробар аст.
3. **Баланс ҳисоб карда мешавад, нигоҳ дошта намешавад:** `баланс = баланси аввала + Σ(аломат × маблағ)`. Аз ин рӯ таҳрир/нест кардани ҳар амалиёт балансу ҳисоботро худкор дуруст мекунад.
4. **Интиқолҳо** ду сатр месозанд (`TRANSFER_OUT` / `TRANSFER_IN`) ва ба даромад/хароҷот дохил **нестанд**. Интиқоли байни асъорҳо маблағи қабулшударо талаб мекунад.
5. **Қарзҳо** (`DEBT_LENT`, `DEBT_BORROWED`, `DEBT_COLLECTED`, `DEBT_REPAID`) танҳо балансро тағйир медиҳанд, на фоидаро. Пардохти қисм-қисм, санҷиши аз ҳад зиёд пардохт, ҳолатҳо: фаъол / қисман / пурра / муҳлатгузашта.
6. **Asia/Dushanbe.** Вақт дар база UTC; «рӯз», «ҳафта», «моҳ» аз рӯи вақти Душанбе (UTC+5) ҳисоб мешаванд, новобаста аз минтақаи браузер ё сервер.
7. **Ҷудоии маълумот.** `userId` ҳамеша аз сессия гирифта мешавад; ҳар дархост бо `userId` филтр мешавад. Тест тасдиқ мекунад, ки корбари B ба маълумоти A дастрасӣ надорад (404).
8. Ҳамааш дар PostgreSQL нигоҳ дошта мешавад. Браузер танҳо забон ва мавзӯъро дар `localStorage` нигоҳ медорад.

`Натиҷаи рӯз = Даромади рӯз − Хароҷоти рӯз`

## 3. Насб ва ба кор даровардан дар VS Code

### Талабот
- **Node.js 20+** (тавсия: 22 LTS) — https://nodejs.org
- **PostgreSQL 16** — ё бо Docker Desktop, ё насби маҳаллӣ
- **VS Code** — ҳангоми кушодани папка extension-ҳои тавсияшударо насб кунед (Prisma, Tailwind CSS IntelliSense, Vitest)

### Қадами 1 — кушодани проект
VS Code → *File → Open Folder…* → папкаи `hisob-pro`. Терминалро кушоед: **Ctrl + `**.

### Қадами 2 — насби вобастагиҳо
```bash
npm install
```

### Қадами 3 — PostgreSQL

**Варианти A: Docker (осонтар)**
```bash
docker compose up -d
```
Ин базаҳои `hisob_pro` ва `hisob_pro_test`-ро бо корбари `hisob` / пароли `hisob` месозад.

**Варианти B: PostgreSQL-и насбшуда** — дар `psql` (ё pgAdmin):
```sql
CREATE USER hisob WITH PASSWORD 'hisob' CREATEDB;
CREATE DATABASE hisob_pro OWNER hisob;
CREATE DATABASE hisob_pro_test OWNER hisob;
```

### Қадами 4 — файли `.env`
```bash
cp server/.env.example server/.env
```
Дар Windows (PowerShell): `Copy-Item server/.env.example server/.env`. Агар парол ё порти базаи шумо дигар бошад, `DATABASE_URL` ва `TEST_DATABASE_URL`-ро иваз кунед.

### Қадами 5 — сохтани ҷадвалҳо (миграция)
```bash
npm run db:migrate
```

### Қадами 6 — маълумоти демо (ихтиёрӣ)
```bash
npm run db:seed
```
Воридшавӣ: **demo@hisob.pro** / **demo12345**

### Қадами 7 — оғоз
```bash
npm run dev
```
- Frontend: http://localhost:5173
- API: http://localhost:4000/api (health: `/api/health`)

### Тестҳо
```bash
npm test
```
53 тести сервер (decimal, санаҳо дар Душанбе, ҳисобот, баланс, интиқол, қарз, ҷудоии корбарон, содирот, парол) + тестҳои клиент. Тестҳои интегратсионӣ базаи `TEST_DATABASE_URL`-ро **тоза мекунанд** — ҳеҷ гоҳ онро ба базаи асосӣ нагузоред. Агар `TEST_DATABASE_URL` набошад, тестҳои интегратсионӣ гузаронида мешаванд (skip).

### Production
```bash
npm run build
npm run db:deploy
NODE_ENV=production npm start
```
Сервер `client/dist`-ро худаш медиҳад: ҳама чиз дар http://localhost:4000. Дар production HTTPS лозим аст (cookie бо `secure`), `APP_URL`-ро ба домени худ гузоред ва SMTP-ро барои фиристодани линки барқарорсозии парол танзим кунед (бе SMTP линк дар консоли сервер чоп мешавад).

### Фармонҳои муфид
| Фармон | Вазифа |
|---|---|
| `npm run db:studio` | Prisma Studio — дидани база дар браузер |
| `npm run typecheck -w server` / `-w client` | санҷиши TypeScript |
| VS Code → *Run and Debug* → «Server (API) debug» | debug-и backend бо breakpoint |

## 4. API (кӯтоҳ)

| Метод | Роҳ | Тавсиф |
|---|---|---|
| POST | `/api/auth/register`, `/login`, `/logout`, `/logout-all` | Воридшавӣ |
| POST | `/api/auth/forgot-password`, `/reset-password`, `/change-password` | Парол |
| GET/PATCH | `/api/auth/me`, `/api/auth/profile` | Кабинети шахсӣ |
| CRUD | `/api/accounts`, `/api/categories` | Ҳисобҳо, категорияҳо |
| CRUD | `/api/transactions` | Даромад/хароҷот; GET бо `type, q, from, to, accountId, categoryId, currency, paymentMethod, minAmount, maxAmount, sort, order, page, pageSize` |
| CRUD | `/api/transfers` | Интиқол |
| CRUD | `/api/debts`, `POST /api/debts/:id/payments`, `DELETE /api/debts/:id/payments/:pid`, `GET /api/debts/summary` | Қарзҳо |
| GET/PUT | `/api/rates` | Қурби асъор |
| GET | `/api/reports/dashboard`, `/daily?date=`, `/period?from=&to=&granularity=&currency=` | Ҳисоботҳо |
| GET | `/api/reports/export?kind=daily\|period&format=pdf\|xlsx\|csv`, `/api/reports/transactions/export?format=…` | Содирот |
