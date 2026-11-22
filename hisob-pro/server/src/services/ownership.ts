import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import type { CategoryKind } from '@prisma/client';

/** Санҷиши моликият: ҳар истифодабаранда танҳо ба сабтҳои худ дастрасӣ дорад */
export async function ownAccount(userId: string, id: string, opts: { allowArchived?: boolean } = {}) {
  const a = await prisma.account.findFirst({ where: { id, userId } });
  if (!a) throw notFound('Ҳисоб ёфт нашуд');
  if (a.archived && !opts.allowArchived) throw badRequest('ACCOUNT_ARCHIVED', 'Ҳисоб бойгонӣ шудааст');
  return a;
}

export async function ownCategory(userId: string, id: string, kind: CategoryKind) {
  const c = await prisma.category.findFirst({ where: { id, userId } });
  if (!c) throw notFound('Категория ёфт нашуд');
  if (c.kind !== kind) throw badRequest('CATEGORY_KIND', 'Категория ба намуди амалиёт мувофиқ нест');
  return c;
}
