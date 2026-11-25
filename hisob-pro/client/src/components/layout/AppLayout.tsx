import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  HandCoins,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings,
  Smartphone,
  Sun,
  Wallet,
  X, Target } from 'lucide-react';
import { useInstall } from '../../lib/pwa';
import { Logo } from './Logo';
import { useI18n } from '../../i18n';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { QuickAddProvider, useQuickAdd } from './QuickAdd';
import type { DictKey } from '../../i18n/dict';

const NAV: { section: DictKey; items: { to: string; key: DictKey; icon: typeof LayoutDashboard }[] }[] = [
  { section: 'nav_main', items: [{ to: '/', key: 'nav_dashboard', icon: LayoutDashboard }] },
  {
    section: 'nav_finance',
    items: [
      { to: '/income', key: 'nav_income', icon: ArrowDownLeft },
      { to: '/expenses', key: 'nav_expenses', icon: ArrowUpRight },
      { to: '/accounts', key: 'nav_accounts', icon: Wallet },
      { to: '/debts', key: 'nav_debts', icon: HandCoins },
      { to: '/plans', key: 'nav_plans', icon: Target },
    ],
  },
  {
    section: 'nav_analytics',
    items: [
      { to: '/history', key: 'nav_history', icon: History },
      { to: '/reports', key: 'nav_reports', icon: BarChart3 },
      { to: '/settings', key: 'nav_settings', icon: Settings },
    ],
  },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-6">
        <Logo />
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{t('appSlogan')}</p>
      </div>
      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV.map((g) => (
          <div key={g.section}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              {t(g.section)}
            </p>
            <div className="space-y-1">
              {g.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                      isActive
                        ? 'bg-gradient-to-r from-brand-600/90 to-blue-600/80 text-white shadow-glow'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-white',
                    )
                  }
                >
                  <i.icon className="h-[18px] w-[18px] shrink-0" />
                  {t(i.key)}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <InstallNavLink onNavigate={onNavigate} />
      <div className="border-t border-slate-200/70 p-3 dark:border-white/[0.06]">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 text-sm font-bold text-white">
            {user?.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="truncate text-[11px] text-slate-500">{user?.email ?? user?.phone}</p>
          </div>
          <button
            onClick={logout}
            title={t('logout')}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** «📲 Барнома дар телефон» — то насб нашудааст */
function InstallNavLink({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const inst = useInstall();
  if (inst.standalone) return null;
  return (
    <div className="px-3 pb-2">
      <NavLink
        to="/settings#app"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl border border-dashed border-brand-500/40 px-3 py-2.5 text-sm font-medium text-brand-600 transition hover:bg-brand-500/10 dark:text-brand-300"
      >
        <Smartphone className="h-[18px] w-[18px]" />
        {t('appTitle')}
      </NavLink>
    </div>
  );
}

function QuickAddButton() {
  const { t } = useI18n();
  const open = useQuickAdd();
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setShow(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const items = [
    { k: 'INCOME' as const, label: t('quickIncome'), icon: ArrowDownLeft, c: 'text-emerald-500 bg-emerald-500/10' },
    { k: 'EXPENSE' as const, label: t('quickExpense'), icon: ArrowUpRight, c: 'text-rose-500 bg-rose-500/10' },
    { k: 'TRANSFER' as const, label: t('quickTransfer'), icon: ArrowLeftRight, c: 'text-blue-500 bg-blue-500/10' },
  ];
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setShow((s) => !s)}
        className="flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 px-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 sm:px-4"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{t('add')}</span>
        <ChevronDown className="hidden h-3.5 w-3.5 opacity-70 sm:block" />
      </button>
      {show && (
        <div className="glass absolute right-0 top-12 z-40 w-52 animate-scale-in rounded-2xl p-1.5 shadow-2xl">
          {items.map((i) => (
            <button
              key={i.k}
              onClick={() => {
                setShow(false);
                open(i.k);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              <span className={clsx('grid h-8 w-8 place-items-center rounded-lg', i.c)}>
                <i.icon className="h-4 w-4" />
              </span>
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { lang, setLang, t } = useI18n();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const current = NAV.flatMap((g) => g.items).find((i) => (i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)));
  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0 pt-[env(safe-area-inset-top)]">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button onClick={onMenu} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10 lg:hidden" aria-label="menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="lg:hidden">
          <Logo compact />
        </div>
        <p className="hidden text-sm font-semibold text-slate-500 dark:text-slate-400 lg:block">
          {current ? t(current.key) : ''}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold dark:bg-white/[0.05]">
            {(['tg', 'ru'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={clsx(
                  'rounded-lg px-2 py-1 uppercase transition',
                  lang === l ? 'bg-white text-brand-600 shadow-sm dark:bg-brand-600 dark:text-white' : 'text-slate-500',
                )}
              >
                {l === 'tg' ? 'ТҶ' : 'РУ'}
              </button>
            ))}
          </div>
          <button
            onClick={toggle}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:text-brand-500 dark:border-white/10 dark:text-slate-300"
            aria-label="theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {/* Дар телефон тугмаи калони ➕ дар поён аст */}
          <div className="hidden lg:block">
            <QuickAddButton />
          </div>
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const { t } = useI18n();
  const items = [
    { to: '/', key: 'navs_home' as const, icon: LayoutDashboard },
    { to: '/income', key: 'navs_income' as const, icon: ArrowDownLeft },
    { to: '/expenses', key: 'navs_expenses' as const, icon: ArrowUpRight },
    { to: '/history', key: 'navs_history' as const, icon: History },
    { to: '/reports', key: 'navs_reports' as const, icon: BarChart3 },
  ];
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.to === '/'}
          className={({ isActive }) =>
            clsx('flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold', isActive ? 'text-brand-500' : 'text-slate-500')
          }
        >
          <i.icon className="h-5 w-5" />
          <span className="max-w-full truncate px-1">{t(i.key)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Тугмаи калони ➕ дар телефон (бо як даст): Даромад / Хароҷот / Интиқол */
function MobileFab() {
  const { t } = useI18n();
  const open = useQuickAdd();
  const [show, setShow] = useState(false);
  const items = [
    { k: 'INCOME' as const, label: t('quickIncome'), icon: ArrowDownLeft, c: 'bg-emerald-500' },
    { k: 'EXPENSE' as const, label: t('quickExpense'), icon: ArrowUpRight, c: 'bg-rose-500' },
    { k: 'TRANSFER' as const, label: t('quickTransfer'), icon: ArrowLeftRight, c: 'bg-blue-500' },
  ];
  return (
    <div className="lg:hidden">
      {show && <div className="fixed inset-0 z-30 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={() => setShow(false)} />}
      <div className="fixed right-4 z-40 flex flex-col items-end gap-3" style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        {show &&
          items.map((i, idx) => (
            <button
              key={i.k}
              onClick={() => {
                setShow(false);
                open(i.k);
              }}
              className="flex animate-fade-up items-center gap-3"
              style={{ animationDelay: `${(items.length - idx) * 40}ms` }}
            >
              <span className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-lg dark:bg-ink-800 dark:text-slate-100">
                {i.label}
              </span>
              <span className={clsx('grid h-12 w-12 place-items-center rounded-full text-white shadow-lg', i.c)}>
                <i.icon className="h-5 w-5" />
              </span>
            </button>
          ))}
        <button
          onClick={() => setShow((v) => !v)}
          aria-label={t('fabAdd')}
          className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-blue-600 text-white shadow-glow transition active:scale-95"
        >
          <Plus className={clsx('h-6 w-6 transition-transform duration-200', show && 'rotate-45')} />
        </button>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname]);
  // Саҳифаи нав ҳамеша аз боло кушода мешавад (на аз ҷое, ки саҳифаи қаблӣ scroll шуда буд)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <QuickAddProvider>
      <div className="min-h-screen lg:pl-72">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-white/[0.06] dark:bg-ink-900/60 lg:block">
          <SidebarContent />
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 animate-slide-in bg-white pt-[env(safe-area-inset-top)] shadow-2xl dark:bg-ink-900">
              <button onClick={() => setDrawer(false)} className="absolute right-3 top-5 rounded-lg p-2 text-slate-400" aria-label="close">
                <X className="h-5 w-5" />
              </button>
              <SidebarContent onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}
        <Topbar onMenu={() => setDrawer(true)} />
        <main className="mx-auto max-w-[1400px] px-4 pb-40 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          <Outlet />
        </main>
        <MobileFab />
        <BottomNav />
      </div>
    </QuickAddProvider>
  );
}
