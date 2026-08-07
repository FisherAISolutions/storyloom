import { Link, useLocation, Outlet } from 'react-router-dom';
import { Home, Sparkles, Users, BookMarked, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/create', label: 'Create', icon: Sparkles },
  { to: '/characters', label: 'Characters', icon: Users },
  { to: '/library', label: 'Library', icon: BookMarked },
];

export default function Layout() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-[#fdfbf7] text-stone-800">
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-[#fdfbf7]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-white">
              <BookOpen className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-semibold tracking-tight">Storyloom</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map(({ to, label, icon: Icon }) => {
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
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 pb-24 md:pb-12">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-stone-200 bg-[#fdfbf7]/90 backdrop-blur-md py-2 md:hidden">
        {nav.map(({ to, label, icon: Icon }) => {
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
      </nav>
    </div>
  );
}