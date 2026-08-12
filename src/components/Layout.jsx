import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { Home, Sparkles, Users, BookMarked, BookOpen, LogOut, CreditCard, ChartNoAxesCombined } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

const authenticatedNav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/create', label: 'Create', icon: Sparkles },
  { to: '/characters', label: 'Characters', icon: Users },
  { to: '/library', label: 'Library', icon: BookMarked },
  { to: '/billing', label: 'Billing', icon: CreditCard },
];

export default function Layout() {
  const location = useLocation();
  const { logout, user } = useAuth();
  const visibleNav = user
    ? (user.role === 'admin' ? [...authenticatedNav, { to: '/admin/ai-economics', label: 'AI economics', icon: ChartNoAxesCombined }] : authenticatedNav)
    : [];
  const [logoutError, setLogoutError] = useState('');

  const handleLogout = async () => {
    setLogoutError('');
    try {
      await logout();
    } catch {
      setLogoutError('Could not log out. Please try again.');
    }
  };
  return (
    <div className="min-h-screen bg-[#fdfbf7] text-stone-800">
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-[#fdfbf7]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-4 sm:px-5">
          <Link to="/" className="flex items-center gap-1.5 sm:gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white sm:h-9 sm:w-9">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="font-display whitespace-nowrap text-sm font-semibold tracking-tight sm:text-xl">MyStorybook AI</span>
          </Link>
          <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-1 md:flex">
            {visibleNav.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition',
                    active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-200/60'
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              );
            })}
          </nav>
          {user ? (
            <button onClick={() => { void handleLogout(); }} className="rounded-full p-2 text-stone-500 hover:bg-stone-200/60 hover:text-stone-900" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2">
              <Link to="/pricing" className="hidden rounded-full px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200/60 sm:block">Pricing</Link>
              <Link to="/login" className="whitespace-nowrap rounded-full px-2 py-2 text-xs font-medium text-stone-600 hover:bg-stone-200/60 sm:px-4 sm:text-sm">Log in</Link>
              <Link to="/register" className="whitespace-nowrap rounded-full bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-800 sm:px-4 sm:text-sm">Create account</Link>
            </div>
          )}
          </div>
        </div>
      </header>
      {logoutError && <p role="alert" className="mx-auto max-w-7xl px-5 pt-3 text-sm text-red-600">{logoutError}</p>}
      <main className="mx-auto max-w-7xl px-5 py-8 pb-24 md:pb-12">
        <Outlet />
      </main>
      <footer className="border-t border-stone-200/70 px-5 py-8 text-sm text-stone-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} MyStorybook AI <span className="hidden sm:inline">&middot; Your child. Their adventure. Their storybook.</span></p>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link to="/pricing" className="hover:text-stone-900">Pricing</Link>
            <Link to="/privacy" className="hover:text-stone-900">Privacy</Link>
            <Link to="/terms" className="hover:text-stone-900">Terms</Link>
            <Link to="/support" className="hover:text-stone-900">Support</Link>
          </nav>
        </div>
      </footer>
      {user && <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-stone-200 bg-[#fdfbf7]/90 backdrop-blur-md py-2 md:hidden">
        {visibleNav.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1 text-[11px] font-medium transition',
                active ? 'text-stone-900' : 'text-stone-400'
              )}
            >
              <Icon className="h-5 w-5" /> {label}
            </Link>
          );
        })}
      </nav>}
    </div>
  );
}
