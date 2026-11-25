import { useEffect, useMemo, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Banknote, Building2, Camera, CreditCard, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { useI18n } from '../../i18n';
import { useAccounts, useCategories, useFinanceMutation } from '../../hooks/queries';
import { api } from '../../lib/api';
import { toLocalInput } from '../../lib/dates';
import { CURRENCY_SYMBOL, normalizeAmount, validAmount } from '../../lib/format';
import { compressImage, photoUrl } from '../../lib/image';
import type { AccountType, Currency, PaymentMethod, Transaction } from '../../lib/types';
import { useFormErrors } from './useForm';

const PM_ICON = { CASH: Banknote, CARD: CreditCard, BANK: Building2 };
const defaultPm = (t: AccountType): PaymentMethod => (t === 'CASH' ? 'CASH' : t === 'BANK' ? 'BANK' : 'CARD');

export function TransactionFormModal({
  open,
  onClose,
  kind,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  kind: 'INCOME' | 'EXPENSE';
  initial?: Transaction | null;
}) {
  const { t } = useI18n();
  const accounts = useAccounts();
  const cats = useCategories(kind);
  const { errors, setErrors, handle, toast } = useFormErrors();
  const active = useMemo(() => (accounts.data?.accounts ?? []).filter((a) => !a.archived), [accounts.data]);

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('TJS');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [occurredAt, setOccurredAt] = useState(toLocalInput());
  const [text, setText] = useState('');
  const [pm, setPm] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  // Сурат: newPhoto — сурати нав (dataURL); removePhoto — сурати мавҷуда нест карда шавад
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  // Ҳангоми кушодан ҳамаи майдонҳо якбора гузошта мешаванд (ҳисоби амалиёти таҳриршаванда иваз намешавад)
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setNewPhoto(null);
    setRemovePhoto(false);
    if (initial) {
      setAmount(initial.amount);
      setCurrency(initial.currency);
      setAccountId(initial.accountId);
      setCategoryId(initial.categoryId ?? '');
      setOccurredAt(toLocalInput(initial.occurredAt));
      setText((kind === 'INCOME' ? initial.source : initial.purpose) ?? '');
      setPm(initial.paymentMethod ?? 'CASH');
      setNote(initial.note ?? '');
    } else {
      const first = active.find((a) => a.currency === 'TJS');
      setAmount('');
      setCurrency('TJS');
      setAccountId(first?.id ?? '');
      setPm(first ? defaultPm(first.type) : 'CASH');
      setCategoryId('');
      setOccurredAt(toLocalInput());
      setText('');
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const forCurrency = active.filter((a) => a.currency === currency);

  // Агар ҳисобҳо дертар бор шаванд (формаи нав), аввалин ҳисоби мувофиқро интихоб мекунем
  useEffect(() => {
    if (open && !initial && !accountId && forCurrency[0]) {
      setAccountId(forCurrency[0].id);
      setPm(defaultPm(forCurrency[0].type));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active.length]);

  /** Иваз кардани асъор аз ҷониби корбар → ҳисоби мувофиқ интихоб мешавад */
  const changeCurrency = (c: Currency) => {
    setCurrency(c);
    const first = active.find((a) => a.currency === c);
    setAccountId(first?.id ?? '');
    if (first) setPm(defaultPm(first.type));
  };

  useEffect(() => {
    if (open && !initial && !categoryId && cats.data?.length) setCategoryId(cats.data[0].id);
  }, [open, cats.data, categoryId, initial]);

  const mutation = useFinanceMutation(async () => {
    const body = {
      amount: normalizeAmount(amount),
      currency,
      accountId,
      categoryId: categoryId || null,
      occurredAt,
      [kind === 'INCOME' ? 'source' : 'purpose']: text || null,
      paymentMethod: pm,
      note: note || null,
    };
    const res = await (initial
      ? api.patch<{ transaction: Transaction }>(`/transactions/${initial.id}`, body)
      : api.post<{ transaction: Transaction }>('/transactions', { type: kind, ...body }));
    const id = res.transaction.id;
    if (newPhoto) await api.put(`/transactions/${id}/photo`, { data: newPhoto });
    else if (removePhoto && initial?.hasPhoto) await api.del(`/transactions/${id}/photo`);
    return res;
  });

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      setNewPhoto(await compressImage(file));
      setRemovePhoto(false);
    } catch {
      toast(t('photoError'), 'error');
    } finally {
      setPhotoBusy(false);
    }
  };
  const preview = newPhoto ?? (initial?.hasPhoto && !removePhoto ? photoUrl(initial.id, initial.updatedAt) : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!validAmount(amount)) errs.amount = t('amount') + ' ?';
    if (!accountId) errs.accountId = t('noAccountsForCurrency');
    if (!occurredAt) errs.occurredAt = t('dateTime') + ' ?';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await mutation.mutateAsync(undefined);
      toast(t('saved'));
      onClose();
    } catch (err) {
      handle(err);
    }
  };

  const isIncome = kind === 'INCOME';
  const title = initial ? (isIncome ? t('editIncome') : t('editExpense')) : isIncome ? t('newIncome') : t('newExpense');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className={clsx('h-2.5 w-2.5 rounded-full', isIncome ? 'bg-emerald-500' : 'bg-rose-500')} />
          {title}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button form="tx-form" type="submit" loading={mutation.isPending} disabled={photoBusy} variant={isIncome ? 'success' : 'primary'}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form id="tx-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t('amount')} error={errors.amount} className="sm:col-span-2">
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            invalid={!!errors.amount}
            trailing={CURRENCY_SYMBOL[currency]}
            className="h-14 text-2xl font-bold"
            autoFocus
          />
        </Field>
        <Field label={t('currency')} error={errors.currency}>
          <Select value={currency} onChange={(e) => changeCurrency(e.target.value as Currency)} disabled={!!initial}>
            <option value="TJS">TJS — сомонӣ</option>
            <option value="USD">USD — доллар</option>
            <option value="RUB">RUB — рубл</option>
          </Select>
        </Field>
        <Field label={t('account')} error={errors.accountId} hint={t('accountCurrencyHint')}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} invalid={!!errors.accountId}>
            {!forCurrency.length && <option value="">—</option>}
            {forCurrency.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('category')} error={errors.categoryId}>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('noCategory')}</option>
            {cats.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('dateTime')} error={errors.occurredAt} hint="Asia/Dushanbe">
          <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} invalid={!!errors.occurredAt} />
        </Field>
        <Field label={isIncome ? t('source') : t('purpose')} error={errors.source || errors.purpose} className="sm:col-span-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />
        </Field>
        <Field label={t('paymentMethod')} className="sm:col-span-2">
          <div className="grid grid-cols-3 gap-2">
            {(['CASH', 'CARD', 'BANK'] as const).map((m) => {
              const Icon = PM_ICON[m];
              return (
                <button
                  type="button"
                  key={m}
                  onClick={() => setPm(m)}
                  className={clsx(
                    'flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition',
                    pm === m
                      ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-white/10',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(`pm_${m}`)}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label={`${t('note')} (${t('optional')})`} error={errors.note} className="sm:col-span-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} />
        </Field>
        <Field label={t('photo')} hint={t('photoHint')} className="sm:col-span-2">
          {preview ? (
            <div className="relative inline-block">
              <img src={preview} alt={t('photo')} className="h-32 max-w-full rounded-xl border border-slate-200 object-cover dark:border-white/10" />
              <button
                type="button"
                onClick={() => {
                  setNewPhoto(null);
                  setRemovePhoto(true);
                }}
                className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-rose-600 text-white shadow-lg"
                aria-label={t('removePhoto')}
                title={t('removePhoto')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              className={clsx(
                'flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-500 transition hover:border-brand-500 hover:text-brand-500 dark:border-white/15',
                photoBusy && 'pointer-events-none opacity-60',
              )}
            >
              <Camera className="h-5 w-5" />
              {photoBusy ? t('loading') : t('addPhoto')}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                data-testid="photo-input"
                onChange={(e) => {
                  void pickPhoto(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </Field>
      </form>
    </Modal>
  );
}
