import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function PageNotFound() {
  const location = useLocation();
  const { user } = useAuth();
  const pageName = location.pathname.substring(1);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md text-center space-y-6">
        <h1 className="text-7xl font-light text-slate-300">404</h1>
        <div>
          <h2 className="text-2xl font-medium text-slate-800">Page Not Found</h2>
          <p className="mt-3 text-slate-600">
            The page <span className="font-medium text-slate-700">&quot;{pageName}&quot;</span> could not be found.
          </p>
        </div>
        {user?.role === 'admin' && (
          <div className="rounded-lg border border-slate-200 bg-slate-100 p-4 text-left text-sm text-slate-600">
            <p className="font-medium text-slate-700">Admin note</p>
            <p className="mt-1">This route is not implemented in the current application.</p>
          </div>
        )}
        <button
          onClick={() => { window.location.href = '/'; }}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Go home
        </button>
      </div>
    </div>
  );
}
