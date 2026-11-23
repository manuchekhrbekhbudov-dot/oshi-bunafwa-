import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Decimal from 'decimal.js';
import { Plus, Search, Hash, Sigma, TrendingUp, TrendingDown } from 'lucide-react';
import { useI18n } from '../i18n';
import { useCategories, usePeriod, useTransactions, useFinanceMutation, useAccounts } from '../hooks/queries';
import { Card, CardHeader, EmptyState, ErrorState, MissingRatesNote, PageHeader, Pagination, Segmented, Skeleton } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Field';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { TxTable } from '../components/TxTable';
import { TransactionFormModal } from '../components/forms/TransactionForm';
import { CategoryBars, CategoryDonut } from '../components/charts/Charts';
import { api } from '../lib/api';
import { monthStart, shiftDay, todayKey } from '../lib/dates';
import { formatMoney } from '../lib/format';
import type { Transaction } from '../lib/types';
import { useDebounced } from '../hooks/useDebounced';

type Preset = 'month' | 'last30' | 'year' | 'custom';

export function presetRange(preset: Preset, custom: { from: string; to: string }) {
  const today = todayKey();
  if (preset === 'month') return { from: monthStart(today), to: today };
  if (preset === 'last30') return { from: shiftDay(today, -29), to: today };
  if (preset === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return custom;
}

export default function KindPage({ kind }: { kind: 'INCOME' | 'EXPENSE' }) {
  const { t } = useI18n();
  const toast = useToast();
  const isIncome = kind === 'INCOME';
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState({ from: monthStart(todayKey()), to: todayKey() });
  const range = presetRange(preset, custom);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  const cats = useCategories(kind);
  const accounts = useAccounts();
  const report = usePeriod(range);
  const list = useTransactions({ type: kind, q: dq || undefined, categoryId: categoryId || undefined, accountId: accountId || undefined, from: range.from, to: range.to, page, pageSize: 15 });
  const del = useFinanceMutation((id: string) => api.del(`/transactions/${id}`));

  const s = report.data?.summary;
  const base = s?.viewCurrency ?? 'TJS';
  const total = s ? (isIncome ? s.income : s.expense) : '0';
  const count = s ? (isIncome ? s.incomeCount : s.expenseCount) : 0;
  const avg = useMemo(() => (count ? new Decimal(total).div(count).toFixed(2) : '0.00'), [total, count]);
  const byCat = (isIncome ? report.data?.incomeByCategory : report.data?.expenseByCategory) ?? [];

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  // Аз нишонаи барнома дар телефон: "Хароҷоти нав" → /expenses?new=1 → форма фавран кушода мешавад
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new') === '1') {
      openNew();
      params.delete('new');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isIncome ? t('nav_income') : t('nav_expenses')}
        subtitle={`${range.from} — ${range.to}`}
        actions={
          <Button onClick={openNew} icon={<Plus className="h-4 w-4" />} variant={isIncome ? 'success' : 'primary'}>
            {isIncome ? t('newIncome') : t('newExpense')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={preset}
          onChange={(v) => {
            setPreset(v);
            setPage(1);
          }}
          options={[
            { value: 'month', label: t('periodThisMonth') },
            { value: 'last30', label: t('periodLast30') },
            { value: 'year', label: t('periodThisYear') },
            { value: 'custom', label: t('periodCustom') },
          ]}
        />
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-9 w-auto" />
            <span className="text-slate-400">—</span>
            <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-9 w-auto" />
          </div>
        )}
      </div>

      {s && <MissingRatesNote currencies={s.missingRates} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {[
          { l: isIncome ? t('incomeTotal') : t('expenseTotal'), v: formatMoney(total, base), i: isIncome ? TrendingUp : TrendingDown, c: isIncome ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10' },
          { l: t('countOps'), v: String(count), i: Hash, c: 'text-blue-500 bg-blue-500/10' },
          { l: t('average'), v: formatMoney(avg, base), i: Sigma, c: 'text-brand-500 bg-brand-500/10' },
        ].map((x, i) =>
          report.isLoading ? (
            <Skeleton key={i} className={i === 0 ? 'col-span-2 h-24 sm:col-span-1' : 'h-24'} />
          ) : (
            <div
              key={i}
              className={`card flex animate-fade-up items-center gap-3 p-4 sm:gap-4 sm:p-5 ${i === 0 ? 'col-span-2 sm:col-span-1' : ''}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className={`${i === 0 ? 'grid' : 'hidden sm:grid'} h-11 w-11 shrink-0 place-items-center rounded-xl ${x.c}`}>
                <x.i className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">{x.l}</p>
                <p className="num break-words text-lg font-extrabold leading-tight sm:text-xl">{x.v}</p>
              </div>
            </div>
          ),
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex flex-col gap-3 p-4 sm:flex-row">
            <div className="flex-1">
              <Input placeholder={t('search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} leading={<Search className="h-4 w-4" />} />
            </div>
            <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} className="sm:w-44">
              <option value="">{t('category')}: {t('all')}</option>
              {cats.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); setPage(1); }} className="sm:w-44">
              <option value="">{t('account')}: {t('all')}</option>
              {accounts.data?.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          {list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : !list.data ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : list.data.items.length === 0 ? (
            <EmptyState action={<Button size="sm" onClick={openNew} icon={<Plus className="h-4 w-4" />}>{t('add')}</Button>} />
          ) : (
            <>
              <TxTable items={list.data.items} onEdit={(tx) => { setEditing(tx); setFormOpen(true); }} onDelete={setDeleting} />
              <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={setPage} />
            </>
          )}
        </Card>
        <Card>
          <CardHeader title={t('byCategory')} subtitle={base} />
          <div className="p-5">
            {byCat.length ? (
              <>
                <CategoryDonut data={byCat} currency={base} height={180} />
                <div className="mt-4"><CategoryBars data={byCat} currency={base} /></div>
              </>
            ) : (
              <EmptyState />
            )}
          </div>
        </Card>
      </div>

      <TransactionFormModal open={formOpen} kind={kind} initial={editing} onClose={() => setFormOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        loading={del.isPending}
        text={deleting ? `${formatMoney(deleting.amount, deleting.currency)} · ${deleting.category?.name ?? ''} — ${t('confirmDeleteText')}` : undefined}
        onConfirm={async () => {
          try {
            await del.mutateAsync(deleting!.id);
            toast(t('deleted'));
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), 'error');
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}
