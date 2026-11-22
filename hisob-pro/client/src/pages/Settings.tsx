import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { Coins, KeyRound, LogOut, Moon, Palette, Plus, Sun, Tags, Trash2, User as UserIcon, Pencil, Check, X, Send, ExternalLink, BellRing } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useCategories, useRates, useInvalidateFinance } from '../hooks/queries';
import { Card, CardHeader, PageHeader, Segmented, Badge } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/Field';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import type { Category, CategoryKind, Currency, Lang, User } from '../lib/types';

function ProfileCard() {
  const { t, setLang } = useI18n();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const qc = useQueryClient();
  const [name, setName] = useState(user?.name ?? '');
  const [language, setLanguage] = useState<Lang>(user?.language ?? 'tg');
  const [baseCurrency, setBase] = useState<Currency>(user?.baseCurrency ?? 'TJS');
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.patch<{ user: User }>('/auth/profile', { name, language, baseCurrency });
      setUser(r.user);
      setLang(r.user.language);
      await invalidate();
      await qc.invalidateQueries({ queryKey: ['rates'] });
      toast(t('saved'));
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card>
      <CardHeader title={t('profile')} icon={<UserIcon className="h-4 w-4" />} subtitle={user ? `${t('memberSince')} ${formatDate(user.createdAt)}` : undefined} />
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label={t('name')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('email')}><Input value={user?.email ?? ''} disabled /></Field>
        <Field label={t('language')}>
          <Select value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
            <option value="tg">Тоҷикӣ</option>
            <option value="ru">Русский</option>
          </Select>
        </Field>
        <Field label={t('baseCurrency')}>
          <Select value={baseCurrency} onChange={(e) => setBase(e.target.value as Currency)}>
            <option value="TJS">TJS — сомонӣ</option>
            <option value="USD">USD</option>
            <option value="RUB">RUB</option>
          </Select>
        </Field>
        <div className="sm:col-span-2"><Button type="submit" loading={loading}>{t('save')}</Button></div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [conf, setConf] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (next !== conf) return setErrors({ confirm: t('passwordsMismatch') });
    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword: cur, newPassword: next });
      toast(t('passwordChanged'));
      setCur(''); setNext(''); setConf('');
    } catch (err) {
      if (err instanceof ApiError) {
        const f = { ...err.fields };
        if (f.newPassword) f.password = f.newPassword;
        setErrors(f);
        if (!Object.keys(err.fields).length) toast(err.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card>
      <CardHeader title={t('changePassword')} icon={<KeyRound className="h-4 w-4" />} />
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label={t('currentPassword')} error={errors.currentPassword}><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" invalid={!!errors.currentPassword} /></Field>
        <Field label={t('newPassword')} error={errors.password} hint={t('passwordRule')}><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" invalid={!!errors.password} /></Field>
        <Field label={t('confirmPassword')} error={errors.confirm}><Input type="password" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="new-password" invalid={!!errors.confirm} /></Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={loading}>{t('changePassword')}</Button>
          <Button type="button" variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={async () => { await api.post('/auth/logout-all').catch(() => undefined); await logout(); }}>
            {t('logoutAll')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function RatesCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const rates = useRates();
  const invalidate = useInvalidateFinance();
  const qc = useQueryClient();
  const base = user?.baseCurrency ?? 'TJS';
  const others = (['TJS', 'USD', 'RUB'] as Currency[]).filter((c) => c !== base);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!rates.data) return;
    const v: Record<string, string> = {};
    for (const r of rates.data.rates) v[r.currency] = String(Number(r.rate));
    setValues(v);
  }, [rates.data]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      const payload: Record<string, string | null> = {};
      for (const c of others) payload[c] = values[c]?.trim() ? values[c].trim().replace(',', '.') : null;
      await api.put('/rates', { rates: payload });
      await qc.invalidateQueries({ queryKey: ['rates'] });
      await invalidate();
      toast(t('saved'));
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); toast(err.message, 'error'); }
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card>
      <div id="rates" />
      <CardHeader title={t('exchangeRates')} subtitle={t('ratesHint')} icon={<Coins className="h-4 w-4" />} />
      <form onSubmit={submit} className="space-y-4 p-5">
        {others.map((c) => (
          <Field key={c} label={`1 ${c} =`} error={errors[c]}>
            <Input inputMode="decimal" value={values[c] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))} trailing={base} placeholder="—" invalid={!!errors[c]} />
          </Field>
        ))}
        <Button type="submit" loading={loading}>{t('save')}</Button>
      </form>
    </Card>
  );
}

