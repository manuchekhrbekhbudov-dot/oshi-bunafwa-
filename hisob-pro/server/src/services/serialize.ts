import { money } from '../lib/money.js';
import type { Account, Category, Transaction } from '@prisma/client';
import type { Decimal } from '../lib/money.js';

export function serializeAccount(a: Account, balance?: Decimal) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    color: a.color,
    archived: a.archived,
    initialBalance: money(a.initialBalance),
    balance: money(balance ?? a.initialBalance),
    createdAt: a.createdAt,
  };
}

export function serializeCategory(c: Category) {
  return { id: c.id, name: c.name, kind: c.kind, color: c.color, icon: c.icon, isSystem: c.isSystem };
}

type TxWithRels = Transaction & {
  account?: { id: string; name: string; type: string; color: string } | null;
  category?: { id: string; name: string; color: string; icon: string } | null;
  debt?: { id: string; counterparty: string; direction: string } | null;
  transfer?: { fromAccountId: string; toAccountId: string } | null;
};

export function serializeTx(t: TxWithRels) {
  return {
    id: t.id,
    type: t.type,
    amount: money(t.amount),
    currency: t.currency,
    occurredAt: t.occurredAt,
    accountId: t.accountId,
    account: t.account ? { id: t.account.id, name: t.account.name, type: t.account.type, color: t.account.color } : null,
    categoryId: t.categoryId,
    category: t.category
      ? { id: t.category.id, name: t.category.name, color: t.category.color, icon: t.category.icon }
      : null,
    source: t.source,
    purpose: t.purpose,
    paymentMethod: t.paymentMethod,
    note: t.note,
    transferId: t.transferId,
    debtId: t.debtId,
    debtPaymentId: t.debtPaymentId,
    debt: t.debt ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export const txInclude = {
  account: { select: { id: true, name: true, type: true, color: true } },
  category: { select: { id: true, name: true, color: true, icon: true } },
  debt: { select: { id: true, counterparty: true, direction: true } },
} as const;
