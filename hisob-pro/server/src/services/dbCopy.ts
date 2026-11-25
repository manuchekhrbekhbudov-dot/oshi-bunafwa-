/**
 * Кӯчонидани ҳамаи маълумот аз базаи кӯҳна (Render) ба базаи нав (масалан Neon).
 *
 * Чӣ тавр: дар Render → Environment
 *   DATABASE_URL     = суроғаи базаи НАВ
 *   OLD_DATABASE_URL = суроғаи базаи КӮҲНА
 * Ҳангоми оғози сервер, агар базаи нав холӣ бошад, ҳама ҷадвалҳо бо ҳамон id-ҳо нусха мешаванд.
 * Маълумот бо SQL-и оддӣ хонда мешавад — сутунҳои нав (ки дар базаи кӯҳна нестанд) қимати пешфарз мегиранд.
 */
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { cleanDatabaseUrl } from '../lib/dbUrl.js';

/** Тартиб муҳим аст: аввал ҷадвалҳое, ки дигарон ба онҳо ишора мекунанд */
const TABLES: { table: string; model: string; batch?: number }[] = [
  { table: 'User', model: 'user' },
  { table: 'Session', model: 'session' },
  { table: 'AppSetting', model: 'appSetting' },
  { table: 'Account', model: 'account' },
  { table: 'Category', model: 'category' },
  { table: 'ExchangeRate', model: 'exchangeRate' },
  { table: 'Transfer', model: 'transfer' },
  { table: 'Debt', model: 'debt' },
  { table: 'DebtPayment', model: 'debtPayment' },
  { table: 'Transaction', model: 'transaction' },
  { table: 'TransactionPhoto', model: 'transactionPhoto', batch: 20 },
  { table: 'TelegramLink', model: 'telegramLink' },
  { table: 'Routine', model: 'routine' },
  { table: 'Goal', model: 'goal' },
  { table: 'GoalContribution', model: 'goalContribution' },
  { table: 'RecurringPayment', model: 'recurringPayment' },
];

type Delegate = { createMany: (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<{ count: number }> };

export async function copyFromOldDatabase(oldUrl: string, target: PrismaClient = prisma) {
  if ((await target.user.count()) > 0) {
    console.log('[db-copy] базаи нав холӣ нест — кӯчонидан лозим нест');
    return { copied: false as const };
  }
  const old = new PrismaClient({ datasources: { db: { url: cleanDatabaseUrl(oldUrl)! } } });
  const counts: Record<string, number> = {};
  try {
    for (const { table, model, batch = 500 } of TABLES) {
      let rows: Record<string, unknown>[];
      try {
        rows = await old.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${table}"`);
      } catch {
        counts[table] = -1; // дар базаи кӯҳна ин ҷадвал нест
        continue;
      }
      const delegate = (target as unknown as Record<string, Delegate>)[model];
      let n = 0;
      for (let i = 0; i < rows.length; i += batch) {
        n += (await delegate.createMany({ data: rows.slice(i, i + batch), skipDuplicates: true })).count;
      }
      counts[table] = n;
    }
  } finally {
    await old.$disconnect();
  }
  console.log('[db-copy] маълумот кӯчонида шуд:', JSON.stringify(counts));
  return { copied: true as const, counts };
}
