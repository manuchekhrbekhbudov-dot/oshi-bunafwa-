/**
 * Нусхаи эҳтиётии маълумоти як корбар (Excel) ва барқарорсозӣ аз он.
 *
 * Файл ҳам барои одам хонданӣ аст (вараҳи «Хулоса»), ҳам барои барқарорсозии пурра:
 * ҳамаи идентификаторҳо ва маблағҳо ҳамчун матн (бе float) нигоҳ дошта мешаванд.
 * Суратҳо дар нусха нестанд (онҳо ҳар бегоҳ ба Telegram фиристода мешаванд).
 */
import ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { money } from '../lib/money.js';
import { formatLocal } from '../lib/dates.js';

export const BACKUP_FORMAT = 'hisob-pro-backup';
export const BACKUP_VERSION = 1;

type Row = Record<string, string | number | boolean | null>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function addSheet(wb: ExcelJS.Workbook, name: string, rows: Row[], columns: string[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ header: c, key: c, width: Math.max(12, c.length + 2) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(columns.map((c) => r[c] ?? null));
  return ws;
}

export async function buildBackup(userId: string) {
  const [user, accounts, categories, transactions, transfers, debts, payments, rates, link] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, phone: true, baseCurrency: true, language: true } }),
    prisma.account.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.category.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { occurredAt: 'asc' },
      include: { account: { select: { name: true } }, category: { select: { name: true } } },
    }),
    prisma.transfer.findMany({ where: { userId }, orderBy: { occurredAt: 'asc' } }),
    prisma.debt.findMany({ where: { userId }, orderBy: { issuedAt: 'asc' } }),
    prisma.debtPayment.findMany({ where: { userId }, orderBy: { paidAt: 'asc' } }),
    prisma.exchangeRate.findMany({ where: { userId } }),
    prisma.telegramLink.findUnique({ where: { userId } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HISOB PRO';
  const now = new Date();

  // Хулоса — барои одам
  const summary = wb.addWorksheet('Хулоса');
  summary.columns = [{ width: 30 }, { width: 40 }];
  summary.addRow(['HISOB PRO — нусхаи эҳтиётӣ']).font = { bold: true, size: 14 };
  summary.addRow(['Сана', `${formatLocal(now)} (Asia/Dushanbe)`]);
  summary.addRow(['Корбар', user.name]);
  summary.addRow(['Телефон / email', user.phone ?? user.email ?? '']);
  summary.addRow(['Ҳисобҳо', accounts.length]);
  summary.addRow(['Амалиётҳо', transactions.length]);
  summary.addRow(['Қарзҳо', debts.length]);
  summary.addRow([]);
  summary.addRow(['Ин файлро нигоҳ доред: бо он ҳамаи маълумотро барқарор кардан мумкин аст.']);

  addSheet(
    wb,
    '_info',
    [
      { key: 'format', value: BACKUP_FORMAT },
      { key: 'version', value: BACKUP_VERSION },
      { key: 'exportedAt', value: now.toISOString() },
      { key: 'baseCurrency', value: user.baseCurrency },
      { key: 'language', value: user.language },
      { key: 'incomeSource', value: link?.incomeSource ?? null },
      { key: 'monthlyIncome', value: link?.monthlyIncome ? money(link.monthlyIncome) : null },
      { key: 'dailyLimit', value: link?.dailyLimit ? money(link.dailyLimit) : null },
    ],
    ['key', 'value'],
  );
  addSheet(
    wb,
    'Accounts',
    accounts.map((a) => ({
      id: a.id, name: a.name, type: a.type, currency: a.currency, initialBalance: money(a.initialBalance),
      color: a.color, archived: a.archived, createdAt: iso(a.createdAt),
    })),
    ['id', 'name', 'type', 'currency', 'initialBalance', 'color', 'archived', 'createdAt'],
  );
  addSheet(
    wb,
    'Categories',
    categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, color: c.color, icon: c.icon, isSystem: c.isSystem })),
    ['id', 'name', 'kind', 'color', 'icon', 'isSystem'],
  );
  addSheet(
    wb,
    'Transactions',
    transactions.map((t) => ({
      id: t.id, type: t.type, amount: money(t.amount), currency: t.currency, accountId: t.accountId,
      categoryId: t.categoryId, occurredAt: iso(t.occurredAt), source: t.source, purpose: t.purpose,
      paymentMethod: t.paymentMethod, note: t.note, transferId: t.transferId, debtId: t.debtId, debtPaymentId: t.debtPaymentId,
      // сутунҳои хонданӣ
      dateLocal: formatLocal(t.occurredAt), accountName: t.account?.name ?? null, categoryName: t.category?.name ?? null,
    })),
    ['id', 'type', 'amount', 'currency', 'accountId', 'categoryId', 'occurredAt', 'source', 'purpose', 'paymentMethod', 'note',
      'transferId', 'debtId', 'debtPaymentId', 'dateLocal', 'accountName', 'categoryName'],
  );
  addSheet(
    wb,
    'Transfers',
    transfers.map((t) => ({
      id: t.id, fromAccountId: t.fromAccountId, toAccountId: t.toAccountId, amountFrom: money(t.amountFrom),
      amountTo: money(t.amountTo), occurredAt: iso(t.occurredAt), note: t.note,
    })),
    ['id', 'fromAccountId', 'toAccountId', 'amountFrom', 'amountTo', 'occurredAt', 'note'],
  );
  addSheet(
    wb,
    'Debts',
    debts.map((d) => ({
      id: d.id, direction: d.direction, counterparty: d.counterparty, phone: d.phone, amount: money(d.amount),
      currency: d.currency, accountId: d.accountId, issuedAt: iso(d.issuedAt), dueDate: iso(d.dueDate), note: d.note,
    })),
    ['id', 'direction', 'counterparty', 'phone', 'amount', 'currency', 'accountId', 'issuedAt', 'dueDate', 'note'],
  );
  addSheet(
    wb,
    'DebtPayments',
    payments.map((p) => ({ id: p.id, debtId: p.debtId, amount: money(p.amount), accountId: p.accountId, paidAt: iso(p.paidAt), note: p.note })),
    ['id', 'debtId', 'amount', 'accountId', 'paidAt', 'note'],
  );
  addSheet(wb, 'Rates', rates.map((r) => ({ currency: r.currency, rate: r.rate.toFixed(6) })), ['currency', 'rate']);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, counts: { accounts: accounts.length, transactions: transactions.length, debts: debts.length } };
}

