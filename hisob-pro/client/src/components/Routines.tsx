/**
 * Ҷадвали рӯз: «Пулро бештар дар куҷо сарф мекунед?»
 * Корбар ҷойҳоро бо соати даромадан ва баромадан илова мекунад (Иловагӣ 16:00–18:00);
 * бот 5 дақиқа пеш аз баромадан дар Telegram хабар медиҳад: «пардохти хароҷотро сабт кунед».
 */
import { useEffect, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Clock, MapPin, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useCategories } from '../hooks/queries';
import { Modal, ConfirmDialog } from './ui/Modal';
import { Button } from './ui/Button';
import { Field, Input, Select } from './ui/Field';
import { Card, CardHeader } from './ui/misc';
import { useToast } from './ui/Toast';

export interface Routine {
  id: string;
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  days: string;
  arriveTime: string | null;
  leaveTime: string;
  remindBefore: number;
  active: boolean;
}

export const useRoutines = () =>
  useQuery({ queryKey: ['routines'], queryFn: () => api.get<{ routines: Routine[]; asked: boolean }>('/routines') });

const useTelegramLinked = () =>
  useQuery({
    queryKey: ['telegram'],
    queryFn: () => api.get<{ enabled: boolean; linked: boolean }>('/telegram/settings'),
    staleTime: 30_000,
  });

function daysText(days: string, t: ReturnType<typeof useI18n>['t']) {
  if (days === '1234567') return t('rtEveryDay');
  if (days === '12345') return t('rtWeekdays');
  const names = t('rtDayNames').split(',');
  return days.split('').map((d) => names[Number(d) - 1]).join(', ');
}

