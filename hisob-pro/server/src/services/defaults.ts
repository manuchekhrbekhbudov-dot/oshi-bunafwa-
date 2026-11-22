import type { Prisma } from '@prisma/client';

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Маош', color: '#22c55e', icon: 'briefcase' },
  { name: 'Савдо', color: '#3b82f6', icon: 'shopping-bag' },
  { name: 'Хизматрасонӣ', color: '#8b5cf6', icon: 'wrench' },
  { name: 'Тиҷорат', color: '#06b6d4', icon: 'building-2' },
  { name: 'Дигар', color: '#64748b', icon: 'circle' },
];

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Хӯрок', color: '#f97316', icon: 'utensils' },
  { name: 'Нақлиёт', color: '#3b82f6', icon: 'car' },
  { name: 'Иҷора', color: '#a855f7', icon: 'home' },
  { name: 'Интернет', color: '#06b6d4', icon: 'wifi' },
  { name: 'Маоши кормандон', color: '#22c55e', icon: 'users' },
  { name: 'Мол', color: '#eab308', icon: 'package' },
  { name: 'Хизматрасонӣ', color: '#ec4899', icon: 'wrench' },
  { name: 'Дигар', color: '#64748b', icon: 'circle' },
];

export async function createUserDefaults(tx: Prisma.TransactionClient, userId: string) {
  await tx.category.createMany({
    data: [
      ...DEFAULT_INCOME_CATEGORIES.map((c) => ({ ...c, userId, kind: 'INCOME' as const, isSystem: true })),
      ...DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ ...c, userId, kind: 'EXPENSE' as const, isSystem: true })),
    ],
  });
  await tx.account.create({
    data: { userId, name: 'Пули нақд', type: 'CASH', currency: 'TJS', color: '#22c55e' },
  });
}
