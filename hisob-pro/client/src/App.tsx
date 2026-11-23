import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppLayout } from './components/layout/AppLayout';
import { PageLoader } from './components/ui/misc';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/auth/AuthPages';
import { WifiOff } from 'lucide-react';
import { useI18n } from './i18n';
import { Button } from './components/ui/Button';

/** Интернет нест — маълумоти кӯҳна нишон дода намешавад (рақамҳо ҳамеша аз сервер) */
function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  // Вақте интернет баргашт — худкор идома медиҳем (ва ҳар 10 сония кӯшиш мекунем)
  useEffect(() => {
    window.addEventListener('online', onRetry);
    const id = setInterval(onRetry, 10_000);
    return () => {
      window.removeEventListener('online', onRetry);
      clearInterval(id);
    };
  }, [onRetry]);
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/10 text-amber-500">
          <WifiOff className="h-7 w-7" />
        </div>
        <p className="text-lg font-bold">{t('offlineTitle')}</p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">{t('offlineText')}</p>
        <Button className="mt-6" onClick={onRetry}>{t('retry')}</Button>
      </div>
    </div>
  );
}

const Dashboard = lazy(() => import('./pages/Dashboard'));
const KindPage = lazy(() => import('./pages/KindPage'));
const History = lazy(() => import('./pages/History'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Debts = lazy(() => import('./pages/Debts'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Protected({ children }: { children: ReactNode }) {
  const { user, loading, offline, retry } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><PageLoader /></div>;
  if (offline) return <OfflineScreen onRetry={retry} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center"><PageLoader /></div>;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<Protected><AppLayout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="income" element={<KindPage key="inc" kind="INCOME" />} />
          <Route path="expenses" element={<KindPage key="exp" kind="EXPENSE" />} />
          <Route path="history" element={<History />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="debts" element={<Debts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
