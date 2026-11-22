import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n } from '../../i18n';
import { compact, formatMoney } from '../../lib/format';
import { seriesLabel } from '../../lib/dates';
import { useTheme } from '../../hooks/useTheme';
import type { CategoryShare, Currency, SeriesPoint } from '../../lib/types';

// Рақамҳо танҳо барои кашидани график ба Number табдил дода мешаванд; tooltip сатри аслиро нишон медиҳад.
function toData(series: SeriesPoint[], lang: 'tg' | 'ru') {
  return series.map((p) => ({
    label: seriesLabel(p.key, lang),
    income: Number(p.income),
    expense: Number(p.expense),
    net: Number(p.net),
    raw: p,
  }));
}

function ChartTooltip({ active, payload, currency }: { active?: boolean; payload?: { payload: { label: string; raw: SeriesPoint } }[]; currency: Currency }) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-bold">{d.label}</p>
      <p className="flex justify-between gap-6 text-emerald-500">
        <span>{t('tx_INCOME')}</span>
        <b className="num">{formatMoney(d.raw.income, currency)}</b>
      </p>
      <p className="flex justify-between gap-6 text-rose-500">
        <span>{t('tx_EXPENSE')}</span>
        <b className="num">{formatMoney(d.raw.expense, currency)}</b>
      </p>
      <p className="mt-1 flex justify-between gap-6 border-t border-slate-200 pt-1 dark:border-white/10">
        <span>{t('netLabel')}</span>
        <b className="num">{formatMoney(d.raw.net, currency, { sign: true })}</b>
      </p>
    </div>
  );
}

function useAxis() {
  const { theme } = useTheme();
  return {
    tick: { fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 11 },
    grid: theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#eef2f7',
  };
}

export function IncomeExpenseArea({ series, currency, height = 280 }: { series: SeriesPoint[]; currency: Currency; height?: number }) {
  const { lang } = useI18n();
  const axis = useAxis();
  const data = toData(series, lang);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={axis.grid} vertical={false} />
        <XAxis dataKey="label" tick={axis.tick} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis tick={axis.tick} axisLine={false} tickLine={false} tickFormatter={compact} width={52} />
        <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: '#8b5cf6', strokeOpacity: 0.3 }} />
        <Area type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2.5} fill="url(#gInc)" animationDuration={700} />
        <Area type="monotone" dataKey="expense" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#gExp)" animationDuration={700} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function IncomeExpenseBars({ series, currency, height = 300 }: { series: SeriesPoint[]; currency: Currency; height?: number }) {
  const { lang, t } = useI18n();
  const axis = useAxis();
  const data = toData(series, lang);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={axis.grid} vertical={false} />
        <XAxis dataKey="label" tick={axis.tick} axisLine={false} tickLine={false} minTickGap={8} />
        <YAxis tick={axis.tick} axisLine={false} tickLine={false} tickFormatter={compact} width={52} />
        <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
          formatter={(v) => (v === 'income' ? t('tx_INCOME') : t('tx_EXPENSE'))}
        />
        <Bar dataKey="income" fill="#22c55e" radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={600} />
        <Bar dataKey="expense" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={600} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ data, currency, height = 220 }: { data: CategoryShare[]; currency: Currency; height?: number }) {
  const { t } = useI18n();
  const chart = data.map((c) => ({ ...c, value: Number(c.amount), name: c.name === '—' ? t('noCategory') : c.name }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={chart} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none" animationDuration={700}>
          {chart.map((c, i) => (
            <Cell key={i} fill={c.color} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl">
                <p className="font-bold">{payload[0].name}</p>
                <p className="num">
                  {formatMoney((payload[0].payload as CategoryShare).amount, currency)} · {(payload[0].payload as CategoryShare).share}%
                </p>
              </div>
            ) : null
          }
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CategoryBars({ data, currency }: { data: CategoryShare[]; currency: Currency }) {
  const { t } = useI18n();
  if (!data.length) return null;
  return (
    <div className="space-y-3">
      {data.map((c) => (
        <div key={c.categoryId ?? 'none'}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
              <span className="truncate font-medium">{c.name === '—' ? t('noCategory') : c.name}</span>
            </span>
            <span className="num shrink-0 text-xs text-slate-500">
              <b className="text-slate-800 dark:text-slate-200">{formatMoney(c.amount, currency)}</b> · {c.share}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c.share}%`, background: c.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
