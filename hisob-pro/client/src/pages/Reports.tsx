import { useState } from 'react';
import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Hash, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useI18n } from '../i18n';
import { useDaily, usePeriod } from '../hooks/queries';
import { Card, CardHeader, EmptyState, ErrorState, MissingRatesNote, Money, PageHeader, Segmented, Skeleton } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { TxTable } from '../components/TxTable';
import { CategoryBars, CategoryDonut, IncomeExpenseBars } from '../components/charts/Charts';
import { download } from '../lib/api';
import { formatDay, monthEnd, monthStart, seriesLabel, shiftDay, todayKey, weekStart } from '../lib/dates';
import { formatMoney } from '../lib/format';
import type { Currency, Summary } from '../lib/types';

function ExportButtons({ params }: { params: Record<string, string | undefined> }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (format: string) => {
    setBusy(format);
    try {
      await download('/reports/export', { ...params, format });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Button size="sm" variant="secondary" loading={busy === 'pdf'} icon={<FileText className="h-4 w-4" />} onClick={() => run('pdf')}>PDF</Button>
      <Button size="sm" variant="secondary" loading={busy === 'xlsx'} icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => run('xlsx')}>Excel</Button>
      <Button size="sm" variant="secondary" loading={busy === 'csv'} icon={<Download className="h-4 w-4" />} onClick={() => run('csv')}>CSV</Button>
    </>
  );
}

function CurrencySelect({ value, onChange, base }: { value: string; onChange: (v: string) => void; base: Currency }) {
  const { t } = useI18n();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-auto text-xs" title={t('viewCurrency')}>
      <option value="">{t('allConverted', { c: base })}</option>
      <option value="TJS">TJS</option>
      <option value="USD">USD</option>
      <option value="RUB">RUB</option>
    </Select>
  );
}

