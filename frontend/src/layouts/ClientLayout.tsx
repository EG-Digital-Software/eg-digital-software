import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Home,
  Package,
  Receipt,
  ListChecks,
  IdCard,
  FileText,
  LogOut,
  User,
  Search,
  HelpCircle,
  Menu,
  X,
  MessageCircle,
  ShieldCheck,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { clientApi } from '@/api/client-portal';
import { useAuth } from '@/store/auth';
import { useLogout } from '@/hooks/useSession';
import { initials, cn, mediaUrl } from '@/lib/utils';
import { Logo } from '@/components/layout/Logo';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/misc';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<LucideProps>;
}

// Account status → sidebar card presentation.
const ACCOUNT_STATUS: Record<string, { label: string; dot: string; text: string; ring: string }> = {
  ACTIVE: { label: 'Active', dot: 'bg-emerald-500', text: 'text-emerald-600', ring: 'bg-emerald-500/15' },
  ACTIVE_TRIAL: { label: 'Active-Trial', dot: 'bg-blue-500', text: 'text-blue-600', ring: 'bg-blue-500/15' },
  DORMANT: { label: 'Dormant', dot: 'bg-amber-500', text: 'text-amber-600', ring: 'bg-amber-500/15' },
  SUSPENDED: { label: 'Suspended', dot: 'bg-rose-500', text: 'text-rose-600', ring: 'bg-rose-500/15' },
};

const NAV: NavItem[] = [
  { to: '/client/dashboard', label: 'Dashboard', icon: Home },
  { to: '/client/licences', label: 'Products', icon: Package },
  { to: '/client/invoices', label: 'Invoices', icon: Receipt },
  { to: '/client/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/client/details', label: 'Company Details', icon: IdCard },
  { to: '/client/agreement', label: 'Agreement', icon: FileText },
];

/** Left-rail portal shell matching the customer-portal reference design. */
export function ClientLayout() {
  const user = useAuth((s) => s.user);
  const impersonating = useAuth((s) => !!s.impersonation);
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false); // mobile drawer
  const { data: profile } = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });
  const manager = profile?.accountManager ?? null;
  const acctStatus = profile?.accountStatusEffective ?? profile?.accountStatus;
  const status = (acctStatus && ACCOUNT_STATUS[acctStatus]) ?? undefined;

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
          Customer Portal
        </span>
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
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
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Account manager — shown when an admin has assigned one */}
      {manager && (
        <div className="px-3 pb-1">
          <div className="rounded-2xl border border-border bg-secondary/40 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Account Manager
            </p>
            <div className="flex items-center gap-3">
              <Avatar>
                {manager.avatarUrl && <AvatarImage src={mediaUrl(manager.avatarUrl)} alt="" />}
                <AvatarFallback>{initials(manager.firstName, manager.lastName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {manager.firstName} {manager.lastName}
                </p>
                <p className="truncate text-xs text-muted-foreground">{manager.email}</p>
              </div>
            </div>
            <a
              href={`mailto:${manager.email}`}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <MessageCircle className="h-4 w-4" /> Contact
            </a>
          </div>
        </div>
      )}

      {/* Account status */}
      {status && (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/40 px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', status.ring)}>
                <ShieldCheck className={cn('h-4 w-4', status.text)} />
              </span>
              <div className="leading-tight">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Account Status
                </p>
                <p className={cn('text-sm font-semibold', status.text)}>{status.label}</p>
              </div>
            </div>
            <span className={cn('h-2.5 w-2.5 rounded-full', status.dot)} />
          </div>
        </div>
      )}

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
            navigate('/client/account');
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
    <div className={cn('min-h-screen bg-[#f5f7fa]', impersonating && 'pt-10')}>
      <ImpersonationBanner />
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-border bg-card lg:block',
          impersonating && 'top-10'
        )}
      >
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
        <header
          className={cn(
            'sticky z-20 border-b border-border bg-card/85 backdrop-blur-md',
            impersonating ? 'top-10' : 'top-0'
          )}
        >
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
              <button
                type="button"
                onClick={() => navigate('/client/agreement')}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Help"
                title="Help"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="px-3 py-4 sm:px-4 lg:py-6">
          <div className="w-full space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
