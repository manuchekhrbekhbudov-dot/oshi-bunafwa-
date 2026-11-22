import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, User as UserIcon, CheckCircle2, ShieldCheck } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useI18n } from '../../i18n';
import { useAuth } from '../../hooks/useAuth';
import { api, ApiError } from '../../lib/api';

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

/** Оё сабти ном кушода аст? (платформаи шахсӣ — танҳо ҳисоби аввал) */
function useRegistrationOpen() {
  const q = useQuery({
    queryKey: ['registration'],
    queryFn: () => api.get<{ open: boolean }>('/auth/registration'),
    staleTime: 30_000,
  });
  return q.data?.open;
}

function FormError({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400">{msg}</div>;
}

export function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const registrationOpen = useRegistrationOpen();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(email, password);
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
        <Field label={t('email')}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} leading={<Mail className="h-4 w-4" />} autoComplete="email" required />
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
        {registrationOpen && (
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

export function RegisterPage() {
  const { t } = useI18n();
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const registrationOpen = useRegistrationOpen();
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
    <AuthLayout title={t('register')} subtitle={registrationOpen === false ? undefined : t('registerSubtitle')}>
      {registrationOpen === false ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-2xl bg-brand-500/10 p-4 text-sm text-brand-700 dark:text-brand-200">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            {t('registrationClosed')}
          </div>
          <Link to="/login" className="block text-center text-sm font-semibold text-brand-500">
            {t('backToLogin')}
          </Link>
        </div>
      ) : (
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
        <p className="text-center text-sm text-slate-500">
          {t('haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-brand-500 hover:underline">
            {t('login')}
          </Link>
        </p>
      </form>
      )}
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthLayout title={t('resetTitle')} subtitle={t('resetSubtitle')}>
      {sent ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            {t('resetSent')}
          </div>
          <Link to="/login" className="block text-center text-sm font-semibold text-brand-500">
            {t('backToLogin')}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <FormError msg={err} />
          <Field label={t('email')}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} leading={<Mail className="h-4 w-4" />} required />
          </Field>
          <Button type="submit" size="lg" className="w-full justify-center" loading={loading}>
            {t('sendLink')}
          </Button>
          <Link to="/login" className="block text-center text-sm font-semibold text-brand-500">
            {t('backToLogin')}
          </Link>
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
