import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, User as UserIcon, CheckCircle2, ShieldCheck, Send, Loader2 } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useI18n } from '../../i18n';
import { useAuth } from '../../hooks/useAuth';
import { api, ApiError } from '../../lib/api';
import type { User } from '../../lib/types';
import type { DictKey } from '../../i18n/dict';

function PasswordInput({ value, onChange, invalid, autoComplete }: { value: string; onChange: (v: string) => void; invalid?: boolean; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        invalid={invalid}
        leading={<Lock className="h-4 w-4" />}
        autoComplete={autoComplete}
        className="pr-11"
      />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-3 text-slate-400" aria-label="toggle password">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

interface RegistrationInfo {
  open: boolean;
  email: boolean;
  telegram: boolean;
  botUsername: string | null;
}

/** Кадом роҳи сабти ном кушода аст: email (соҳиби аввал), Telegram (дигарон) ё пӯшида */
function useRegistration() {
  return useQuery({
    queryKey: ['registration'],
    queryFn: () => api.get<RegistrationInfo>('/auth/registration'),
    staleTime: 30_000,
  }).data;
}

function FormError({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400">{msg}</div>;
}

export function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const nav = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const registration = useRegistration();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(loginId, password);
      nav('/', { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthLayout title={t('welcomeBack')} subtitle={t('loginSubtitle')}>
      <form onSubmit={submit} className="space-y-4">
        <FormError msg={err} />
        <Field label={t('loginId')}>
          <Input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            leading={<UserIcon className="h-4 w-4" />}
            placeholder={t('loginIdPh')}
            autoComplete="username"
            autoCapitalize="none"
            required
          />
        </Field>
        <Field label={t('password')}>
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <div className="text-right">
          <Link to="/forgot-password" className="text-xs font-semibold text-brand-500 hover:underline">
            {t('forgotPassword')}
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full justify-center" loading={loading}>
          {t('login')}
        </Button>
        {registration?.open && (
          <p className="text-center text-sm text-slate-500">
            {t('noAccount')}{' '}
            <Link to="/register" className="font-semibold text-brand-500 hover:underline">
              {t('register')}
            </Link>
          </p>
        )}
      </form>
    </AuthLayout>
  );
}

/** Корбари аввал (соҳиб) ё реҷаи open: ном + email + парол */
function EmailRegisterForm() {
  const { t } = useI18n();
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setFields({});
    setLoading(true);
    try {
      await register(name, email, password);
      nav('/', { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        if (!Object.keys(e.fields).length) setErr(e.message);
      } else setErr(String(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError msg={err} />
      <Field label={t('name')} error={fields.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} leading={<UserIcon className="h-4 w-4" />} autoComplete="name" invalid={!!fields.name} required />
      </Field>
      <Field label={t('email')} error={fields.email}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} leading={<Mail className="h-4 w-4" />} autoComplete="email" invalid={!!fields.email} required />
      </Field>
      <Field label={t('password')} error={fields.password} hint={t('passwordRule')}>
        <PasswordInput value={password} onChange={setPassword} invalid={!!fields.password} autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" className="w-full justify-center" loading={loading}>
        {t('register')}
      </Button>
    </form>
  );
}

type TgStatus = { status: 'waiting'; chatOpened: boolean } | { status: 'error'; code: string } | { status: 'done'; user: User };

/** Дигарон: ном + парол (+ email ихтиёрӣ) → тасдиқи рақам дар Telegram → воридшавии худкор */
function TelegramRegisterForm() {
  const { t, lang } = useI18n();
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [flow, setFlow] = useState<{ url: string; pollToken: string } | null>(null);
  const [chatOpened, setChatOpened] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setFields({});
    setLoading(true);
    try {
      const r = await api.post<{ url: string; pollToken: string }>('/auth/register/telegram', {
        name,
        password,
        email: email.trim() || null,
        language: lang,
      });
      setFlow(r);
      setChatOpened(false);
      window.open(r.url, '_blank', 'noopener');
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        if (!Object.keys(e.fields).length) setErr(e.message);
      } else setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  // То тасдиқ дар Telegram ҳар 2 сония месанҷем
  useEffect(() => {
    if (!flow) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api.get<TgStatus>('/auth/register/telegram/status', { token: flow.pollToken });
        if (stop) return;
        if (s.status === 'done') {
          stop = true;
          setUser(s.user);
          nav('/', { replace: true });
        } else if (s.status === 'error') {
          stop = true;
          setFlow(null);
          const key = `regErr_${s.code}` as DictKey;
          setErr(t(key) === key ? s.code : t(key));
        } else setChatOpened(s.chatOpened);
      } catch (e) {
        if (e instanceof ApiError && e.status === 410) {
          stop = true;
          setFlow(null);
          setErr(t('regTgExpired'));
        }
      }
    };
    const id = setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      stop = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.pollToken]);

  if (flow) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4">
          <p className="mb-3 flex items-center gap-2 font-bold">
            <Send className="h-5 w-5 text-brand-500" /> {t('regTgTitle')}
          </p>
          <ol className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            <li>1. {t('regTgStep1')}</li>
            <li>2. {t('regTgStep2')}</li>
            <li>3. {t('regTgStep3')}</li>
          </ol>
        </div>
        <a href={flow.url} target="_blank" rel="noopener noreferrer" className="block">
          <Button type="button" size="lg" className="w-full justify-center" icon={<Send className="h-4 w-4" />}>
            {t('regTgOpen')}
          </Button>
        </a>
        <p className="flex items-center justify-center gap-2 text-sm text-slate-500" data-testid="tg-status">
          <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
          {chatOpened ? t('regTgChatOpened') : t('regTgWaiting')}
        </p>
        <button type="button" onClick={() => setFlow(null)} className="block w-full text-center text-xs font-semibold text-slate-500 hover:text-brand-500">
          {t('regTgRestart')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError msg={err} />
      <div className="flex gap-2 rounded-xl bg-blue-500/10 px-3 py-2.5 text-xs text-blue-700 dark:text-blue-300">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        {t('regTgNote')}
      </div>
      <Field label={t('name')} error={fields.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} leading={<UserIcon className="h-4 w-4" />} autoComplete="name" invalid={!!fields.name} required />
      </Field>
      <Field label={t('password')} error={fields.password} hint={t('passwordRule')}>
        <PasswordInput value={password} onChange={setPassword} invalid={!!fields.password} autoComplete="new-password" />
      </Field>
      <Field label={t('emailOptional')} error={fields.email}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} leading={<Mail className="h-4 w-4" />} autoComplete="email" invalid={!!fields.email} />
      </Field>
      <Button type="submit" size="lg" className="w-full justify-center" loading={loading}>
        {t('regViaTelegram')}
      </Button>
    </form>
  );
}

export function RegisterPage() {
  const { t } = useI18n();
  const registration = useRegistration();
  const closed = registration && !registration.open;
  return (
    <AuthLayout title={t('register')} subtitle={closed ? undefined : t('registerSubtitle')}>
      {!registration ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      ) : closed ? (
        <div className="flex gap-3 rounded-2xl bg-brand-500/10 p-4 text-sm text-brand-700 dark:text-brand-200">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          {t('registrationClosed')}
        </div>
      ) : registration.email ? (
        <EmailRegisterForm />
      ) : (
        <TelegramRegisterForm />
      )}
      <p className="mt-6 text-center text-sm text-slate-500">
        {t('haveAccount')}{' '}
        <Link to="/login" className="font-semibold text-brand-500 hover:underline">
          {t('login')}
        </Link>
      </p>
    </AuthLayout>
  );
}

/**
 * Барқарорсозии парол бо код: 1) рақам/email → бот коди 6-рақама мефиристад;
 * 2) код + пароли нав → парол иваз мешавад ва корбар худкор ворид мешавад.
 */
export function ForgotPasswordPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [step, setStep] = useState<'login' | 'code'>('login');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const requestCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setErr('');
    try {
      await api.post('/auth/forgot-password', { login: loginId });
      setStep('code');
      setCode('');
      setInfo(t('resetSent'));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const resetWithCode = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setFields({});
    if (!/^\d{6}$/.test(code)) return setFields({ code: t('codeRule') });
    if (password !== confirm) return setFields({ confirm: t('passwordsMismatch') });
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { login: loginId, code, password });
      await login(loginId, password);
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        if (!Object.keys(e.fields).length) setErr(e.message);
      } else setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('resetTitle')} subtitle={step === 'login' ? t('resetSubtitle') : undefined}>
      {step === 'login' ? (
        <form onSubmit={requestCode} className="space-y-4">
          <FormError msg={err} />
          <Field label={t('loginId')}>
            <Input value={loginId} onChange={(e) => setLoginId(e.target.value)} leading={<UserIcon className="h-4 w-4" />} placeholder={t('loginIdPh')} autoCapitalize="none" required />
          </Field>
          <Button type="submit" size="lg" className="w-full justify-center" loading={loading} icon={<Send className="h-4 w-4" />}>
            {t('sendCode')}
          </Button>
          <Link to="/login" className="block text-center text-sm font-semibold text-brand-500">
            {t('backToLogin')}
          </Link>
        </form>
      ) : (
        <form onSubmit={resetWithCode} className="space-y-4" noValidate>
          {info && (
            <div className="flex gap-3 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              {info}
            </div>
          )}
          <FormError msg={err} />
          <Field label={t('codeLabel')} error={fields.code}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              invalid={!!fields.code}
              className="h-14 text-center text-2xl font-bold tracking-[0.5em]"
              aria-label={t('codeLabel')}
            />
          </Field>
          <Field label={t('newPassword')} error={fields.password} hint={t('passwordRule')}>
            <PasswordInput value={password} onChange={setPassword} invalid={!!fields.password} autoComplete="new-password" />
          </Field>
          <Field label={t('confirmPassword')} error={fields.confirm}>
            <PasswordInput value={confirm} onChange={setConfirm} invalid={!!fields.confirm} autoComplete="new-password" />
          </Field>
          <Button type="submit" size="lg" className="w-full justify-center" loading={loading}>
            {t('setPassword')}
          </Button>
          <div className="flex items-center justify-between text-sm font-semibold">
            <button type="button" className="text-brand-500 disabled:opacity-50" disabled={loading} onClick={() => requestCode()}>
              {t('resendCode')}
            </button>
            <Link to="/login" className="text-slate-500">
              {t('backToLogin')}
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setFields({});
    if (password !== confirm) return setFields({ confirm: t('passwordsMismatch') });
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        if (!Object.keys(e.fields).length) setErr(e.message);
      } else setErr(String(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthLayout title={t('newPasswordTitle')}>
      {done ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            {t('resetDone')}
          </div>
          <Link to="/login" className="block text-center text-sm font-semibold text-brand-500">
            {t('login')}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <FormError msg={err} />
          <Field label={t('newPassword')} error={fields.password} hint={t('passwordRule')}>
            <PasswordInput value={password} onChange={setPassword} invalid={!!fields.password} autoComplete="new-password" />
          </Field>
          <Field label={t('confirmPassword')} error={fields.confirm}>
            <PasswordInput value={confirm} onChange={setConfirm} invalid={!!fields.confirm} autoComplete="new-password" />
          </Field>
          <Button type="submit" size="lg" className="w-full justify-center" loading={loading} disabled={!token}>
            {t('setPassword')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
