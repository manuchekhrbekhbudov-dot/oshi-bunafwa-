import { useEffect, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Field';
import { useI18n } from '../../i18n';
import { useFinanceMutation } from '../../hooks/queries';
import { api } from '../../lib/api';
import type { Account, AccountType, Currency } from '../../lib/types';
import { useFormErrors } from './useForm';

const COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#06b6d4', '#f97316', '#ec4899', '#eab308', '#64748b'];

export function AccountFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Account | null }) {
  const { t } = useI18n();
  const { errors, setErrors, handle, toast } = useFormErrors();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('CASH');
  const [currency, setCurrency] = useState<Currency>('TJS');
  const [initialBalance, setInitialBalance] = useState('0');
  const [color, setColor] = useState(COLORS[0]);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setName(initial?.name ?? '');
    setType(initial?.type ?? 'CASH');
    setCurrency(initial?.currency ?? 'TJS');
    setInitialBalance(initial?.initialBalance ?? '0');
    setColor(initial?.color ?? COLORS[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const mutation = useFinanceMutation(async () => {
    const body = { name, type, currency, initialBalance: initialBalance.replace(',', '.').replace(/\s/g, '') || '0', color };
    return initial ? api.patch(`/accounts/${initial.id}`, body) : api.post('/accounts', body);
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: t('name') + ' ?' });
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
      size="sm"
      title={initial ? t('editAccount') : t('newAccount')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button form="acc-form" type="submit" loading={mutation.isPending}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form id="acc-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('name')} error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} invalid={!!errors.name} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('type')}>
            <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {(['CASH', 'CARD', 'BANK', 'EWALLET'] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`acc_${x}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('currency')} error={errors.currency}>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="TJS">TJS</option>
              <option value="USD">USD</option>
              <option value="RUB">RUB</option>
            </Select>
          </Field>
        </div>
        <Field label={t('initialBalance')} error={errors.initialBalance}>
          <Input inputMode="decimal" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} invalid={!!errors.initialBalance} />
        </Field>
        <Field label={t('color')}>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className={clsx('h-8 w-8 rounded-full ring-offset-2 transition dark:ring-offset-ink-900', color === c && 'ring-2 ring-brand-500')}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
}
