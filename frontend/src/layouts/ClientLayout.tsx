import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, User, Menu, X, Lock } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { useAuth } from '@/store/auth';
import { useLogout } from '@/hooks/useSession';
import { initials, cn, mediaUrl } from '@/lib/utils';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { NewActivityDot } from '@/components/tasks/NewActivityDot';
import { clientTaskApi } from '@/api/tasks';
import { useBoardHasNewActivity } from '@/lib/taskSeen';
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Account status → label + dot shown in the account menu.
const ACCOUNT_STATUS: Record<string, { label: string; dot: string }> = {
  ACTIVE: { label: 'Active', dot: 'bg-[#7CE3A6]' },
  ACTIVE_TRIAL: { label: 'Active-Trial', dot: 'bg-[#E2E8F0]' },
  DORMANT: { label: 'Dormant', dot: 'bg-amber-400' },
  SUSPENDED: { label: 'Suspended', dot: 'bg-rose-400' },
};

const TASK_API = clientTaskApi();

const NAV = [
  { to: '/client/dashboard', label: 'Dashboard' },
  { to: '/client/licences', label: 'Products' },
  { to: '/client/invoices', label: 'Invoices' },
  { to: '/client/tasks', label: 'Tasks' },
  { to: '/client/details', label: 'Company' },
  { to: '/client/agreement', label: 'Agreement' },
];

const roundBtn =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-white/[0.12] text-white transition-colors hover:bg-white/20';

/** Top-nav portal shell — "Atomic Core · Graphite" customer-portal design. */
export function ClientLayout() {
  const user = useAuth((s) => s.user);
  const impersonating = useAuth((s) => !!s.impersonation);
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false); // mobile menu
  const { data: profile } = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });
  const acctStatus = profile?.accountStatusEffective ?? profile?.accountStatus;
  const status = (acctStatus && ACCOUNT_STATUS[acctStatus]) ?? undefined;
  // A suspended account loses access to Tasks — the nav item is locked and the
  // page itself refuses to render the board (see ClientTasksPage).
  const suspended = acctStatus === 'SUSPENDED';
  // Red dot on Tasks while any task has activity this user hasn't opened.
  const tasksDot = useBoardHasNewActivity(TASK_API, 'client', !!profile && !suspended);

  // Scope the graphite theme to the client portal. It lives on <html> so
  // dialogs and menus portalled to <body> pick it up too.
  useEffect(() => {
    document.documentElement.classList.add('eg-graphite');
    return () => document.documentElement.classList.remove('eg-graphite');
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const navItems = (mobile: boolean) =>
    NAV.map((item) => {
      const base = mobile
        ? 'flex h-12 items-center gap-2 border-b border-white/[0.06] px-1 text-[13px] uppercase tracking-[0.08em]'
        : 'relative inline-flex h-11 items-center gap-1.5 px-3 text-[13px] uppercase tracking-[0.08em]';
      if (suspended && item.to === '/client/tasks') {
        return (
          <span
            key={item.to}
            title="Tasks are locked while your account is suspended. Please contact your account manager."
            aria-disabled="true"
            className={cn(base, 'cursor-not-allowed select-none font-semibold text-[#6B7385]')}
          >
            {item.label}
            <Lock className="h-3.5 w-3.5" />
          </span>
        );
      }
      return (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(base, isActive ? 'font-bold text-white' : 'font-semibold text-[#C9CEDA] hover:text-white')
          }
        >
          {({ isActive }) => (
            <>
              {item.label}
              {item.to === '/client/tasks' && tasksDot && <NewActivityDot />}
              {isActive && !mobile && (
                <span className="absolute inset-x-3 bottom-1.5 h-0.5 bg-[#E2E8F0]" aria-hidden="true" />
              )}
            </>
          )}
        </NavLink>
      );
    });

  return (
    <div
      className={cn(
        'relative flex min-h-screen flex-col overflow-x-clip bg-[#0C0D10] text-[#F5F6F8]',
        impersonating && 'pt-10'
      )}
    >
      <ImpersonationBanner />
      {/* Ambient graphite glow behind the top of every page */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-30px] h-[900px] w-[1500px] -translate-x-1/2"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(148,163,184,0.22), rgba(0,0,0,0) 64%)' }}
      />

      <header
        className={cn(
          'sticky z-30 border-b border-transparent bg-[#0C0D10]/70 backdrop-blur-md',
          impersonating ? 'top-10' : 'top-0'
        )}
      >
        <div className="flex flex-wrap items-center gap-3 px-3 py-[18px] sm:px-5">
          <Link
            to="/client/dashboard"
            className="mr-6 whitespace-nowrap text-[17px] font-semibold tracking-[0.34em] text-white hover:text-white"
          >
            EG DIGITAL
          </Link>

          <nav aria-label="Main" className="hidden flex-wrap lg:flex">
            {navItems(false)}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">

            <div className="[&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-white/[0.12] [&>button]:p-0 [&>button]:text-white [&>button:hover]:bg-white/20 [&>button>svg]:h-4 [&>button>svg]:w-4">
              <NotificationBell />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(roundBtn, 'overflow-hidden text-[13px] font-bold focus:outline-none')}
                aria-label={`Account: ${user?.firstName ?? ''} ${user?.lastName ?? ''}`}
              >
                {user?.avatarUrl ? (
                  <img src={mediaUrl(user.avatarUrl)} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(user?.firstName, user?.lastName)
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
                  {status && (
                    <p className="mt-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <span className={cn('h-2 w-2 rounded-full', status.dot)} />
                      Account {status.label}
                    </p>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/client/account')}>
                  <User /> My Account
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={handleLogout}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={cn(roundBtn, 'lg:hidden')}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <nav aria-label="Main" className="flex flex-col border-t border-white/[0.08] px-3 pb-3 sm:px-5 lg:hidden">
            {navItems(true)}
          </nav>
        )}
      </header>

      <main className="relative flex-1">
        <div key={location.pathname} className="mx-auto w-full max-w-[1760px] space-y-6 px-3 pb-14 pt-4 animate-fade-in sm:px-5">
          <Outlet />
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-[1760px] px-3 pb-8 sm:px-5">
        <div className="flex flex-wrap items-center gap-4 border-t border-white/[0.08] pt-[18px] text-xs uppercase tracking-[0.08em] text-[#8C93A5]">
          <span>EG Digital · Customer Portal</span>
          {user?.email && <span className="sm:ml-auto">Signed in as {user.email}</span>}
          <button
            type="button"
            onClick={handleLogout}
            className={cn('uppercase tracking-[0.08em] text-[#C9CEDA] hover:text-white', !user?.email && 'sm:ml-auto')}
          >
            Sign out
          </button>
        </div>
      </footer>
    </div>
  );
}
