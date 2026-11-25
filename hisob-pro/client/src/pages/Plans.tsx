/**
 * Нақшаҳо: 🎯 мақсадҳои пасандоз ва 📅 пардохтҳои доимӣ (иҷора, интернет, маош…).
 */
import { useEffect, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, Minus, Pencil, Plus, SkipForward, Target, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { api, ApiError } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useAccounts, useCategories, useInvalidateFinance } from '../hooks/queries';
import { Badge, Card, CardHeader, PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/Field';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import type { Currency } from '../lib/types';

export interface Goal {
  id: string;
  title: string;
  target: string;
  currency: Currency;
  deadline: string | null;
  color: string;
  saved: string;
  remaining: string;
  progress: number;
  achieved: boolean;
  daysLeft: number | null;
  perDay: string | null;
  perMonth: string | null;
  contributions: { id: string; amount: string; note: string | null; createdAt: string }[];
}

export interface Recurring {
  id: string;
  title: string;
  type: 'INCOME' | 'EXPENSE';
  amount: string;
  currency: Currency;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  dayOfMonth: number;
  active: boolean;
  status: 'paid' | 'skipped' | 'due' | 'overdue' | 'upcoming';
  dueDate: string;
  nextDate: string;
  daysUntil: number;
}

export const useGoals = () => useQuery({ queryKey: ['goals'], queryFn: async () => (await api.get<{ goals: Goal[] }>('/goals')).goals });
export const useRecurring = () =>
  useQuery({ queryKey: ['recurring'], queryFn: async () => (await api.get<{ recurring: Recurring[] }>('/recurring')).recurring });

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ddmm = (d: string) => d.slice(8, 10) + '.' + d.slice(5, 7);
const fullDate = (d: string) => d.split('-').reverse().join('.');
const STATUS_COLOR = { paid: 'green', skipped: 'blue', due: 'amber', overdue: 'red', upcoming: 'blue' } as const;

/* ------------------------------ Мақсадҳо ------------------------------ */

function GoalFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: Goal | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [currency, setCurrency] = useState<Currency>('TJS');
  const [deadline, setDeadline] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setFields({});
    setTitle(initial?.title ?? '');
    setTarget(initial ? String(Number(initial.target)) : '');
    setCurrency(initial?.currency ?? 'TJS');
    setDeadline(initial?.deadline ?? '');
  }, [open, initial]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      const body = { title: title.trim(), target: target.replace(',', '.').replace(/\s/g, ''), currency, deadline: deadline || null };
      if (initial) await api.patch(`/goals/${initial.id}`, body);
      else await api.post('/goals', body);
      await qc.invalidateQueries({ queryKey: ['goals'] });
      toast(t('saved'));
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields);
      else toast(errText(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={initial ? t('goalEdit') : t('goalNew')}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>{t('cancel')}</Button>
          <Button form="goal-form" type="submit" loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={submit} className="grid grid-cols-2 gap-3 sm:gap-4" noValidate>
        <Field label={t('goalTitle')} error={fields.title} className="col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={t('goalTitlePh')} invalid={!!fields.title} />
        </Field>
        <Field label={t('goalTarget')} error={fields.target} className="col-span-2">
          <div className="flex gap-2">
            <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="3000" className="min-w-0 flex-1" invalid={!!fields.target} />
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="w-[5.75rem] shrink-0 font-semibold" aria-label={t('currency')}>
              <option value="TJS">TJS</option>
              <option value="USD">USD</option>
              <option value="RUB">RUB</option>
            </Select>
          </div>
        </Field>
        <Field label={`${t('goalDeadline')} (${t('optional')})`} error={fields.deadline} className="col-span-2">
          <Input type="date" value={deadline} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={(e) => setDeadline(e.target.value)} invalid={!!fields.deadline} />
        </Field>
        <p className="col-span-2 text-xs text-slate-500">{t('goalNote')}</p>
      </form>
    </Modal>
  );
}

