import { useState } from 'react';
import clsx from 'clsx';
import { Archive, ArchiveRestore, ArrowLeftRight, ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAccounts, useFinanceMutation, useTransfers } from '../hooks/queries';
import { Badge, Card, CardHeader, EmptyState, ErrorState, MissingRatesNote, PageHeader, Skeleton } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { AccountFormModal } from '../components/forms/AccountForm';
import { TransferFormModal } from '../components/forms/TransferForm';
import { ACCOUNT_ICON } from './Dashboard';
import { api } from '../lib/api';
import { formatMoney, isNegative } from '../lib/format';
import { formatDateTime } from '../lib/dates';
import type { Account, Transfer } from '../lib/types';

export default function AccountsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const q = useAccounts();
  const transfers = useTransfers();
  const [accForm, setAccForm] = useState<{ open: boolean; initial: Account | null }>({ open: false, initial: null });
  const [trForm, setTrForm] = useState<{ open: boolean; initial: Transfer | null }>({ open: false, initial: null });
  const [delAcc, setDelAcc] = useState<Account | null>(null);
  const [delTr, setDelTr] = useState<Transfer | null>(null);
  const archive = useFinanceMutation((a: Account) => api.patch(`/accounts/${a.id}`, { archived: !a.archived }));
  const removeAcc = useFinanceMutation((id: string) => api.del(`/accounts/${id}`));
  const removeTr = useFinanceMutation((id: string) => api.del(`/transfers/${id}`));

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const accounts = q.data?.accounts ?? [];
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  const AccountCard = ({ a, i }: { a: Account; i: number }) => {
    const Icon = ACCOUNT_ICON[a.type];
    return (
      <div
        className={clsx('group relative animate-fade-up overflow-hidden rounded-2xl p-5 text-white shadow-lg', a.archived && 'opacity-60')}
        style={{ background: `linear-gradient(135deg, ${a.color}, ${a.color}aa 60%, #0b0b12)`, animationDelay: `${i * 50}ms` }}
      >
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-xl" />
        <div className="relative flex items-start justify-between">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 backdrop-blur">
            <Icon className="h-5 w-5" />
          </span>
          <div className="flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
            <button onClick={() => setAccForm({ open: true, initial: a })} className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25" title={t('edit')}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => archive.mutate(a)} className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25" title={a.archived ? t('unarchive') : t('archive')}>
              {a.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => setDelAcc(a)} className="rounded-lg bg-white/15 p-1.5 hover:bg-rose-500/80" title={t('delete')}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="relative mt-6 text-sm font-medium text-white/80">{a.name}</p>
        <p className={clsx('num relative mt-1 text-2xl font-black tracking-tight', isNegative(a.balance) && 'text-rose-200')}>
          {formatMoney(a.balance, a.currency)}
        </p>
        <div className="relative mt-3 flex items-center justify-between text-[11px] text-white/70">
          <span>{t(`acc_${a.type}`)}</span>
          <span className="font-bold">{a.currency}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav_accounts')}
        subtitle={q.data ? `${t('totalBalance')}: ${formatMoney(q.data.total.total, q.data.total.base)}` : undefined}
        actions={
          <>
            <Button variant="secondary" icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setTrForm({ open: true, initial: null })} disabled={active.length < 2}>
              {t('transfer')}
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAccForm({ open: true, initial: null })}>
              {t('newAccount')}
            </Button>
          </>
        }
      />
      {q.data && <MissingRatesNote currencies={q.data.total.missingRates} />}
      {q.data && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(q.data.total.byCurrency).map(([c, v]) => (
            <Badge key={c} color="violet" className="num px-3 py-1 text-xs">
              {c}: {formatMoney(v!, c as 'TJS')}
            </Badge>
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!q.data
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44" />)
          : active.map((a, i) => <AccountCard key={a.id} a={a} i={i} />)}
      </div>
      {archived.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t('archived')}</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {archived.map((a, i) => <AccountCard key={a.id} a={a} i={i} />)}
          </div>
        </div>
      )}

      <Card>
        <CardHeader title={t('transfersHistory')} subtitle={t('transferNote')} icon={<ArrowLeftRight className="h-4 w-4" />} />
        <div className="p-3">
          {!transfers.data?.length ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {transfers.data.slice(0, 30).map((tr) => (
                <li key={tr.id} className="flex flex-wrap items-center gap-3 px-2 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{tr.fromAccount?.name}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-brand-500" />
                    <span className="truncate">{tr.toAccount?.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="num text-sm font-bold">
                      {formatMoney(tr.amountFrom, tr.fromAccount?.currency)}
                      {tr.fromAccount?.currency !== tr.toAccount?.currency && (
                        <span className="text-slate-500"> → {formatMoney(tr.amountTo, tr.toAccount?.currency)}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{formatDateTime(tr.occurredAt)}{tr.note ? ` · ${tr.note}` : ''}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setTrForm({ open: true, initial: tr })} className="rounded-lg p-2 text-slate-400 hover:bg-brand-500/10 hover:text-brand-500"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDelTr(tr)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <AccountFormModal open={accForm.open} initial={accForm.initial} onClose={() => setAccForm({ open: false, initial: null })} />
      <TransferFormModal open={trForm.open} initial={trForm.initial} onClose={() => setTrForm({ open: false, initial: null })} />
      <ConfirmDialog
        open={!!delAcc}
        onClose={() => setDelAcc(null)}
        loading={removeAcc.isPending}
        text={delAcc ? `«${delAcc.name}» — ${t('confirmDeleteText')}` : undefined}
        onConfirm={async () => {
          try {
            await removeAcc.mutateAsync(delAcc!.id);
            toast(t('deleted'));
          } catch (e) {
            toast(e instanceof Error ? e.message : t('accountInUse'), 'error');
          }
          setDelAcc(null);
        }}
      />
      <ConfirmDialog
        open={!!delTr}
        onClose={() => setDelTr(null)}
        loading={removeTr.isPending}
        text={`${t('transferDeleteNote')} ${t('confirmDeleteText')}`}
        onConfirm={async () => {
          try {
            await removeTr.mutateAsync(delTr!.id);
            toast(t('deleted'));
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), 'error');
          }
          setDelTr(null);
        }}
      />
    </div>
  );
}
