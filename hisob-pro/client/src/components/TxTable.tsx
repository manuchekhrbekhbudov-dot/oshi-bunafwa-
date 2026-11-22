import clsx from 'clsx';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  HandCoins,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { formatDate, formatTime } from '../lib/dates';
import { formatMoney } from '../lib/format';
import type { Transaction, TxType } from '../lib/types';

const PLUS: TxType[] = ['INCOME', 'TRANSFER_IN', 'DEBT_BORROWED', 'DEBT_COLLECTED'];

export function txVisual(type: TxType) {
  if (type === 'INCOME') return { Icon: ArrowDownLeft, c: 'bg-emerald-500/10 text-emerald-500' };
  if (type === 'EXPENSE') return { Icon: ArrowUpRight, c: 'bg-rose-500/10 text-rose-500' };
  if (type.startsWith('TRANSFER')) return { Icon: ArrowLeftRight, c: 'bg-blue-500/10 text-blue-500' };
  return { Icon: HandCoins, c: 'bg-amber-500/10 text-amber-500' };
}

export function TxAmount({ t: tx, className }: { t: Transaction; className?: string }) {
  const plus = PLUS.includes(tx.type);
  const pnl = tx.type === 'INCOME' || tx.type === 'EXPENSE';
  return (
    <span
      className={clsx(
        'num whitespace-nowrap font-bold',
        pnl ? (plus ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : 'text-slate-500 dark:text-slate-400',
        className,
      )}
    >
      {plus ? '+' : '−'}
      {formatMoney(tx.amount, tx.currency)}
    </span>
  );
}

function label(tx: Transaction, t: ReturnType<typeof useI18n>['t']) {
  if (tx.category) return tx.category.name;
  if (tx.debt) return tx.debt.counterparty;
  if (tx.type === 'INCOME' || tx.type === 'EXPENSE') return t('noCategory');
  return t(`tx_${tx.type}`);
}

/** Ҷадвали амалиётҳо: Сана | Намуд | Категория | Маблағ | Ҳисоб | Шарҳ | Амалҳо */
export function TxTable({
  items,
  onEdit,
  onDelete,
  compact,
}: {
  items: Transaction[];
  onEdit?: (t: Transaction) => void;
  onDelete?: (t: Transaction) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const hasActions = !!(onEdit || onDelete);
  return (
    <>
      {/* Desktop */}
      <div className="scrollbar-thin hidden overflow-x-auto md:block">
        <table className="w-full">
          <thead className="border-b border-slate-100 dark:border-white/[0.06]">
            <tr>
              <th className="th">{t('date')}</th>
              <th className="th">{t('type')}</th>
              <th className="th">{t('category')}</th>
              <th className="th text-right">{t('amount')}</th>
              <th className="th">{t('account')}</th>
              {!compact && <th className="th">{t('note')}</th>}
              {hasActions && <th className="th text-right">{t('actions')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {items.map((tx) => {
              const { Icon, c } = txVisual(tx.type);
              const editable = tx.type === 'INCOME' || tx.type === 'EXPENSE';
              return (
                <tr key={tx.id} className="transition hover:bg-slate-50/80 dark:hover:bg-white/[0.02]">
                  <td className="td whitespace-nowrap">
                    <div className="font-medium">{formatDate(tx.occurredAt)}</div>
                    <div className="text-xs text-slate-500">{formatTime(tx.occurredAt)}</div>
                  </td>
                  <td className="td">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className={clsx('grid h-7 w-7 place-items-center rounded-lg', c)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-xs font-medium">{t(`tx_${tx.type}`)}</span>
                    </span>
                  </td>
                  <td className="td">
                    <span className="flex items-center gap-2">
                      {tx.category && <span className="h-2 w-2 rounded-full" style={{ background: tx.category.color }} />}
                      <span className="max-w-[180px] truncate">{label(tx, t)}</span>
                    </span>
                  </td>
                  <td className="td text-right">
                    <TxAmount t={tx} />
                  </td>
                  <td className="td">
                    <span className="flex items-center gap-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      <span className="h-2 w-2 rounded-full" style={{ background: tx.account?.color }} />
                      {tx.account?.name}
                    </span>
                  </td>
                  {!compact && (
                    <td className="td max-w-[240px] truncate text-slate-500" title={tx.note ?? ''}>
                      {tx.source || tx.purpose || tx.note || '—'}
                    </td>
                  )}
                  {hasActions && (
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        {onEdit && editable && (
                          <button onClick={() => onEdit(tx)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-500/10 hover:text-brand-500" title={t('edit')}>
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {onDelete && !tx.debtId && (
                          <button onClick={() => onDelete(tx)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500" title={t('delete')}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Mobile */}
      <ul className="divide-y divide-slate-100 dark:divide-white/[0.04] md:hidden">
        {items.map((tx) => {
          const { Icon, c } = txVisual(tx.type);
          const editable = tx.type === 'INCOME' || tx.type === 'EXPENSE';
          return (
            <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', c)}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1" onClick={() => editable && onEdit?.(tx)}>
                <p className="truncate text-sm font-semibold">{label(tx, t)}</p>
                <p className="truncate text-xs text-slate-500">
                  {formatDate(tx.occurredAt)} {formatTime(tx.occurredAt)} · {tx.account?.name}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <TxAmount t={tx} className="text-sm" />
                {onDelete && !tx.debtId && (
                  <button onClick={() => onDelete(tx)} className="text-slate-400 hover:text-rose-500" aria-label={t('delete')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