function SummaryCards({ s, labels, extra }: { s: Summary; labels: [string, string, string]; extra: { label: string; value: string; icon: typeof Hash }[] }) {
  const c = s.viewCurrency;
  const items = [
    { label: labels[0], node: <Money value={s.income} currency={c} />, icon: TrendingUp, tone: 'text-emerald-500 bg-emerald-500/10' },
    { label: labels[1], node: <Money value={s.expense} currency={c} />, icon: TrendingDown, tone: 'text-rose-500 bg-rose-500/10' },
    { label: labels[2], node: <Money value={s.net} currency={c} sign colored />, icon: Scale, tone: 'text-brand-500 bg-brand-500/10' },
    ...extra.map((e) => ({ label: e.label, node: <span className="num">{e.value}</span>, icon: e.icon, tone: 'text-blue-500 bg-blue-500/10' })),
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((x, i) => (
        <div key={i} className="card flex animate-fade-up items-center gap-4 p-5" style={{ animationDelay: `${i * 50}ms` }}>
          <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-xl', x.tone)}>
            <x.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{x.label}</p>
            <p className="truncate text-xl font-extrabold">{x.node}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyTab() {
  const { t, lang } = useI18n();
  const [date, setDate] = useState(todayKey());
  const [currency, setCurrency] = useState('');
  const q = useDaily(date, currency || undefined);
  const d = q.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => setDate(shiftDay(date, -1))} aria-label="prev"><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 w-auto" max={todayKey()} />
        <Button variant="secondary" size="icon" onClick={() => setDate(shiftDay(date, 1))} aria-label="next"><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setDate(todayKey())}>{t('today')}</Button>
        <CurrencySelect value={currency} onChange={setCurrency} base={d?.closingBalance.base ?? 'TJS'} />
        <div className="ml-auto flex gap-2">
          <ExportButtons params={{ kind: 'daily', date, currency: currency || undefined }} />
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CalendarDays className="h-4 w-4 text-brand-500" /> {formatDay(date, lang, true)}
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !d ? (
        <div className="grid gap-4 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <>
          <MissingRatesNote currencies={d.summary.missingRates} />
          <SummaryCards
            s={d.summary}
            labels={[t('dayIncome'), t('dayExpense'), t('dayNet')]}
            extra={[{ label: t('dayOps'), value: String(d.operationsCount), icon: Hash }]}
          />
          <div className="rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/5 px-4 py-3 text-center text-sm">
            <span className="text-slate-500">{t('dayFormula')}:</span>{' '}
            <b className="num">
              {formatMoney(d.summary.income, d.summary.viewCurrency)} − {formatMoney(d.summary.expense, d.summary.viewCurrency)} ={' '}
              <Money value={d.summary.net} currency={d.summary.viewCurrency} colored sign />
            </b>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title={t('dayTransactions')} subtitle={`${d.operationsCount} ${t('operations')}`} />
              <div className="mt-3">{d.transactions.length ? <TxTable items={d.transactions} /> : <EmptyState />}</div>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader title={t('byAccount')} icon={<Wallet className="h-4 w-4" />} />
                <div className="p-5">
                  <div className="mb-3 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.03]">
                      <p className="text-[10px] uppercase text-slate-500">{t('openingBalance')}</p>
                      <p className="num text-sm font-bold">{formatMoney(d.openingBalance.total, d.openingBalance.base)}</p>
                    </div>
                    <div className="rounded-xl bg-brand-500/10 p-3">
                      <p className="text-[10px] uppercase text-brand-500">{t('closingBalance')}</p>
                      <p className="num text-sm font-bold">{formatMoney(d.closingBalance.total, d.closingBalance.base)}</p>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {d.accounts.filter((a) => !a.archived).map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: a.color }} /><span className="truncate">{a.name}</span></span>
                        <span className="num text-right text-xs">
                          <span className="text-slate-500">{formatMoney(a.openingBalance, a.currency)}</span> → <b>{formatMoney(a.balance, a.currency)}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <MissingRatesNote currencies={d.closingBalance.missingRates} />
                </div>
              </Card>
              <Card>
                <CardHeader title={t('expenseByCategory')} />
                <div className="p-5">{d.expenseByCategory.length ? <CategoryBars data={d.expenseByCategory} currency={d.summary.viewCurrency} /> : <EmptyState />}</div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type P = 'week' | 'month' | 'year' | 'custom';

function rangeFor(p: P, anchor: string, custom: { from: string; to: string }) {
  if (p === 'week') { const s = weekStart(anchor); return { from: s, to: shiftDay(s, 6) }; }
  if (p === 'month') return { from: monthStart(anchor), to: monthEnd(anchor) };
  if (p === 'year') return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
  return custom;
}

function shiftAnchor(p: P, anchor: string, dir: 1 | -1) {
  if (p === 'week') return shiftDay(anchor, 7 * dir);
  if (p === 'month') { const [y, m] = anchor.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + dir, 1)); return d.toISOString().slice(0, 10); }
  if (p === 'year') return `${Number(anchor.slice(0, 4)) + dir}-01-01`;
  return anchor;
}

function PeriodTab() {
  const { t, lang } = useI18n();
  const [p, setP] = useState<P>('month');
  const [anchor, setAnchor] = useState(todayKey());
  const [custom, setCustom] = useState({ from: shiftDay(todayKey(), -29), to: todayKey() });
  const [granularity, setGranularity] = useState('');
  const [currency, setCurrency] = useState('');
  const range = rangeFor(p, anchor, custom);
  const q = usePeriod({ ...range, granularity: granularity || undefined, currency: currency || undefined });
  const r = q.data;
  const c = r?.summary.viewCurrency ?? 'TJS';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={p} onChange={(v) => { setP(v); setAnchor(todayKey()); }} options={[
          { value: 'week', label: t('p_week') }, { value: 'month', label: t('p_month') }, { value: 'year', label: t('p_year') }, { value: 'custom', label: t('p_custom') },
        ]} />
        {p !== 'custom' ? (
          <>
            <Button variant="secondary" size="icon" onClick={() => setAnchor(shiftAnchor(p, anchor, -1))} aria-label="prev"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[180px] text-center text-sm font-semibold">{formatDay(range.from, lang)} — {formatDay(range.to, lang)}</span>
            <Button variant="secondary" size="icon" onClick={() => setAnchor(shiftAnchor(p, anchor, 1))} aria-label="next"><ChevronRight className="h-4 w-4" /></Button>
          </>
        ) : (
          <>
            <Input type="date" value={custom.from} onChange={(e) => setCustom((x) => ({ ...x, from: e.target.value }))} className="h-9 w-auto" />
            <span className="text-slate-400">—</span>
            <Input type="date" value={custom.to} onChange={(e) => setCustom((x) => ({ ...x, to: e.target.value }))} className="h-9 w-auto" />
          </>
        )}
        <Select value={granularity} onChange={(e) => setGranularity(e.target.value)} className="h-9 w-auto text-xs" title={t('granularity')}>
          <option value="">{t('granularity')}: auto</option>
          <option value="day">{t('g_day')}</option>
          <option value="week">{t('g_week')}</option>
          <option value="month">{t('g_month')}</option>
        </Select>
        <CurrencySelect value={currency} onChange={setCurrency} base={c} />
        <div className="ml-auto flex gap-2">
          <ExportButtons params={{ kind: 'period', ...range, granularity: granularity || undefined, currency: currency || undefined }} />
        </div>
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !r ? (
        <div className="grid gap-4 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <>
          <MissingRatesNote currencies={r.summary.missingRates} />
          <SummaryCards s={r.summary} labels={[t('tx_INCOME'), t('tx_EXPENSE'), t('netLabel')]} extra={[{ label: t('countOps'), value: String(r.pnlCount), icon: Hash }]} />
          <Card>
            <CardHeader title={t('dynamics')} subtitle={`${t(`g_${r.granularity}`)} · ${c}`} />
            <div className="px-2 pb-4 pt-2"><IncomeExpenseBars series={r.series} currency={c} /></div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            {([['expenseByCategory', r.expenseByCategory], ['incomeByCategory', r.incomeByCategory]] as const).map(([k, data]) => (
              <Card key={k}>
                <CardHeader title={t(k)} />
                <div className="grid items-center gap-4 p-5 sm:grid-cols-2">
                  {data.length ? (<><CategoryDonut data={data} currency={c} height={180} /><CategoryBars data={data.slice(0, 6)} currency={c} /></>) : <div className="sm:col-span-2"><EmptyState /></div>}
                </div>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader title={t('table')} />
            <div className="scrollbar-thin mt-3 max-h-[480px] overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-white dark:bg-ink-900">
                  <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                    <th className="th">{t('period')}</th>
                    <th className="th text-right">{t('tx_INCOME')}</th>
                    <th className="th text-right">{t('tx_EXPENSE')}</th>
                    <th className="th text-right">{t('netLabel')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                  {r.series.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02]">
                      <td className="td font-medium">{r.granularity === 'week' ? `${seriesLabel(row.key, lang)} – ${seriesLabel(shiftDay(row.key, 6), lang)}` : seriesLabel(row.key, lang)}</td>
                      <td className="td text-right"><Money value={row.income} currency={c} className="text-emerald-600 dark:text-emerald-400" /></td>
                      <td className="td text-right"><Money value={row.expense} currency={c} className="text-rose-600 dark:text-rose-400" /></td>
                      <td className="td text-right font-bold"><Money value={row.net} currency={c} sign colored /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-50 font-bold dark:bg-ink-850">
                  <tr>
                    <td className="td">{t('total')}</td>
                    <td className="td text-right"><Money value={r.summary.income} currency={c} /></td>
                    <td className="td text-right"><Money value={r.summary.expense} currency={c} /></td>
                    <td className="td text-right"><Money value={r.summary.net} currency={c} sign colored /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'daily' | 'period'>('daily');
  return (
    <div>
      <PageHeader
        title={t('reportsTitle')}
        actions={<Segmented value={tab} onChange={setTab} options={[{ value: 'daily', label: t('dailyReport') }, { value: 'period', label: t('periodReport') }]} />}
      />
      {tab === 'daily' ? <DailyTab /> : <PeriodTab />}
    </div>
  );
}
