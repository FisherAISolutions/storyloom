import { Toaster } from '@/components/ui/toaster';
import { lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { queryClientInstance } from '@/lib/query-client';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ProtectedRoute, { PublicOnlyRoute } from '@/components/ProtectedRoute';
import ScrollToTop from '@/components/ScrollToTop';
import PageNotFound from '@/lib/PageNotFound';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

const Home = lazy(() => import('@/pages/Home'));
const CreateStory = lazy(() => import('@/pages/CreateStory'));
const Characters = lazy(() => import('@/pages/Characters'));
const Library = lazy(() => import('@/pages/Library'));
const StoryEditor = lazy(() => import('@/pages/StoryEditor'));

const withPageLoader = (page) => (
  <Suspense fallback={<div className="flex justify-center py-24">Loading…</div>}>
    {page}
  </Suspense>
);

function AuthCallback() {
  const { isAuthenticated, isLoadingAuth, authChecked, authError } = useAuth();
  const [params] = useSearchParams();
  const requested = params.get('returnTo') || '/';
  const returnTo = requested.startsWith('/') && !requested.startsWith('//') && !requested.includes('\\')
    ? requested
    : '/';

  if (isLoadingAuth || !authChecked) {
    return <div className="fixed inset-0 flex items-center justify-center">Completing sign in…</div>;
  }
  if (isAuthenticated) return <Navigate to={returnTo} replace />;
  return <Navigate to={`/login${authError ? '?error=callback' : ''}`} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={withPageLoader(<Home />)} />
          <Route path="/create" element={withPageLoader(<CreateStory />)} />
          <Route path="/characters" element={withPageLoader(<Characters />)} />
          <Route path="/library" element={withPageLoader(<Library />)} />
          <Route path="/story/:id" element={withPageLoader(<StoryEditor />)} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AppRoutes />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
