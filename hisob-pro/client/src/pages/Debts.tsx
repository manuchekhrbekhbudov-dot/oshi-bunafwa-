import { useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, ChevronDown, HandCoins, Pencil, Phone, Plus, Search, Trash2, Wallet } from 'lucide-react';
import { useI18n } from '../i18n';
import { useDebts, useDebtSummary, useFinanceMutation } from '../hooks/queries';
import { Badge, Card, EmptyState, ErrorState, MissingRatesNote, PageHeader, Segmented, Skeleton } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Field';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { DebtFormModal, PaymentFormModal } from '../components/forms/DebtForm';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { formatDate, formatDateTime } from '../lib/dates';
import type { Debt, DebtStatus } from '../lib/types';
import { useDebounced } from '../hooks/useDebounced';

const STATUS_COLOR: Record<DebtStatus, 'blue' | 'amber' | 'green' | 'red'> = {
  ACTIVE: 'blue',
  PARTIAL: 'amber',
  PAID: 'green',
  OVERDUE: 'red',
};

export default function DebtsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [direction, setDirection] = useState<'' | 'LENT' | 'BORROWED'>('');
  const [status, setStatus] = useState('OPEN');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const list = useDebts({ direction: direction || undefined, status: status || undefined, q: dq || undefined });
  const summary = useDebtSummary();
  const [form, setForm] = useState<{ open: boolean; initial: Debt | null }>({ open: false, initial: null });
  const [paying, setPaying] = useState<Debt | null>(null);
  const [deleting, setDeleting] = useState<Debt | null>(null);
  const [delPay, setDelPay] = useState<{ debt: Debt; id: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const del = useFinanceMutation((id: string) => api.del(`/debts/${id}`));
  const delPayment = useFinanceMutation((v: { debt: Debt; id: string }) => api.del(`/debts/${v.debt.id}/payments/${v.id}`));

  const s = summary.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('debtsTitle')}
        subtitle={t('debtNote')}
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ open: true, initial: null })}>{t('newDebt')}</Button>}
      />

      {s && <MissingRatesNote currencies={s.missingRates} />}
      <div className="grid gap-4 sm:grid-cols-3">
        {!s ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <div className="card animate-fade-up p-5">
              <p className="text-xs text-slate-500">{t('debtsLent')} · {s.lent.count}</p>
              <p className="num mt-1 text-2xl font-extrabold text-emerald-500">{formatMoney(s.lent.remaining, s.base)}</p>
            </div>
            <div className="card animate-fade-up p-5" style={{ animationDelay: '60ms' }}>
              <p className="text-xs text-slate-500">{t('debtsBorrowed')} · {s.borrowed.count}</p>
              <p className="num mt-1 text-2xl font-extrabold text-rose-500">{formatMoney(s.borrowed.remaining, s.base)}</p>
            </div>
            <div className="card animate-fade-up p-5" style={{ animationDelay: '120ms' }}>
              <p className="text-xs text-slate-500">{t('st_OVERDUE')}</p>
              <p className={clsx('mt-1 flex items-center gap-2 text-2xl font-extrabold', s.overdue ? 'text-amber-500' : '')}>
                {s.overdue > 0 && <AlertTriangle className="h-5 w-5" />}
                {s.overdue}
              </p>
            </div>
          </>
        )}
      </div>

      <Card>
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <Segmented
            value={direction}
            onChange={setDirection}
            options={[
              { value: '', label: t('all') },
              { value: 'LENT', label: t('dir_LENT') },
              { value: 'BORROWED', label: t('dir_BORROWED') },
            ]}
          />
          <div className="flex-1">
            <Input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="h-4 w-4" />} />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="lg:w-52">
            <option value="">{t('status')}: {t('all')}</option>
            <option value="OPEN">{t('st_OPEN')}</option>
            {(['ACTIVE', 'PARTIAL', 'PAID', 'OVERDUE'] as const).map((x) => (
              <option key={x} value={x}>{t(`st_${x}`)}</option>
            ))}
          </Select>
        </div>
      </Card>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : list.data.length === 0 ? (
        <Card><EmptyState icon={<HandCoins className="h-6 w-6" />} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.data.map((d, i) => (
            <div key={d.id} className="card animate-fade-up overflow-hidden" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold', d.direction === 'LENT' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500')}>
                      {d.counterparty.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold">{d.counterparty}</p>
                      <p className="text-xs text-slate-500">{t(`dir_${d.direction}`)} · {formatDate(d.issuedAt)}</p>
                    </div>
                  </div>
                  <Badge color={STATUS_COLOR[d.status]}>{t(`st_${d.status}`)}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/[0.03]">
                    <p className="text-[10px] uppercase text-slate-500">{t('amount')}</p>
                    <p className="num text-sm font-bold">{formatMoney(d.amount, d.currency)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/[0.03]">
                    <p className="text-[10px] uppercase text-slate-500">{t('paid')}</p>
                    <p className="num text-sm font-bold text-emerald-500">{formatMoney(d.paid, d.currency)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/[0.03]">
                    <p className="text-[10px] uppercase text-slate-500">{t('remaining')}</p>
                    <p className="num text-sm font-bold text-rose-500">{formatMoney(d.remaining, d.currency)}</p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-700" style={{ width: `${d.progress}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {d.dueDate && (
                    <span className={clsx('flex items-center gap-1', d.status === 'OVERDUE' && 'font-semibold text-rose-500')}>
                      <CalendarClock className="h-3.5 w-3.5" /> {t('dueDate')}: {formatDate(d.dueDate)}
                    </span>
                  )}
                  {d.phone && <a href={`tel:${d.phone}`} className="flex items-center gap-1 hover:text-brand-500"><Phone className="h-3.5 w-3.5" /> {d.phone}</a>}
                  {d.accountName && <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> {d.accountName}</span>}
                </div>
                {d.note && <p className="mt-2 text-xs text-slate-500">{d.note}</p>}
              </div>
              <div className="flex items-center gap-1 border-t border-slate-100 px-3 py-2 dark:border-white/[0.06]">
                {d.status !== 'PAID' && (
                  <Button size="sm" variant="success" onClick={() => setPaying(d)} icon={<Plus className="h-3.5 w-3.5" />}>{t('addPayment')}</Button>
                )}
                <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.05]">
                  {t('payments')} ({d.payments.length})
                  <ChevronDown className={clsx('h-3.5 w-3.5 transition', expanded === d.id && 'rotate-180')} />
                </button>
                <div className="ml-auto flex gap-1">
                  <button onClick={() => setForm({ open: true, initial: d })} className="rounded-lg p-2 text-slate-400 hover:bg-brand-500/10 hover:text-brand-500"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => setDeleting(d)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {expanded === d.id && (
                <div className="animate-fade-in border-t border-slate-100 bg-slate-50/50 px-5 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  {d.payments.length === 0 ? (
                    <p className="py-2 text-center text-xs text-slate-500">{t('noPayments')}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {d.payments.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-xs text-slate-500">{formatDateTime(p.paidAt)}{p.note ? ` · ${p.note}` : ''}</span>
                          <span className="flex items-center gap-2">
                            <b className="num">{formatMoney(p.amount, d.currency)}</b>
                            <button onClick={() => setDelPay({ debt: d, id: p.id })} className="text-slate-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <DebtFormModal open={form.open} initial={form.initial} onClose={() => setForm({ open: false, initial: null })} />
      <PaymentFormModal open={!!paying} debt={paying} onClose={() => setPaying(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        loading={del.isPending}
        text={deleting ? `«${deleting.counterparty}» · ${formatMoney(deleting.amount, deleting.currency)}. ${t('confirmDeleteText')}` : undefined}
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
      <ConfirmDialog
        open={!!delPay}
        onClose={() => setDelPay(null)}
        loading={delPayment.isPending}
        onConfirm={async () => {
          try {
            await delPayment.mutateAsync(delPay!);
            toast(t('deleted'));
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), 'error');
          }
          setDelPay(null);
        }}
      />
    </div>
  );
}