function ContributeModal({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [withdraw, setWithdraw] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!goal) return;
    setAmount(goal.perDay ? String(Number(goal.perDay)) : '');
    setWithdraw(false);
    setNote('');
    setError('');
  }, [goal]);
  if (!goal) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ goal: Goal }>(`/goals/${goal.id}/contributions`, { amount: amount.replace(',', '.').replace(/\s/g, ''), withdraw, note: note || null });
      await qc.invalidateQueries({ queryKey: ['goals'] });
      toast(r.goal.achieved && !goal.achieved ? t('goalDone') : t('saved'));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.fields.amount ? err.fields.amount : errText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`🎯 ${goal.title}`}
      subtitle={`${formatMoney(goal.saved, goal.currency)} / ${formatMoney(goal.target, goal.currency)}`}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>{t('cancel')}</Button>
          <Button form="contrib-form" type="submit" loading={busy} variant={withdraw ? 'danger' : 'success'}>
            {withdraw ? t('goalWithdraw') : t('goalDeposit')}
          </Button>
        </>
      }
    >
      <form id="contrib-form" onSubmit={submit} className="space-y-3" noValidate>
        <div className="grid grid-cols-2 gap-2">
          {[false, true].map((w) => (
            <button
              type="button"
              key={String(w)}
              onClick={() => setWithdraw(w)}
              className={clsx(
                'flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition',
                withdraw === w
                  ? w ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                  : 'border-slate-200 text-slate-500 dark:border-white/10',
              )}
            >
              {w ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {w ? t('goalWithdraw') : t('goalDeposit')}
            </button>
          ))}
        </div>
        <Field label={t('amount')} error={error}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-14 text-2xl font-bold" invalid={!!error} trailing={goal.currency} />
        </Field>
        <Field label={`${t('note')} (${t('optional')})`}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
      </form>
    </Modal>
  );
}

export function GoalProgress({ g, compact }: { g: Goal; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate font-semibold">{g.achieved ? '🎉 ' : '🎯 '}{g.title}</p>
        <p className="num shrink-0 text-xs font-bold text-slate-500">{g.progress}%</p>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', g.achieved ? 'bg-emerald-500' : 'bg-gradient-to-r from-violet-500 to-blue-500')}
          style={{ width: `${g.progress}%` }}
        />
      </div>
      <p className="num mt-1 text-xs text-slate-500">
        {formatMoney(g.saved, g.currency)} / {formatMoney(g.target, g.currency)}
      </p>
      {!compact && !g.achieved && (
        g.deadline && g.daysLeft && g.perMonth ? (
          // Асосӣ: ҳар моҳ чанд гузоштан лозим
          <p className="mt-2 rounded-xl bg-brand-500/10 px-3 py-2 text-sm text-brand-700 dark:text-brand-200">
            📅 {t('goalPerMonth', { v: formatMoney(g.perMonth, g.currency) })}
            <span className="block text-xs opacity-80">
              {t('goalPerDay', { v: formatMoney(g.perDay ?? '0', g.currency) })} · {t('goalUntil', { d: fullDate(g.deadline), n: g.daysLeft })}
            </span>
          </p>
        ) : g.deadline && !g.daysLeft ? (
          <p className="mt-2 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-300">
            {t('goalExpired', { d: fullDate(g.deadline) })}
          </p>
        ) : !g.deadline ? (
          <p className="mt-2 text-xs text-slate-500">{t('goalNoDeadline')}</p>
        ) : null
      )}
    </div>
  );
}

