import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  Account,
  Category,
  CategoryKind,
  DailyReport,
  Dashboard,
  Debt,
  DebtSummary,
  Paged,
  PeriodReport,
  RatesInfo,
  TotalBalance,
  Transaction,
  Transfer,
} from '../lib/types';

type Q = Record<string, string | number | undefined>;

/**
 * Пас аз ҳар тағйир ҳамаи маълумоти молиявӣ нав карда мешавад —
 * dashboard, балансҳо ва ҳисоботҳо фавран рақамҳои навро нишон медиҳанд.
 */
export function useInvalidateFinance() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ['dashboard', 'accounts', 'transactions', 'reports', 'debts', 'transfers', 'budgets', 'advice', 'recurring'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );
}

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/reports/dashboard') });

export const useAccounts = () =>
  useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<{ accounts: Account[]; total: TotalBalance }>('/accounts'),
  });

export const useCategories = (kind?: CategoryKind) =>
  useQuery({
    queryKey: ['categories', kind ?? 'all'],
    queryFn: async () => (await api.get<{ categories: Category[] }>('/categories', { kind })).categories,
    staleTime: 60_000,
  });

export const useTransactions = (q: Q) =>
  useQuery({
    queryKey: ['transactions', q],
    queryFn: () => api.get<Paged<Transaction>>('/transactions', q),
    placeholderData: keepPreviousData,
  });

export const useDaily = (date: string, currency?: string) =>
  useQuery({
    queryKey: ['reports', 'daily', date, currency],
    queryFn: () => api.get<DailyReport>('/reports/daily', { date, currency }),
    placeholderData: keepPreviousData,
  });

export const usePeriod = (q: { from: string; to: string; granularity?: string; currency?: string }) =>
  useQuery({
    queryKey: ['reports', 'period', q],
    queryFn: () => api.get<PeriodReport>('/reports/period', q),
    placeholderData: keepPreviousData,
  });

export const useDebts = (q: Q) =>
  useQuery({
    queryKey: ['debts', 'list', q],
    queryFn: async () => (await api.get<{ debts: Debt[] }>('/debts', q)).debts,
    placeholderData: keepPreviousData,
  });

export const useDebtSummary = () =>
  useQuery({ queryKey: ['debts', 'summary'], queryFn: () => api.get<DebtSummary>('/debts/summary') });

export const useTransfers = () =>
  useQuery({
    queryKey: ['transfers'],
    queryFn: async () => (await api.get<{ transfers: Transfer[] }>('/transfers')).transfers,
  });

export const useRates = () =>
  useQuery({ queryKey: ['rates'], queryFn: () => api.get<RatesInfo>('/rates') });

/** Мутатсияи умумӣ, ки баъди муваффақият маълумотро нав мекунад */
export function useFinanceMutation<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, extraKeys: string[][] = []) {
  const invalidate = useInvalidateFinance();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await invalidate();
      await Promise.all(extraKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
    },
  });
}
