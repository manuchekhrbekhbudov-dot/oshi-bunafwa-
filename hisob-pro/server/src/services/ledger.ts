import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { computeBalances, type LedgerRow, type TxTypeCode } from './calc.js';
import type { Decimal } from '../lib/money.js';

/** Ҳамаи амалиётҳои истифодабаранда дар фосилаи [from, to) */
export async function loadLedgerRows(
  userId: string,
  from: Date,
  to: Date,
  extra: Prisma.TransactionWhereInput = {},
): Promise<LedgerRow[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, occurredAt: { gte: from, lt: to }, ...extra },
    select: {
      type: true,
      amount: true,
      currency: true,
      occurredAt: true,
      categoryId: true,
      category: { select: { name: true, color: true } },
    },
    orderBy: { occurredAt: 'asc' },
  });
  return rows.map((r) => ({
    type: r.type as TxTypeCode,
    amount: r.amount,
    currency: r.currency,
    occurredAt: r.occurredAt,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    categoryColor: r.category?.color ?? null,
  }));
}

/**
 * Баланси ҳисобҳо. Агар `before` дода шавад — баланс то он лаҳза (exclusive).
 * Ҷамъбаст дар сатҳи база бо groupBy (Decimal) иҷро мешавад.
 */
export async function accountBalances(userId: string, before?: Date, includeArchived = true) {
  const accounts = await prisma.account.findMany({
    where: { userId, ...(includeArchived ? {} : { archived: false }) },
    orderBy: [{ archived: 'asc' }, { createdAt: 'asc' }],
  });
  const grouped = await prisma.transaction.groupBy({
    by: ['accountId', 'type'],
    where: { userId, ...(before ? { occurredAt: { lt: before } } : {}) },
    _sum: { amount: true },
  });
  const balances: Map<string, Decimal> = computeBalances(
    accounts,
    grouped.map((g) => ({ accountId: g.accountId, type: g.type as TxTypeCode, amount: g._sum.amount ?? 0 })),
  );
  return { accounts, balances };
}
