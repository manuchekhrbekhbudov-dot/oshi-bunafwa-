import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AlertCircle, ChevronLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react';
import { Button } from './Button';
import { useI18n } from '../../i18n';
import { formatMoney } from '../../lib/format';
import type { Currency } from '../../lib/types';
import Decimal from 'decimal.js';
import { Link } from 'react-router-dom';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('card', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
      <div className="flex items-center gap-3">
        {icon && <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500/10 text-brand-500">{icon}</span>}
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-brand-500', className)} />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/[0.06]', className)} />;
}

export function EmptyState({ title, hint, action, icon }: { title?: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-500">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <p className="font-semibold">{title ?? t('noData')}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hint ?? t('noDataHint')}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-500">
        <AlertCircle className="h-6 w-6" />
      </div>
      <p className="font-semibold">{t('error')}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{error instanceof Error ? error.message : String(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

const badgeColors = {
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  red: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20',
  violet: 'bg-brand-500/10 text-brand-600 dark:text-brand-300 ring-brand-500/20',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  gray: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20',
};

export function Badge({ color = 'gray', children, className }: { color?: keyof typeof badgeColors; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', badgeColors[color], className)}>
      {children}
    </span>
  );
}

export function Money({
  value,
  currency = 'TJS',
  sign,
  colored,
  className,
}: {
  value: string;
  currency?: Currency;
  sign?: boolean;
  colored?: boolean;
  className?: string;
}) {
  let tone = '';
  if (colored) {
    const d = new Decimal(value || 0);
    tone = d.gt(0) ? 'text-emerald-600 dark:text-emerald-400' : d.lt(0) ? 'text-rose-600 dark:text-rose-400' : '';
  }
  return <span className={clsx('num whitespace-nowrap', tone, className)}>{formatMoney(value, currency, { sign })}</span>;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={clsx('scrollbar-thin inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-white/[0.05]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition',
            value === o.value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-brand-600 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (p: number) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-white/[0.06] sm:flex-row">
      <span>
        {t('found')}: <b className="text-slate-800 dark:text-slate-200">{total}</b>
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="icon" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="prev">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2">
          {t('page')} <b className="text-slate-800 dark:text-slate-200">{page}</b> {t('of')} {pages}
        </span>
        <Button variant="secondary" size="icon" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="next">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function MissingRatesNote({ currencies }: { currencies: string[] }) {
  const { t } = useI18n();
  if (!currencies.length) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {t('missingRates', { c: currencies.join(', ') })}{' '}
        <Link to="/settings#rates" className="font-semibold underline">
          {t('setRates')}
        </Link>
      </span>
    </div>
  );
}
