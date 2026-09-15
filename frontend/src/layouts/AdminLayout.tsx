import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ListChecks,
  Receipt,
  Package,
  Wallet,
  ShieldCheck,
  Settings,
  LogOut,
  User,
  Search,
  Menu,
  X,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useAuth } from '@/store/auth';
import { adminApi } from '@/api/resources';
import { useLogout } from '@/hooks/useSession';
import { initials, cn, mediaUrl } from '@/lib/utils';
import { Logo } from '@/components/layout/Logo';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/misc';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<LucideProps>;
}

const NAV: NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/admin/billing', label: 'Billing', icon: Receipt },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/payments', label: 'Payments', icon: Wallet },
  { to: '/admin/approvals', label: 'Approvals', icon: ShieldCheck },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout() {
  const user = useAuth((s) => s.user);
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false); // mobile drawer
  const { data: pending } = useQuery({
    queryKey: ['admin', 'pendingCount'],
    queryFn: adminApi.pendingCount,
    refetchInterval: 60_000,
  });

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 px-5">
        <Logo className="shrink-0 whitespace-nowrap text-[22px]" />
        <span className="shrink-0 whitespace-nowrap rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Admin
        </span>
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin/dashboard'}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-slate-600 hover:bg-secondary hover:text-foreground'
              )
            }
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.to === '/admin/approvals' && !!pending && pending > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
                {pending}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Account + sign out */}
      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar>
            {user?.avatarUrl && <AvatarImage src={mediaUrl(user.avatarUrl)} alt="" />}
            <AvatarFallback>{initials(user?.firstName, user?.lastName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            navigate('/admin/profile');
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-secondary hover:text-foreground"
        >
          <User className="h-[18px] w-[18px]" />
          My Account
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f7fa]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-border bg-card lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border bg-card shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-muted-foreground hover:bg-secondary"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-72">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md p-2 text-muted-foreground hover:bg-secondary lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Search */}
            <div className="relative hidden max-w-md flex-1 sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search anything..."
                className="h-10 w-full rounded-full border border-input bg-secondary/50 pl-9 pr-14 text-sm outline-none transition-colors focus:border-primary focus:bg-card"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline">
                ⌘K
              </span>
            </div>

            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="px-3 py-4 sm:px-4 lg:py-6">
          <div key={location.pathname} className="animate-fade-in w-full space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
