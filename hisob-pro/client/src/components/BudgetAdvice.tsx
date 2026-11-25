/**
 * 📊 Буҷети моҳона (барои ҳар категорияи хароҷот) ва 🧭 маслиҳати моҳ (баҳо A–D + маслиҳатҳо).
 */
import { useEffect, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Compass, Pencil, PieChart, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../i18n';
import { formatMoney } from '../lib/format';
import { useCategories } from '../hooks/queries';
import { Card, CardHeader, Segmented } from './ui/misc';
import { Button } from './ui/Button';
import { Field, Input, Select } from './ui/Field';
import { ConfirmDialog, Modal } from './ui/Modal';
import { useToast } from './ui/Toast';
import type { Currency } from '../lib/types';

interface BudgetItem {
  id: string;
  categoryId: string;
  name: string;
  color: string;
  amount: string;
  spent: string;
  remaining: string;
  pct: number;
  state: 'ok' | 'warn' | 'over';
  perDayLeft: string | null;
}
interface BudgetsResp { month: string; base: Currency; daysLeft: number; budgets: BudgetItem[] }

type Tip =
  | { kind: 'cut'; category: string; amount: string; save: string }
  | { kind: 'up'; category: string; pct: number; diff: string }
  | { kind: 'down'; category: string; pct: number }
  | { kind: 'budgets'; kept: number; total: number; over: string[] }
  | { kind: 'negative'; gap: string }
  | { kind: 'great'; rate: number }
  | { kind: 'noIncome' };
interface Advice {
  month: string;
  partial: boolean;
  base: Currency;
  income: string;
  expense: string;
  net: string;
  grade: 'A' | 'B' | 'C' | 'D' | null;
  savingsRate: number | null;
  tips: Tip[];
}

const useBudgets = () => useQuery({ queryKey: ['budgets'], queryFn: () => api.get<BudgetsResp>('/budgets') });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const BAR = { ok: 'bg-emerald-500', warn: 'bg-amber-500', over: 'bg-rose-500' };

function BudgetFormModal({ open, onClose, initial, used }: { open: boolean; onClose: () => void; initial: BudgetItem | null; used: string[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const cats = useCategories('EXPENSE');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const free = (cats.data ?? []).filter((c) => c.id === initial?.categoryId || !used.includes(c.id));
  useEffect(() => {
    if (!open) return;
    setError('');
    setCategoryId(initial?.categoryId ?? '');
    setAmount(initial ? String(Number(initial.amount)) : '');
  }, [open, initial]);
  useEffect(() => {
    if (open && !initial && !categoryId && free[0]) setCategoryId(free[0].id);
  }, [open, initial, categoryId, free]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.put(`/budgets/${categoryId}`, { amount: amount.replace(',', '.').replace(/\s/g, '') });
      await qc.invalidateQueries({ queryKey: ['budgets'] });
      await qc.invalidateQueries({ queryKey: ['advice'] });
      toast(t('saved'));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.fields.amount ? err.fields.amount : errText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={initial ? t('budEdit') : t('budNew')}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>{t('cancel')}</Button>
          <Button form="budget-form" type="submit" loading={busy} disabled={!categoryId}>{t('save')}</Button>
        </>
      }
    >
      <form id="budget-form" onSubmit={submit} className="space-y-3" noValidate>
        <Field label={t('category')}>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!!initial}>
            {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t('budAmount')} error={error} hint={t('budHint')}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500" className="h-14 text-2xl font-bold" invalid={!!error} />
        </Field>
      </form>
    </Modal>
  );
}

export function BudgetsCard() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useBudgets();
  const [form, setForm] = useState<{ open: boolean; initial: BudgetItem | null }>({ open: false, initial: null });
  const [deleting, setDeleting] = useState<BudgetItem | null>(null);
  const d = q.data;
  const list = d?.budgets ?? [];
  return (
    <Card>
      <CardHeader
        title={t('budTitle')}
        subtitle={d ? t('budSubtitle', { n: d.daysLeft }) : undefined}
        icon={<PieChart className="h-4 w-4" />}
        action={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setForm({ open: true, initial: null })}>{t('budNew')}</Button>}
      />
      <div className="space-y-4 p-5" id="budgets">
        {d && !list.length && <p className="text-sm text-slate-500">{t('budEmpty')}</p>}
        {list.map((b) => (
          <div key={b.id}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="flex min-w-0 items-center gap-2 font-semibold">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
                <span className="truncate">{b.name}</span>
              </p>
              <span className={clsx('num shrink-0 text-xs font-bold', b.state === 'over' ? 'text-rose-500' : b.state === 'warn' ? 'text-amber-500' : 'text-emerald-500')}>{b.pct}%</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
              <div className={clsx('h-full rounded-full transition-all duration-700', BAR[b.state])} style={{ width: `${Math.min(100, b.pct)}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="num text-xs text-slate-500">
                {formatMoney(b.spent, d!.base)} / {formatMoney(b.amount, d!.base)} ·{' '}
                {b.state === 'over' ? (
                  <b className="text-rose-500">{t('budOver', { v: formatMoney(String(-Number(b.remaining)), d!.base) })}</b>
                ) : (
                  <>
                    {t('budLeft', { v: formatMoney(b.remaining, d!.base) })}
                    {b.perDayLeft && ` (≈ ${formatMoney(b.perDayLeft, d!.base)} ${t('budPerDay')})`}
                  </>
                )}
              </p>
              <span className="flex shrink-0">
                <button onClick={() => setForm({ open: true, initial: b })} className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-500/10 hover:text-brand-500" aria-label={t('edit')}><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => setDeleting(b)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500" aria-label={t('delete')}><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            </div>
          </div>
        ))}
      </div>
      <BudgetFormModal open={form.open} initial={form.initial} used={list.map((b) => b.categoryId)} onClose={() => setForm({ open: false, initial: null })} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        text={deleting ? `«${deleting.name}» — ${t('confirmDeleteText')}` : undefined}
        onConfirm={async () => {
          try {
            await api.del(`/budgets/${deleting!.categoryId}`);
            await qc.invalidateQueries({ queryKey: ['budgets'] });
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

const MONTHS = {
  tg: ['Январ', 'Феврал', 'Март', 'Апрел', 'Май', 'Июн', 'Июл', 'Август', 'Сентябр', 'Октябр', 'Ноябр', 'Декабр'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
};

const GRADE_STYLE = {
  A: 'from-emerald-500 to-teal-500',
  B: 'from-blue-500 to-violet-500',
  C: 'from-amber-500 to-orange-500',
  D: 'from-rose-500 to-red-600',
};

function tipText(tip: Tip, cur: Currency, t: ReturnType<typeof useI18n>['t']) {
  switch (tip.kind) {
    case 'cut': return t('tipCut', { c: tip.category, v: formatMoney(tip.save, cur) });
    case 'up': return t('tipUp', { c: tip.category, p: tip.pct });
    case 'down': return t('tipDown', { c: tip.category, p: tip.pct });
    case 'budgets': return t('tipBudgets', { k: tip.kept, n: tip.total });
    case 'negative': return t('tipNegative', { v: formatMoney(tip.gap, cur) });
    case 'great': return t('tipGreat');
    case 'noIncome': return t('tipNoIncome');
  }
}

export function AdviceCard() {
  const { t, lang } = useI18n();
  const [which, setWhich] = useState<'auto' | 'current'>('auto');
  const month = which === 'current' ? new Date().toISOString().slice(0, 7) : undefined;
  const q = useQuery({ queryKey: ['advice', which], queryFn: () => api.get<Advice>('/advice', month ? { month } : {}) });
  const a = q.data;
  const monthLabel = a ? `${MONTHS[lang === 'ru' ? 'ru' : 'tg'][Number(a.month.slice(5, 7)) - 1]} ${a.month.slice(0, 4)}` : '';
  return (
    <Card>
      <CardHeader
        title={t('advTitle')}
        subtitle={a ? `${monthLabel}${a.partial ? ` · ${t('advPartial')}` : ''}` : undefined}
        icon={<Compass className="h-4 w-4" />}
        action={<Segmented value={which} onChange={setWhich} options={[{ value: 'auto', label: t('advLast') }, { value: 'current', label: t('advCurrent') }]} />}
      />
      <div className="p-5" id="advice">
        {a && (
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-start">
              <span className={clsx('grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br text-3xl font-black text-white', a.grade ? GRADE_STYLE[a.grade] : 'from-slate-400 to-slate-500')}>
                {a.grade ?? '—'}
              </span>
              <div className="text-xs text-slate-500">
                <p>{a.savingsRate !== null ? (a.savingsRate >= 0 ? t('advSaved', { p: a.savingsRate }) : t('advOverspent', { p: -a.savingsRate })) : t('advNoGrade')}</p>
                <p className="num mt-1">💰 {formatMoney(a.income, a.base)}</p>
                <p className="num">💸 {formatMoney(a.expense, a.base)}</p>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-2">
              {a.tips.length === 0 && <li className="text-sm text-slate-500">{t('advEmpty')}</li>}
              {a.tips.map((tip, i) => (
                <li key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/[0.03]">{tipText(tip, a.base, t)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