function GoalsCard() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const goals = useGoals();
  const [form, setForm] = useState<{ open: boolean; initial: Goal | null }>({ open: false, initial: null });
  const [contrib, setContrib] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);
  const list = goals.data ?? [];
  return (
    <Card>
      <CardHeader
        title={t('goalsTitle')}
        subtitle={t('goalsSubtitle')}
        icon={<Target className="h-4 w-4" />}
        action={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setForm({ open: true, initial: null })}>{t('goalNew')}</Button>}
      />
      <div className="space-y-3 p-5" id="goals">
        {goals.data && !list.length && <p className="text-sm text-slate-500">{t('goalsEmpty')}</p>}
        {list.map((g) => (
          <div key={g.id} className="rounded-2xl border border-slate-100 p-4 dark:border-white/[0.06]">
            <GoalProgress g={g} />
            <div className="mt-3 flex items-center gap-1">
              <Button size="sm" variant="success" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setContrib(g)}>{t('goalDeposit')}</Button>
              <div className="ml-auto flex gap-1">
                <button onClick={() => setForm({ open: true, initial: g })} className="rounded-lg p-2 text-slate-400 hover:bg-brand-500/10 hover:text-brand-500" aria-label={t('edit')}><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setDeleting(g)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500" aria-label={t('delete')}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <GoalFormModal open={form.open} initial={form.initial} onClose={() => setForm({ open: false, initial: null })} />
      <ContributeModal goal={contrib} onClose={() => setContrib(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        text={deleting ? `«${deleting.title}» — ${t('confirmDeleteText')}` : undefined}
        onConfirm={async () => {
          try {
            await api.del(`/goals/${deleting!.id}`);
            await qc.invalidateQueries({ queryKey: ['goals'] });
            toast(t('deleted'));
          } catch (e) {
            toast(errText(e), 'error');
          }
          setDeleting(null);
        }}
      />
    </Card>
  );
}

/* ------------------------------ Пардохтҳои доимӣ ------------------------------ */

function RecurringFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: Recurring | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const cats = useCategories(type);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('TJS');
  const [day, setDay] = useState(1);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setFields({});
    setType(initial?.type ?? 'EXPENSE');
    setTitle(initial?.title ?? '');
    setAmount(initial ? String(Number(initial.amount)) : '');
    setCurrency(initial?.currency ?? 'TJS');
    setDay(initial?.dayOfMonth ?? new Date().getDate());
    setAccountId(initial?.accountId ?? '');
    setCategoryId(initial?.categoryId ?? '');
  }, [open, initial]);
  const accs = (accounts.data?.accounts ?? []).filter((a) => !a.archived && a.currency === currency);
  const suggest = t(type === 'INCOME' ? 'recSuggestIncome' : 'recSuggest').split(',');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      const body = {
        title: title.trim(),
        type,
        amount: amount.replace(',', '.').replace(/\s/g, ''),
        currency,
        dayOfMonth: day,
        accountId: accountId || null,
        categoryId: categoryId || null,
      };
      if (initial) await api.patch(`/recurring/${initial.id}`, body);
      else await api.post('/recurring', body);
      await qc.invalidateQueries({ queryKey: ['recurring'] });
      toast(t('saved'));
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields);
      else toast(errText(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={initial ? t('recEdit') : t('recNew')}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>{t('cancel')}</Button>
          <Button form="rec-form" type="submit" loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <form id="rec-form" onSubmit={submit} className="grid grid-cols-2 gap-3 sm:gap-4" noValidate>
        <div className="col-span-2 grid grid-cols-2 gap-2">
          {(['EXPENSE', 'INCOME'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => {
                setType(k);
                setCategoryId('');
              }}
              className={clsx(
                'h-11 rounded-xl border text-sm font-semibold transition',
                type === k
                  ? k === 'EXPENSE' ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                  : 'border-slate-200 text-slate-500 dark:border-white/10',
              )}
            >
              {k === 'EXPENSE' ? t('recExpense') : t('recIncome')}
            </button>
          ))}
        </div>
        <Field label={t('recTitle')} error={fields.title} className="col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} invalid={!!fields.title} />
          {!initial && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggest.map((s) => (
                <button type="button" key={s} onClick={() => setTitle(s)}
                  className={clsx('rounded-full border px-2.5 py-1 text-xs font-semibold transition', title === s ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'border-slate-200 text-slate-500 dark:border-white/10')}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label={t('amount')} error={fields.amount} className="col-span-2">
          <div className="flex gap-2">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="min-w-0 flex-1" invalid={!!fields.amount} />
            <Select value={currency} onChange={(e) => { setCurrency(e.target.value as Currency); setAccountId(''); }} className="w-[5.75rem] shrink-0 font-semibold" aria-label={t('currency')}>
              <option value="TJS">TJS</option>
              <option value="USD">USD</option>
              <option value="RUB">RUB</option>
            </Select>
          </div>
        </Field>
        <Field label={t('recDay')} error={fields.dayOfMonth}>
          <Select value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('category')}>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('noCategory')}</option>
            {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t('account')} className="col-span-2">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('recAutoAccount')}</option>
            {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <p className="col-span-2 text-xs text-slate-500">{t('recHow')}</p>
      </form>
    </Modal>
  );
}

export function RecurringRow({ r, onPay, onSkip, busy }: { r: Recurring; onPay: () => void; onSkip: () => void; busy?: boolean }) {
  const { t } = useI18n();
  const open = r.status !== 'paid' && r.status !== 'skipped';
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-2', !r.active && 'opacity-50')}>
      <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', r.type === 'INCOME' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500')}>
        <CalendarClock className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{r.title}</p>
        <p className="text-xs text-slate-500">
          <span className={clsx('num font-bold', r.type === 'INCOME' ? 'text-emerald-500' : 'text-rose-500')}>
            {r.type === 'INCOME' ? '+' : '−'}{formatMoney(r.amount, r.currency)}
          </span>
          {' · '}{t('recEvery', { d: r.dayOfMonth })}
          {r.accountName && ` · ${r.accountName}`}
        </p>
      </div>
      <Badge color={STATUS_COLOR[r.status]}>
        {r.status === 'upcoming' ? t('recIn', { n: r.daysUntil, d: ddmm(r.dueDate) }) : t(`rec_${r.status}`)}
      </Badge>
      {open && r.active && (
        <div className="flex w-full gap-2 sm:w-auto">
          <Button size="sm" variant="success" className="flex-1 sm:flex-none" loading={busy} icon={<Check className="h-3.5 w-3.5" />} onClick={onPay}>
            {r.type === 'INCOME' ? t('recGot') : t('recPaid')}
          </Button>
          <Button size="sm" variant="secondary" className="flex-1 sm:flex-none" icon={<SkipForward className="h-3.5 w-3.5" />} onClick={onSkip}>
            {t('recSkip')}
          </Button>
        </div>
      )}
    </div>
  );
}

