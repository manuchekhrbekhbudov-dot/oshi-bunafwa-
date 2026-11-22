import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Decimal from 'decimal.js';
import { ArrowDown, Info } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Field';
import { useI18n } from '../../i18n';
import { useAccounts, useFinanceMutation } from '../../hooks/queries';
import { api } from '../../lib/api';
import { toLocalInput } from '../../lib/dates';
import { CURRENCY_SYMBOL, formatMoney, normalizeAmount, validAmount } from '../../lib/format';
import type { Transfer } from '../../lib/types';
import { useFormErrors } from './useForm';

export function TransferFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Transfer | null }) {
  const { t } = useI18n();
  const accounts = useAccounts();
  const active = useMemo(() => (accounts.data?.accounts ?? []).filter((a) => !a.archived), [accounts.data]);
  const { errors, setErrors, handle, toast } = useFormErrors();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [amountTo, setAmountTo] = useState('');
  const [occurredAt, setOccurredAt] = useState(toLocalInput());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFromId(initial?.fromAccountId ?? active[0]?.id ?? '');
    setToId(initial?.toAccountId ?? active[1]?.id ?? '');
    setAmount(initial?.amountFrom ?? '');
    setAmountTo(initial && initial.amountTo !== initial.amountFrom ? initial.amountTo : '');
    setOccurredAt(toLocalInput(initial?.occurredAt ?? new Date()));
    setNote(initial?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, active.length]);

  const from = active.find((a) => a.id === fromId);
  const to = active.find((a) => a.id === toId);
  const cross = !!from && !!to && from.currency !== to.currency;

  const mutation = useFinanceMutation(async () => {
    const body = {
      fromAccountId: fromId,
      toAccountId: toId,
      amount: normalizeAmount(amount),
      amountTo: cross ? normalizeAmount(amountTo) : null,
      occurredAt,
      note: note || null,
    };
    return initial ? api.put(`/transfers/${initial.id}`, body) : api.post('/transfers', body);
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!validAmount(amount)) errs.amount = t('amount') + ' ?';
    if (cross && !validAmount(amountTo)) errs.amountTo = t('amountTo') + ' ?';
    if (fromId === toId) errs.toAccountId = '≠';
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

  let rate = '';
  if (cross && validAmount(amount) && validAmount(amountTo)) {
    rate = new Decimal(normalizeAmount(amountTo)).div(normalizeAmount(amount)).toDecimalPlaces(4).toString();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? t('editTransfer') : t('newTransfer')}
      subtitle={t('transferNote')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button form="tr-form" type="submit" loading={mutation.isPending}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form id="tr-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('fromAccount')} error={errors.fromAccountId}>
          <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {formatMoney(a.balance, a.currency)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-center">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-500/10 text-brand-500">
            <ArrowDown className="h-4 w-4" />
          </span>
        </div>
        <Field label={t('toAccount')} error={errors.toAccountId}>
          <Select value={toId} onChange={(e) => setToId(e.target.value)} invalid={!!errors.toAccountId}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {formatMoney(a.balance, a.currency)}
              </option>
            ))}
          </Select>
        </Field>
        <div className={cross ? 'grid grid-cols-2 gap-3' : ''}>
          <Field label={t('amount')} error={errors.amount}>
            <Input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!errors.amount} trailing={from ? CURRENCY_SYMBOL[from.currency] : ''} />
          </Field>
          {cross && (
            <Field label={t('amountTo')} error={errors.amountTo}>
              <Input inputMode="decimal" placeholder="0.00" value={amountTo} onChange={(e) => setAmountTo(e.target.value)} invalid={!!errors.amountTo} trailing={to ? CURRENCY_SYMBOL[to.currency] : ''} />
            </Field>
          )}
        </div>
        {rate && from && to && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="h-3.5 w-3.5" />
            {t('rateHint', { a: from.currency, r: rate, b: to.currency })}
          </p>
        )}
        <Field label={t('dateTime')} hint="Asia/Dushanbe">
          <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </Field>
        <Field label={`${t('note')} (${t('optional')})`}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
      </form>
    </Modal>
  );
}
