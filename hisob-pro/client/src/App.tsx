import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppLayout } from './components/layout/AppLayout';
import { PageLoader } from './components/ui/misc';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/auth/AuthPages';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const KindPage = lazy(() => import('./pages/KindPage'));
const History = lazy(() => import('./pages/History'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Debts = lazy(() => import('./pages/Debts'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><PageLoader /></div>;
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