export function usePayRecurring() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const invalidate = useInvalidateFinance();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (r: Recurring, action: 'pay' | 'skip') => {
    setBusy(r.id);
    try {
      await api.post(`/recurring/${r.id}/${action}`, {});
      await qc.invalidateQueries({ queryKey: ['recurring'] });
      if (action === 'pay') await invalidate();
      toast(action === 'pay' ? t('recSaved') : t('saved'));
    } catch (e) {
      toast(errText(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return { act, busy };
}

function RecurringCard() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const list = useRecurring();
  const { act, busy } = usePayRecurring();
  const [form, setForm] = useState<{ open: boolean; initial: Recurring | null }>({ open: false, initial: null });
  const [deleting, setDeleting] = useState<Recurring | null>(null);
  const items = list.data ?? [];
  return (
    <Card>
      <CardHeader
        title={t('recTitleCard')}
        subtitle={t('recSubtitle')}
        icon={<CalendarClock className="h-4 w-4" />}
        action={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setForm({ open: true, initial: null })}>{t('recNew')}</Button>}
      />
      <div className="divide-y divide-slate-100 p-5 pt-2 dark:divide-white/[0.06]" id="recurring">
        {list.data && !items.length && <p className="pt-3 text-sm text-slate-500">{t('recEmpty')}</p>}
        {items.map((r) => (
          <div key={r.id} className="py-3">
            <RecurringRow r={r} busy={busy === r.id} onPay={() => act(r, 'pay')} onSkip={() => act(r, 'skip')} />
            <div className="mt-1 flex justify-end gap-1">
              <button onClick={() => setForm({ open: true, initial: r })} className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-500/10 hover:text-brand-500" aria-label={t('edit')}><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => setDeleting(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500" aria-label={t('delete')}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      <RecurringFormModal open={form.open} initial={form.initial} onClose={() => setForm({ open: false, initial: null })} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        text={deleting ? `«${deleting.title}» — ${t('confirmDeleteText')}` : undefined}
        onConfirm={async () => {
          try {
            await api.del(`/recurring/${deleting!.id}`);
            await qc.invalidateQueries({ queryKey: ['recurring'] });
            toast(t('deleted'));
          } catch (e) {
            toast(errText(e), 'error');
          }
          setDeleting(null);
        }}
      />
    </Card>
  );
}

export default function PlansPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <PageHeader title={t('plansTitle')} subtitle={t('plansSubtitle')} />
      <div className="grid gap-6 xl:grid-cols-2">
        <GoalsCard />
        <RecurringCard />
      </div>
    </div>
  );
}

/** Dashboard: пардохтҳои наздик (7 рӯз) ва пешрафти мақсадҳо */
export function PlansWidget() {
  const { t } = useI18n();
  const goals = useGoals();
  const rec = useRecurring();
  const { act, busy } = usePayRecurring();
  const soon = (rec.data ?? []).filter((r) => r.active && (r.status === 'due' || r.status === 'overdue' || (r.status === 'upcoming' && r.daysUntil <= 7)));
  const activeGoals = (goals.data ?? []).filter((g) => !g.achieved).slice(0, 3);
  if (!goals.data || !rec.data) return null;
  // Ҳоло холӣ — корти даъват, то корбар бахши «Нақшаҳо»-ро ёбад
  if (!soon.length && !activeGoals.length) {
    return (
      <Link to="/plans" className="card flex items-center gap-4 p-5 transition hover:border-brand-500/40" data-testid="plans-cta">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 text-white">
          <Target className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{t('plansCtaTitle')}</span>
          <span className="block text-xs text-slate-500">{t('plansCtaText')}</span>
        </span>
        <span className="shrink-0 text-sm font-bold text-brand-500">→</span>
      </Link>
    );
  }
  return (
    <Card>
      <CardHeader
        title={t('plansTitle')}
        icon={<Target className="h-4 w-4" />}
        action={<Link to="/plans" className="text-xs font-semibold text-brand-500 hover:underline">{t('plansOpen')}</Link>}
      />
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        {soon.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('recSoon')}</p>
            {soon.map((r) => (
              <RecurringRow key={r.id} r={r} busy={busy === r.id} onPay={() => act(r, 'pay')} onSkip={() => act(r, 'skip')} />
            ))}
          </div>
        )}
        {activeGoals.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('goalsTitle')}</p>
            {activeGoals.map((g) => <GoalProgress key={g.id} g={g} />)}
          </div>
        )}
      </div>
    </Card>
  );
}
