import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  HandCoins,
  Landmark,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
  CreditCard,
  Banknote,
  Smartphone,
  AlertTriangle,
} from 'lucide-react';
import { useDashboard } from '../hooks/queries';
import { useI18n } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { Card, CardHeader, ErrorState, MissingRatesNote, Money, Segmented, Skeleton, EmptyState } from '../components/ui/misc';
import { IncomeExpenseArea, CategoryBars, CategoryDonut } from '../components/charts/Charts';
import { TxTable } from '../components/TxTable';
import { formatDay, greeting } from '../lib/dates';
import { formatMoney, isNegative } from '../lib/format';
import { useQuickAdd } from '../components/layout/QuickAdd';
import { InstallBanner } from '../components/InstallApp';
import type { AccountType } from '../lib/types';

export const ACCOUNT_ICON: Record<AccountType, typeof Wallet> = {
  CASH: Banknote,
  CARD: CreditCard,
  BANK: Landmark,
  EWALLET: Smartphone,
};

function StatCard({
  label,
  value,
  currency,
  icon: Icon,
  tone,
  sub,
  delay = 0,
  big,
  wide,
}: {
  label: string;
  value: string;
  currency: 'TJS' | 'USD' | 'RUB';
  icon: typeof Wallet;
  tone: 'green' | 'red' | 'violet' | 'blue';
  sub?: React.ReactNode;
  delay?: number;
  big?: boolean;
  /** Дар телефон тамоми сатрро мегирад */
  wide?: boolean;
}) {
  const tones = {
    green: 'from-emerald-500/20 to-emerald-500/0 text-emerald-500',
    red: 'from-rose-500/20 to-rose-500/0 text-rose-500',
    violet: 'from-brand-500/25 to-brand-500/0 text-brand-500',
    blue: 'from-blue-500/20 to-blue-500/0 text-blue-500',
  };
  return (
    <div
      className={clsx('card relative animate-fade-up overflow-hidden p-4 sm:p-5', big && 'col-span-2', wide && 'col-span-2 sm:col-span-1')}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={clsx('pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br blur-2xl', tones[tone])} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p
            className={clsx(
              'num mt-2 break-words font-extrabold leading-tight tracking-tight',
              big ? 'text-3xl sm:text-4xl' : 'text-lg sm:text-xl xl:text-lg 2xl:text-2xl',
              isNegative(value) && 'text-rose-500',
            )}
          >
            {formatMoney(value, currency)}
          </p>
          {sub && <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
        </div>
        <span className={clsx('hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br sm:grid', tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const quick = useQuickAdd();
  const q = useDashboard();
  const [range, setRange] = useState<'days7' | 'days30' | 'months12'>('days30');

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const base = d?.base ?? 'TJS';
  const missing = d ? [...new Set([...d.balance.missingRates, ...d.monthSummary.missingRates])] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="animate-fade-up">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {greeting(lang)}, <b className="text-slate-800 dark:text-slate-200">{user?.name}</b> 👋
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{t('nav_dashboard')}</h1>
          {d && <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{formatDay(d.today, lang, true)}</p>}
        </div>
        <div className="hidden gap-2 lg:flex">
          <button onClick={() => quick('INCOME')} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400">
            <ArrowDownLeft className="h-4 w-4" /> {t('quickIncome')}
          </button>
          <button onClick={() => quick('EXPENSE')} className="flex items-center justify-center gap-2 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-400">
            <ArrowUpRight className="h-4 w-4" /> {t('quickExpense')}
          </button>
          <button onClick={() => quick('TRANSFER')} className="flex items-center justify-center gap-2 rounded-xl bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:text-blue-400">
            <ArrowLeftRight className="h-4 w-4" /> {t('quickTransfer')}
          </button>
        </div>
      </div>

      <InstallBanner />
      <MissingRatesNote currencies={missing} />

      {!d ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[118px]" />
          ))}
        </div>
      ) : (
        <>
          {/* Hero balance + today */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <div className="relative animate-fade-up overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-blue-600 p-6 text-white shadow-glow col-span-2">
              <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-emerald-400/20 blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white/80">{t('totalBalance')}</p>
                  <PiggyBank className="h-6 w-6 text-white/80" />
                </div>
                <p className="num mt-3 text-4xl font-black tracking-tight sm:text-5xl">{formatMoney(d.balance.total, base)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(d.balance.byCurrency).map(([c, v]) => (
                    <span key={c} className="num rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold backdrop-blur">
                      {formatMoney(v!, c as 'TJS')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <StatCard label={t('todayIncome')} value={d.todaySummary.income} currency={base} icon={TrendingUp} tone="green" delay={60} sub={`${d.todaySummary.incomeCount} ${t('operations')}`} />
            <StatCard label={t('todayExpense')} value={d.todaySummary.expense} currency={base} icon={TrendingDown} tone="red" delay={120} sub={`${d.todaySummary.expenseCount} ${t('operations')}`} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label={t('todayNet')} value={d.todaySummary.net} currency={base} icon={Wallet} tone="violet" delay={160} wide />
            <StatCard label={t('monthIncome')} value={d.monthSummary.income} currency={base} icon={ArrowDownLeft} tone="green" delay={200} sub={`${d.monthSummary.incomeCount} ${t('operations')}`} />
            <StatCard label={t('monthExpense')} value={d.monthSummary.expense} currency={base} icon={ArrowUpRight} tone="red" delay={240} sub={`${d.monthSummary.expenseCount} ${t('operations')}`} />
            <StatCard
              label={t('debtsBlock')}
              value={d.debts.net}
              currency={base}
              icon={HandCoins}
              tone="blue"
              delay={280}
              wide
              sub={
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  <span>{t('debtsLent')}: <b className="num text-emerald-500">{formatMoney(d.debts.lent.remaining, base)}</b></span>
                  <span>{t('debtsBorrowed')}: <b className="num text-rose-500">{formatMoney(d.debts.borrowed.remaining, base)}</b></span>
                  {d.debts.overdue > 0 && (
                    <span className="flex items-center gap-1 text-amber-500"><AlertTriangle className="h-3 w-3" />{d.debts.overdue} {t('overdueCount')}</span>
                  )}
                </span>
              }
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title={t('chartTitle')}
                subtitle={base}
                action={
                  <Segmented
                    value={range}
                    onChange={setRange}
                    options={[
                      { value: 'days7', label: t('d7') },
                      { value: 'days30', label: t('d30') },
                      { value: 'months12', label: t('m12') },
                    ]}
                  />
                }
              />
              <div className="px-2 pb-4 pt-2">
                <IncomeExpenseArea series={d.charts[range]} currency={base} />
              </div>
            </Card>

            <Card>
              <CardHeader title={t('topExpenses')} subtitle={t('thisMonth')} />
              <div className="p-5">
                {d.monthExpenseByCategory.length ? (
                  <>
                    <CategoryDonut data={d.monthExpenseByCategory} currency={base} height={180} />
                    <div className="mt-4">
                      <CategoryBars data={d.monthExpenseByCategory.slice(0, 5)} currency={base} />
                    </div>
                  </>
                ) : (
                  <EmptyState />
                )}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader
                title={t('accountsBalance')}
                action={
                  <Link to="/accounts" className="text-xs font-semibold text-brand-500 hover:underline">
                    {t('seeAll')}
                  </Link>
                }
              />
              <ul className="space-y-2 p-5">
                {d.accounts.map((a) => {
                  const Icon = ACCOUNT_ICON[a.type];
                  return (
                    <li key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-white/[0.05]">
                      <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${a.color}22`, color: a.color }}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{a.name}</p>
                        <p className="text-xs text-slate-500">{t(`acc_${a.type}`)}</p>
                      </div>
                      <Money value={a.balance} currency={a.currency} className={clsx('text-sm font-bold', isNegative(a.balance) && 'text-rose-500')} />
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader
                title={t('recent')}
                action={
                  <Link to="/history" className="text-xs font-semibold text-brand-500 hover:underline">
                    {t('seeAll')}
                  </Link>
                }
              />
              <div className="mt-3">{d.recent.length ? <TxTable items={d.recent} compact /> : <EmptyState />}</div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
