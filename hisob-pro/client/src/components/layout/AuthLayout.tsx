import type { ReactNode } from 'react';
import { BarChart3, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { Logo } from './Logo';
import { useI18n } from '../../i18n';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-[420px] w-[420px] rounded-full bg-blue-600/25 blur-3xl" />
        <div className="absolute bottom-24 left-24 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative my-auto max-w-lg">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">{t('heroTitle')}</h1>
          <p className="mt-4 text-lg text-slate-300">{t('heroText')}</p>
          <div className="mt-10 space-y-3">
            {[
              { i: BarChart3, k: 'heroF1' as const },
              { i: FileSpreadsheet, k: 'heroF2' as const },
              { i: ShieldCheck, k: 'heroF3' as const },
            ].map(({ i: Icon, k }) => (
              <div key={k} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-blue-600">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium">{t(k)}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-sm text-slate-400">© HISOB PRO · {t('appSlogan')}</p>
      </div>
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex rounded-xl bg-slate-100 p-1 text-xs font-bold dark:bg-white/[0.05]">
            {(['tg', 'ru'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-lg px-2.5 py-1 ${lang === l ? 'bg-white text-brand-600 shadow-sm dark:bg-brand-600 dark:text-white' : 'text-slate-500'}`}
              >
                {l === 'tg' ? 'Тоҷикӣ' : 'Русский'}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-auto my-auto w-full max-w-sm animate-fade-up py-10">
          <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