/* ------------------------------ Барқарорсозӣ ------------------------------ */

function readSheet(wb: ExcelJS.Workbook, name: string): Record<string, string | null>[] {
  const ws = wb.getWorksheet(name);
  if (!ws) return [];
  const header: string[] = [];
  ws.getRow(1).eachCell((cell, col) => (header[col] = String(cell.value)));
  const out: Record<string, string | null>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r: Record<string, string | null> = {};
    header.forEach((h, col) => {
      if (!h) return;
      const v = row.getCell(col).value;
      r[h] = v === null || v === undefined || v === '' ? null : v instanceof Date ? v.toISOString() : String(v);
    });
    out.push(r);
  });
  return out;
}

const s = (v: string | null) => v ?? undefined;
const b = (v: string | null) => v === 'true';
const d = (v: string | null) => (v ? new Date(v) : null);

/**
 * Маълумоти корбарро аз нусха барқарор мекунад. Маълумоти ҳозираи молиявии ҳамин корбар
 * АВВАЛ НЕСТ КАРДА МЕШАВАД, баъд аз файл ворид мешавад (ҳама дар як транзаксия).
 */
export async function restoreBackup(userId: string, file: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  const info = Object.fromEntries(readSheet(wb, '_info').map((r) => [r.key, r.value]));
  if (info.format !== BACKUP_FORMAT) throw new Error('Ин файл нусхаи эҳтиётии HISOB PRO нест');
  if (Number(info.version) > BACKUP_VERSION) throw new Error('Версияи файл навтар аст — барномаро нав кунед');

  const accounts = readSheet(wb, 'Accounts');
  const categories = readSheet(wb, 'Categories');
  const transactions = readSheet(wb, 'Transactions');
  const transfers = readSheet(wb, 'Transfers');
  const debts = readSheet(wb, 'Debts');
  const payments = readSheet(wb, 'DebtPayments');
  const rates = readSheet(wb, 'Rates');

  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Тартиби нест кардан: аз вобастаҳо ба асосӣ
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.debtPayment.deleteMany({ where: { userId } });
      await tx.debt.deleteMany({ where: { userId } });
      await tx.transfer.deleteMany({ where: { userId } });
      await tx.category.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.exchangeRate.deleteMany({ where: { userId } });

      await tx.account.createMany({
        data: accounts.map((a) => ({
          id: a.id!, userId, name: a.name!, type: a.type as never, currency: a.currency as never,
          initialBalance: a.initialBalance ?? '0', color: s(a.color), archived: b(a.archived),
          createdAt: d(a.createdAt) ?? undefined,
        })),
      });
      await tx.category.createMany({
        data: categories.map((c) => ({
          id: c.id!, userId, name: c.name!, kind: c.kind as never, color: s(c.color), icon: s(c.icon), isSystem: b(c.isSystem),
        })),
      });
      await tx.transfer.createMany({
        data: transfers.map((t) => ({
          id: t.id!, userId, fromAccountId: t.fromAccountId!, toAccountId: t.toAccountId!, amountFrom: t.amountFrom!,
          amountTo: t.amountTo!, occurredAt: d(t.occurredAt)!, note: t.note,
        })),
      });
      await tx.debt.createMany({
        data: debts.map((x) => ({
          id: x.id!, userId, direction: x.direction as never, counterparty: x.counterparty!, phone: x.phone, amount: x.amount!,
          currency: x.currency as never, accountId: x.accountId, issuedAt: d(x.issuedAt)!, dueDate: d(x.dueDate), note: x.note,
        })),
      });
      await tx.debtPayment.createMany({
        data: payments.map((p) => ({
          id: p.id!, userId, debtId: p.debtId!, amount: p.amount!, accountId: p.accountId, paidAt: d(p.paidAt)!, note: p.note,
        })),
      });
      await tx.transaction.createMany({
        data: transactions.map((t) => ({
          id: t.id!, userId, type: t.type as never, amount: t.amount!, currency: t.currency as never, accountId: t.accountId!,
          categoryId: t.categoryId, occurredAt: d(t.occurredAt)!, source: t.source, purpose: t.purpose,
          paymentMethod: (t.paymentMethod as never) ?? null, note: t.note, transferId: t.transferId, debtId: t.debtId,
          debtPaymentId: t.debtPaymentId,
        })),
      });
      if (rates.length) {
        await tx.exchangeRate.createMany({ data: rates.map((r) => ({ userId, currency: r.currency as never, rate: r.rate! })) });
      }
      if (info.baseCurrency) {
        await tx.user.update({ where: { id: userId }, data: { baseCurrency: info.baseCurrency as never } });
      }
    },
    { timeout: 120_000 },
  );
  return { accounts: accounts.length, transactions: transactions.length, debts: debts.length, payments: payments.length };
}