export function RoutineFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Routine | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const cats = useCategories('EXPENSE');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [days, setDays] = useState('1234567');
  const [arriveTime, setArriveTime] = useState('');
  const [leaveTime, setLeaveTime] = useState('18:00');
  const [remindBefore, setRemindBefore] = useState(5);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setTitle(initial?.title ?? '');
    setCategoryId(initial?.categoryId ?? '');
    setDays(initial?.days ?? '1234567');
    setArriveTime(initial?.arriveTime ?? '');
    setLeaveTime(initial?.leaveTime ?? '18:00');
    setRemindBefore(initial?.remindBefore ?? 5);
  }, [open, initial]);

  const toggleDay = (d: string) => setDays((cur) => (cur.includes(d) ? cur.replace(d, '') : [...cur, d].sort().join('')));
  const names = t('rtDayNames').split(',');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = t('rtPlace');
    if (!days) errs.days = t('rtBadDays');
    if (!/^\d{2}:\d{2}$/.test(leaveTime)) errs.leaveTime = t('rtLeave') + ' ?';
    else if (arriveTime && arriveTime >= leaveTime) errs.leaveTime = t('rtBadOrder');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body = { title: title.trim(), categoryId: categoryId || null, days, arriveTime: arriveTime || null, leaveTime, remindBefore };
      if (initial) await api.patch(`/routines/${initial.id}`, body);
      else await api.post('/routines', body);
      await qc.invalidateQueries({ queryKey: ['routines'] });
      toast(t('saved'));
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-brand-500" />
          {initial ? t('rtEdit') : t('rtNew')}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>{t('cancel')}</Button>
          <Button form="routine-form" type="submit" loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <form id="routine-form" onSubmit={submit} className="grid grid-cols-2 gap-3 sm:gap-4" noValidate>
        <Field label={t('rtPlace')} error={errors.title} className="col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={t('rtPlaceHint')} invalid={!!errors.title} />
          {!initial && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t('rtSuggest').split(',').map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setTitle(s)}
                  className={clsx(
                    'rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                    title === s ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'border-slate-200 text-slate-500 dark:border-white/10',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label={t('rtArrive')}>
          <Input type="time" value={arriveTime} onChange={(e) => setArriveTime(e.target.value)} />
        </Field>
        <Field label={t('rtLeave')} error={errors.leaveTime}>
          <Input type="time" value={leaveTime} onChange={(e) => setLeaveTime(e.target.value)} invalid={!!errors.leaveTime} />
        </Field>
        <Field label={t('rtDays')} error={errors.days} className="col-span-2">
          <div className="grid grid-cols-7 gap-1">
            {names.map((n, i) => {
              const d = String(i + 1);
              const on = days.includes(d);
              return (
                <button
                  type="button"
                  key={d}
                  onClick={() => toggleDay(d)}
                  aria-pressed={on}
                  className={clsx(
                    'h-10 min-w-0 rounded-lg border text-xs font-bold transition',
                    on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 text-slate-500 dark:border-white/10',
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-3 text-xs font-semibold">
            <button type="button" className="text-brand-500 hover:underline" onClick={() => setDays('1234567')}>{t('rtEveryDay')}</button>
            <button type="button" className="text-brand-500 hover:underline" onClick={() => setDays('12345')}>{t('rtWeekdays')}</button>
          </div>
        </Field>
        <Field label={t('category')} hint={t('rtCategoryHint')} hintDesktopOnly>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('noCategory')}</option>
            {cats.data?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('rtRemind')}>
          <Select value={remindBefore} onChange={(e) => setRemindBefore(Number(e.target.value))}>
            {[0, 5, 10, 15, 30].map((m) => (
              <option key={m} value={m}>{m} {t('rtMin')}</option>
            ))}
          </Select>
        </Field>
        <p className="col-span-2 flex items-start gap-2 rounded-xl bg-brand-500/10 px-3 py-2.5 text-xs text-brand-700 dark:text-brand-200">
          <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('rtHow', { m: remindBefore })}
        </p>
      </form>
    </Modal>
  );
}

function RoutineList({ list, onEdit, onDelete }: { list: Routine[]; onEdit: (r: Routine) => void; onDelete: (r: Routine) => void }) {
  const { t } = useI18n();
  return (
    <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
      {list.map((r) => (
        <li key={r.id} className={clsx('flex items-center gap-3 py-3', !r.active && 'opacity-50')}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-500">
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {r.title}
              {!r.active && <span className="ml-2 text-xs font-normal text-slate-500">({t('rtPaused')})</span>}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.arriveTime ? `${r.arriveTime}–` : ''}{r.leaveTime}</span>
              <span>{daysText(r.days, t)}</span>
              {r.categoryName && <span>· {r.categoryName}</span>}
            </p>
          </div>
          <button onClick={() => onEdit(r)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-500/10 hover:text-brand-500" aria-label={t('edit')}>
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => onDelete(r)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500" aria-label={t('delete')}>
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function TelegramHint() {
  const { t } = useI18n();
  const tg = useTelegramLinked();
  if (!tg.data || tg.data.linked || !tg.data.enabled) return null;
  return (
    <Link to="/settings" className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
      <Send className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {t('rtNeedTelegram')}
    </Link>
  );
}

/** Корти «Ҷадвали рӯз» дар Танзимот */
export function RoutinesCard() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useRoutines();
  const [form, setForm] = useState<{ open: boolean; initial: Routine | null }>({ open: false, initial: null });
  const [deleting, setDeleting] = useState<Routine | null>(null);
  const list = q.data?.routines ?? [];
  return (
    <Card>
      <CardHeader
        title={t('rtTitle')}
        subtitle={t('rtSubtitle')}
        icon={<MapPin className="h-4 w-4" />}
        action={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setForm({ open: true, initial: null })}>{t('add')}</Button>}
      />
      <div className="space-y-3 px-5 pb-5 pt-4" id="routines">
        <TelegramHint />
        {list.length ? (
          <RoutineList list={list} onEdit={(r) => setForm({ open: true, initial: r })} onDelete={setDeleting} />
        ) : (
          q.data && <p className="text-sm text-slate-500">{t('rtEmpty')}</p>
        )}
      </div>
      <RoutineFormModal open={form.open} initial={form.initial} onClose={() => setForm({ open: false, initial: null })} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        text={deleting ? `«${deleting.title}» — ${t('confirmDeleteText')}` : undefined}
        onConfirm={async () => {
          try {
            await api.del(`/routines/${deleting!.id}`);
            await qc.invalidateQueries({ queryKey: ['routines'] });
            toast(t('deleted'));
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), 'error');
          }
          setDeleting(null);
        }}
      />
    </Card>
  );
}

/**
 * Вақте ки корбар ба барнома медарояд ва ҳанӯз ҷадвал надорад — як бор мепурсад:
 * «Пулро бештар дар куҷо сарф мекунед?»
 */
export function RoutinesPrompt() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useRoutines();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!shown && q.data && !q.data.asked && q.data.routines.length === 0) {
      setOpen(true);
      setShown(true);
    }
  }, [q.data, shown]);

  const close = async () => {
    setOpen(false);
    await api.post('/routines/asked').catch(() => undefined);
    await qc.invalidateQueries({ queryKey: ['routines'] });
  };
  const list = q.data?.routines ?? [];

  return (
    <>
      <Modal
        open={open && !adding}
        onClose={close}
        title={
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-brand-500" />
            {t('rtAskTitle')}
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={close}>{list.length ? t('rtDone') : t('rtLater')}</Button>
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditing(null);
                setAdding(true);
              }}
            >
              {t('rtAdd')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('rtAskText')}</p>
          {list.length > 0 && (
            <RoutineList
              list={list}
              onEdit={(r) => {
                setEditing(r);
                setAdding(true);
              }}
              onDelete={async (r) => {
                await api.del(`/routines/${r.id}`).catch(() => undefined);
                await qc.invalidateQueries({ queryKey: ['routines'] });
              }}
            />
          )}
          <TelegramHint />
        </div>
      </Modal>
      <RoutineFormModal open={adding} initial={editing} onClose={() => setAdding(false)} />
    </>
  );
}