function CategoriesCard() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const invalidate = useInvalidateFinance();
  const [kind, setKind] = useState<CategoryKind>('EXPENSE');
  const cats = useCategories(kind);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#8b5cf6');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleting, setDeleting] = useState<Category | null>(null);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['categories'] });
    await invalidate();
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post('/categories', { name, kind, color });
      setName('');
      await refresh();
      toast(t('saved'));
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };
  const rename = async (c: Category) => {
    try {
      await api.patch(`/categories/${c.id}`, { name: editName });
      setEditId(null);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };
  return (
    <Card>
      <CardHeader title={t('categories')} icon={<Tags className="h-4 w-4" />} action={
        <Segmented value={kind} onChange={setKind} options={[{ value: 'EXPENSE', label: t('tx_EXPENSE') }, { value: 'INCOME', label: t('tx_INCOME') }]} />
      } />
      <div className="p-5">
        <form onSubmit={add} className="mb-4 flex gap-2">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-11 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-transparent p-1 dark:border-white/10" aria-label={t('color')} />
          <Input placeholder={t('newCategory')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <Button type="submit" icon={<Plus className="h-4 w-4" />} disabled={!name.trim()}>{t('add')}</Button>
        </form>
        <ul className="divide-y divide-slate-100 dark:divide-white/[0.05]">
          {cats.data?.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
              {editId === c.id ? (
                <>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" autoFocus />
                  <button onClick={() => rename(c)} className="rounded-lg p-2 text-emerald-500 hover:bg-emerald-500/10"><Check className="h-4 w-4" /></button>
                  <button onClick={() => setEditId(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{c.name}</span>
                  {c.isSystem && <Badge>default</Badge>}
                  <button onClick={() => { setEditId(c.id); setEditName(c.name); }} className="rounded-lg p-2 text-slate-400 hover:bg-brand-500/10 hover:text-brand-500"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => setDeleting(c)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        text={deleting ? `«${deleting.name}». ${t('categoryDeleteNote')}` : undefined}
        onConfirm={async () => {
          try {
            await api.del(`/categories/${deleting!.id}`);
            await refresh();
            toast(t('deleted'));
          } catch (err) {
            toast(err instanceof Error ? err.message : String(err), 'error');
          }
          setDeleting(null);
        }}
      />
    </Card>
  );
}

interface TgSettings {
  enabled: boolean;
  botUsername: string | null;
  linked: boolean;
  username: string | null;
  onboarding: boolean;
  notifyDaily: boolean;
  dailyLimit: string | null;
  monthlyIncome: string | null;
  effectiveLimit: { value: string; basis: 'manual' | 'income' | 'average' } | null;
}

function TelegramCard() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['telegram'],
    queryFn: () => api.get<TgSettings>('/telegram/settings'),
    // То корбар дар Telegram "Start" пахш кунад, ҳолатро нав мекунем
    refetchInterval: (query) => (query.state.data && !query.state.data.linked ? 5000 : query.state.data?.onboarding ? 5000 : false),
  });
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState('');
  const [income, setIncome] = useState('');
  const [unlinking, setUnlinking] = useState(false);
  const d = q.data;
  useEffect(() => {
    if (!d) return;
    setLimit(d.dailyLimit ? String(Number(d.dailyLimit)) : '');
    setIncome(d.monthlyIncome ? String(Number(d.monthlyIncome)) : '');
    if (d.linked) setUrl(null);
  }, [d?.dailyLimit, d?.monthlyIncome, d?.linked]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['telegram'] });
  const connect = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ url: string }>('/telegram/link');
      setUrl(r.url);
      window.open(r.url, '_blank', 'noopener');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const save = async (patch: Record<string, unknown>) => {
    try {
      await api.patch('/telegram/settings', patch);
      await refresh();
      toast(t('saved'));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <Card>
      <CardHeader title={t('tgTitle')} subtitle={t('tgSubtitle')} icon={<Send className="h-4 w-4" />} />
      <div className="space-y-4 p-5">
        {!d ? null : !d.enabled ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">{t('tgDisabled')}</p>
        ) : !d.linked ? (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('tgFeatures')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={connect} loading={busy} icon={<Send className="h-4 w-4" />}>{t('tgConnect')}</Button>
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Button variant="secondary" icon={<ExternalLink className="h-4 w-4" />}>{t('tgOpen')}</Button>
                </a>
              )}
            </div>
            {url && <p className="text-xs text-slate-500">{t('tgOpenHint')}</p>}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="green">● {t('tgLinked')}</Badge>
              {d.username && <span className="text-sm font-semibold">@{d.username}</span>}
              {d.botUsername && (
                <a href={`https://t.me/${d.botUsername}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-500 hover:underline">
                  @{d.botUsername}
                </a>
              )}
            </div>
            {d.onboarding && <p className="rounded-xl bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">{t('tgOnboarding')}</p>}
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-white/10">
              <span className="flex items-center gap-2 text-sm font-medium"><BellRing className="h-4 w-4 text-brand-500" />{t('tgDaily')}</span>
              <input type="checkbox" className="h-5 w-5 accent-violet-600" checked={d.notifyDaily} onChange={(e) => save({ notifyDaily: e.target.checked })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('tgDailyLimit')} hint={t('tgDailyLimitHint')}>
                <Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="auto" trailing="смн" />
              </Field>
              <Field label={t('tgMonthlyIncome')}>
                <Input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="—" trailing="смн" />
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              {t('tgEffective')}:{' '}
              <b className="text-slate-800 dark:text-slate-200">
                {d.effectiveLimit ? `${d.effectiveLimit.value} смн` : t('tgNoLimit')}
              </b>
              {d.effectiveLimit && ` (${t(`tgBasis_${d.effectiveLimit.basis}`)})`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save({ dailyLimit: limit.trim() || null, monthlyIncome: income.trim() || null })}>{t('save')}</Button>
              <Button variant="ghost" onClick={() => setUnlinking(true)}>{t('tgUnlink')}</Button>
            </div>
          </>
        )}
      </div>
      <ConfirmDialog
        open={unlinking}
        onClose={() => setUnlinking(false)}
        text={t('tgUnlink') + '?'}
        onConfirm={async () => {
          await api.del('/telegram/link').catch(() => undefined);
          setUnlinking(false);
          await refresh();
        }}
      />
    </Card>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  useEffect(() => {
    if (location.hash === '#rates') setTimeout(() => document.getElementById('rates')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [location.hash]);
  return (
    <div className="space-y-6">
      <PageHeader title={t('settingsTitle')} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <ProfileCard />
          <Card>
            <CardHeader title={t('theme')} icon={<Palette className="h-4 w-4" />} action={
              <Segmented value={theme} onChange={setTheme} options={[
                { value: 'dark', label: <span className="flex items-center gap-1"><Moon className="h-3.5 w-3.5" />{t('dark')}</span> },
                { value: 'light', label: <span className="flex items-center gap-1"><Sun className="h-3.5 w-3.5" />{t('light')}</span> },
              ]} />
            } />
            <div className="h-5" />
          </Card>
          <PasswordCard />
        </div>
        <div className="space-y-6">
          <TelegramCard />
          <RatesCard />
          <CategoriesCard />
        </div>
      </div>
    </div>
  );
}
