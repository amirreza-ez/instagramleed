import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import { ApiError, initApi } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { AuthPage } from './pages/Auth';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Leads = lazy(() => import('./pages/Leads'));
const LeadDetail = lazy(() => import('./pages/LeadDetail'));
const Imports = lazy(() => import('./pages/Imports'));
const Discovery = lazy(() => import('./pages/Discovery'));
const Campaigns = lazy(() => import('./pages/Campaigns'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Reports = lazy(() => import('./pages/Reports'));
const Integrations = lazy(() => import('./pages/Integrations'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Billing = lazy(() => import('./pages/Billing'));
const Admin = lazy(() => import('./pages/Admin'));

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => n < 2 && !(e instanceof ApiError && e.status >= 400 && e.status < 500), refetchOnWindowFocus: false },
  },
});

function Protected() {
  const { me, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center"><Loading label="در حال آماده‌سازی…" /></div>;
  if (!me) return <Navigate to="/login" replace />;
  return <Layout />;
}
function PublicOnly({ mode }: { mode: 'login' | 'register' }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center"><Loading /></div>;
  return me ? <Navigate to="/" replace /> : <AuthPage mode={mode} />;
}
const S = (el: React.ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

const router = createHashRouter([
  { path: '/login', element: <PublicOnly mode="login" /> },
  { path: '/register', element: <PublicOnly mode="register" /> },
  {
    path: '/', element: <Protected />, children: [
      { index: true, element: S(<Dashboard />) },
      { path: 'leads', element: S(<Leads />) },
      { path: 'leads/:id', element: S(<LeadDetail />) },
      { path: 'imports', element: S(<Imports />) },
      { path: 'discovery', element: S(<Discovery />) },
      { path: 'campaigns', element: S(<Campaigns />) },
      { path: 'tasks', element: S(<Tasks />) },
      { path: 'reports', element: S(<Reports />) },
      { path: 'integrations', element: S(<Integrations />) },
      { path: 'settings', element: S(<SettingsPage />) },
      { path: 'billing', element: S(<Billing />) },
      { path: 'admin', element: S(<Admin />) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

initApi().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <RouterProvider router={router} />
          <Toaster position="top-center" dir="rtl" richColors toastOptions={{ style: { fontFamily: 'Vazirmatn' } }} />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
});
