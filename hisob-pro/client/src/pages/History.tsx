import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Search, SlidersHorizontal, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAccounts, useCategories, useFinanceMutation, useTransactions } from '../hooks/queries';
import { Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/Field';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { TxTable } from '../components/TxTable';
import { TransactionFormModal } from '../components/forms/TransactionForm';
import { api, download } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { Transaction } from '../lib/types';
import { useDebounced } from '../hooks/useDebounced';

const EMPTY = { type: 'ALL', categoryId: '', accountId: '', currency: '', paymentMethod: '', from: '', to: '', minAmount: '', maxAmount: '' };

export default function HistoryPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [f, setF] = useState(EMPTY);
  const [sort, setSort] = useState('occurredAt:desc');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const cats = useCategories();
  const accounts = useAccounts();
  const [sortField, order] = sort.split(':');
  const query = { ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), q: dq || undefined, sort: sortField, order };
  const list = useTransactions({ ...query, page, pageSize: 20 });
  const del = useFinanceMutation((id: string) => api.del(`/transactions/${id}`));

  const set = (k: keyof typeof EMPTY, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setPage(1);
  };
  const activeFilters = Object.entries(f).filter(([k, v]) => v && !(k === 'type' && v === 'ALL')).length;

  const doExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      await download('/reports/transactions/export', { ...query, format });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setExporting(null);
    }
  };

  const catOptions = cats.data?.filter((c) => (f.type === 'INCOME' ? c.kind === 'INCOME' : f.type === 'EXPENSE' ? c.kind === 'EXPENSE' : true));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('historyTitle')}
        actions={
          <>
            <Button variant="secondary" size="sm" loading={exporting === 'pdf'} icon={<FileText className="h-4 w-4" />} onClick={() => doExport('pdf')}>PDF</Button>
            <Button variant="secondary" size="sm" loading={exporting === 'xlsx'} icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => doExport('xlsx')}>Excel</Button>
            <Button variant="secondary" size="sm" loading={exporting === 'csv'} icon={<Download className="h-4 w-4" />} onClick={() => doExport('csv')}>CSV</Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="flex-1">
            <Input placeholder={t('search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} leading={<Search className="h-4 w-4" />} />
          </div>
          <Select value={f.type} onChange={(e) => { set('type', e.target.value); set('categoryId', ''); }} className="lg:w-44">
            <option value="ALL">{t('type')}: {t('all')}</option>
            <option value="INCOME">{t('tx_INCOME')}</option>
            <option value="EXPENSE">{t('tx_EXPENSE')}</option>
            <option value="TRANSFER">{t('f_TRANSFER')}</option>
            <option value="DEBT">{t('f_DEBT')}</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="lg:w-44">
            <option value="occurredAt:desc">{t('sortNewest')}</option>
            <option value="occurredAt:asc">{t('sortOldest')}</option>
            <option value="amount:desc">{t('sortAmountDesc')}</option>
            <option value="amount:asc">{t('sortAmountAsc')}</option>
          </Select>
          <Button variant="secondary" onClick={() => setShowFilters((s) => !s)} icon={<SlidersHorizontal className="h-4 w-4" />}>
            {t('filters')}
            {activeFilters > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] text-white">{activeFilters}</span>}
          </Button>
        </div>
        {showFilters && (
          <div className="grid animate-fade-in gap-3 border-t border-slate-100 p-4 dark:border-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('category')}>
              <Select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">{t('all')}</option>
                {catOptions?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({t(`tx_${c.kind}`)})</option>
                ))}
              </Select>
            </Field>
            <Field label={t('account')}>
              <Select value={f.accountId} onChange={(e) => set('accountId', e.target.value)}>
                <option value="">{t('all')}</option>
                {accounts.data?.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('currency')}>
              <Select value={f.currency} onChange={(e) => set('currency', e.target.value)}>
                <option value="">{t('all')}</option>
                <option value="TJS">TJS</option>
                <option value="USD">USD</option>
                <option value="RUB">RUB</option>
              </Select>
            </Field>
            <Field label={t('paymentMethod')}>
              <Select value={f.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
                <option value="">{t('all')}</option>
                <option value="CASH">{t('pm_CASH')}</option>
                <option value="CARD">{t('pm_CARD')}</option>
                <option value="BANK">{t('pm_BANK')}</option>
              </Select>
            </Field>
            <Field label={t('from')}>
              <Input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />
            </Field>
            <Field label={t('to')}>
              <Input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />
            </Field>
            <Field label={t('minAmount')}>
              <Input inputMode="decimal" value={f.minAmount} onChange={(e) => set('minAmount', e.target.value)} />
            </Field>
            <Field label={t('maxAmount')}>
              <Input inputMode="decimal" value={f.maxAmount} onChange={(e) => set('maxAmount', e.target.value)} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button variant="ghost" size="sm" icon={<X className="h-4 w-4" />} onClick={() => { setF(EMPTY); setPage(1); }}>
                {t('reset')}
              </Button>
            </div>
          </div>
        )}
        <div className="border-t border-slate-100 dark:border-white/[0.06]">
          {list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : !list.data ? (
            <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : list.data.items.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <TxTable items={list.data.items} onEdit={(tx) => setEditing(tx)} onDelete={setDeleting} />
              <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={setPage} />
            </>
          )}
        </div>
      </Card>
      <p className="text-center text-xs text-slate-500">{t('debtEditHint')}</p>

      <TransactionFormModal
        open={!!editing}
        kind={editing?.type === 'EXPENSE' ? 'EXPENSE' : 'INCOME'}
        initial={editing}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        loading={del.isPending}
        text={
          deleting
            ? `${t(`tx_${deleting.type}`)} · ${formatMoney(deleting.amount, deleting.currency)}. ${deleting.transferId ? t('transferDeleteNote') + ' ' : ''}${t('confirmDeleteText')}`
            : undefined
        }
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
