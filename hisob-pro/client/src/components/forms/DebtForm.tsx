import { useEffect, useMemo, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Info } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { useI18n } from '../../i18n';
import { useAccounts, useFinanceMutation } from '../../hooks/queries';
import { api } from '../../lib/api';
import { toLocalInput, dayKey } from '../../lib/dates';
import { CURRENCY_SYMBOL, formatMoney, normalizeAmount, validAmount } from '../../lib/format';
import type { Currency, Debt, DebtDirection } from '../../lib/types';
import { useFormErrors } from './useForm';

export function DebtFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Debt | null }) {
  const { t } = useI18n();
  const accounts = useAccounts();
  const active = useMemo(() => (accounts.data?.accounts ?? []).filter((a) => !a.archived), [accounts.data]);
  const { errors, setErrors, handle, toast } = useFormErrors();
  const [direction, setDirection] = useState<DebtDirection>('LENT');
  const [counterparty, setCounterparty] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('TJS');
  const [accountId, setAccountId] = useState('');
  const [issuedAt, setIssuedAt] = useState(toLocalInput());
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setDirection(initial?.direction ?? 'LENT');
    setCounterparty(initial?.counterparty ?? '');
    setPhone(initial?.phone ?? '');
    setAmount(initial?.amount ?? '');
    setCurrency(initial?.currency ?? 'TJS');
    setAccountId(initial ? initial.accountId ?? '' : active.find((a) => a.currency === 'TJS')?.id ?? '');
    setIssuedAt(toLocalInput(initial?.issuedAt ?? new Date()));
    setDueDate(initial?.dueDate ? dayKey(initial.dueDate) : '');
    setNote(initial?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const forCurrency = active.filter((a) => a.currency === currency);
  const changeCurrency = (c: Currency) => {
    setCurrency(c);
    if (accountId) setAccountId(active.find((a) => a.currency === c)?.id ?? '');
  };

  const mutation = useFinanceMutation(async () => {
    const body = {
      direction,
      counterparty,
      phone: phone || null,
      amount: normalizeAmount(amount),
      currency,
      accountId: accountId || null,
      issuedAt,
      dueDate: dueDate || null,
      note: note || null,
    };
    return initial ? api.put(`/debts/${initial.id}`, body) : api.post('/debts', body);
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!counterparty.trim()) errs.counterparty = t('counterparty') + ' ?';
    if (!validAmount(amount)) errs.amount = t('amount') + ' ?';
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? t('editDebt') : t('newDebt')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button form="debt-form" type="submit" loading={mutation.isPending}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form id="debt-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          {(['LENT', 'BORROWED'] as const).map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDirection(d)}
              className={clsx(
                'rounded-xl border px-3 py-3 text-sm font-semibold transition',
                direction === d
                  ? d === 'LENT'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'border-slate-200 text-slate-500 dark:border-white/10',
              )}
            >
              {t(`dir_${d}`)}
            </button>
          ))}
        </div>
        <Field label={t(`dirQ_${direction}`)} error={errors.counterparty}>
          <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} maxLength={120} invalid={!!errors.counterparty} />
        </Field>
        <Field label={`${t('phone')} (${t('optional')})`}>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="+992" />
        </Field>
        <Field label={t('amount')} error={errors.amount}>
          <Input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!errors.amount} trailing={CURRENCY_SYMBOL[currency]} />
        </Field>
        <Field label={t('currency')} error={errors.currency}>
          <Select value={currency} onChange={(e) => changeCurrency(e.target.value as Currency)}>
            <option value="TJS">TJS</option>
            <option value="USD">USD</option>
            <option value="RUB">RUB</option>
          </Select>
        </Field>
        <Field label={t('account')} error={errors.accountId} hint={t('debtAccountHint')} className="sm:col-span-2">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('noAccountMove')}</option>
            {forCurrency.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {formatMoney(a.balance, a.currency)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('issuedAt')} error={errors.issuedAt}>
          <Input type="datetime-local" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        </Field>
        <Field label={`${t('dueDate')} (${t('optional')})`} error={errors.dueDate}>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label={`${t('note')} (${t('optional')})`} className="sm:col-span-2">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        <p className="flex items-start gap-2 text-xs text-slate-500 sm:col-span-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('debtNote')}
        </p>
      </form>
    </Modal>
  );
}

export function PaymentFormModal({ open, onClose, debt }: { open: boolean; onClose: () => void; debt: Debt | null }) {
  const { t } = useI18n();
  const accounts = useAccounts();
  const { errors, setErrors, handle, toast } = useFormErrors();
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [paidAt, setPaidAt] = useState(toLocalInput());
  const [note, setNote] = useState('');
  const options = (accounts.data?.accounts ?? []).filter((a) => !a.archived && a.currency === debt?.currency);

  useEffect(() => {
    if (!open || !debt) return;
    setErrors({});
    setAmount('');
    setAccountId(debt.accountId && options.find((o) => o.id === debt.accountId) ? debt.accountId : options[0]?.id ?? '');
    setPaidAt(toLocalInput());
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debt?.id]);

  const mutation = useFinanceMutation(() =>
    api.post(`/debts/${debt!.id}/payments`, { amount: normalizeAmount(amount), accountId: accountId || null, paidAt, note: note || null }),
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validAmount(amount)) return setErrors({ amount: t('amount') + ' ?' });
    try {
      await mutation.mutateAsync(undefined);
      toast(t('saved'));
      onClose();
    } catch (err) {
      handle(err);
    }
  };

  if (!debt) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('newPayment')}
      subtitle={`${debt.counterparty} · ${t('remaining')}: ${formatMoney(debt.remaining, debt.currency)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button form="pay-form" type="submit" variant="success" loading={mutation.isPending}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form id="pay-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('amount')} error={errors.amount}>
          <div className="flex gap-2">
            <Input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!errors.amount} trailing={CURRENCY_SYMBOL[debt.currency]} />
            <Button type="button" variant="secondary" onClick={() => setAmount(debt.remaining)}>
              {t('payFull')}
            </Button>
          </div>
        </Field>
        <Field label={t('account')} error={errors.accountId} hint={t('debtAccountHint')}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('noAccountMove')}</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {formatMoney(a.balance, a.currency)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('dateTime')}>
          <Input type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
        <Field label={`${t('note')} (${t('optional')})`}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
      </form>
    </Modal>
  );
}
