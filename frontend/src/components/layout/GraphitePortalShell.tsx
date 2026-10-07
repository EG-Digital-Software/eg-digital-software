import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, Lock, type LucideProps } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useLogout } from '@/hooks/useSession';
import { initials, cn, mediaUrl } from '@/lib/utils';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface GraphiteNavItem {
  to: string;
  label: string;
  /** Match the path exactly (for index-like routes). */
  end?: boolean;
  /** Render as a disabled item with this tooltip. */
  lockedReason?: string;
  /** Extra marker after the label (activity dot, count pill…). */
  extra?: ReactNode;
}

export interface GraphiteMenuItem {
  label: string;
  icon: ComponentType<LucideProps>;
  to: string;
}

// Literal classes per breakpoint so Tailwind can see them.
const BREAKPOINT = {
  lg: { desktop: 'hidden lg:flex', mobile: 'lg:hidden' },
  xl: { desktop: 'hidden xl:flex', mobile: 'xl:hidden' },
} as const;

const roundBtn =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-white/[0.12] text-white transition-colors hover:bg-white/20';

/**
 * Top-nav portal shell — the "Atomic Core · Graphite" design shared by the
 * client, team and admin portals. While mounted it puts `.eg-graphite` on
 * <html>, so dialogs and menus portalled to <body> are themed too.
 */
export function GraphitePortalShell({
  portalName,
  home,
  nav,
  menuItems,
  menuStatus,
  navBreakpoint = 'lg',
}: {
  /** e.g. "Customer Portal" — shown in the footer. */
  portalName: string;
  home: string;
  nav: GraphiteNavItem[];
  /** Account-menu links shown above Sign out. */
  menuItems: GraphiteMenuItem[];
  /** Optional line under the user's email in the account menu. */
  menuStatus?: ReactNode;
  /** Below this width the nav collapses into the menu button. */
  navBreakpoint?: keyof typeof BREAKPOINT;
}) {
  const user = useAuth((s) => s.user);
  const impersonating = useAuth((s) => !!s.impersonation);
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false); // mobile menu
  const bp = BREAKPOINT[navBreakpoint];

  useEffect(() => {
    document.documentElement.classList.add('eg-graphite');
    return () => document.documentElement.classList.remove('eg-graphite');
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const navItems = (mobile: boolean) =>
    nav.map((item) => {
      const base = mobile
        ? 'flex h-12 items-center gap-2 border-b border-white/[0.06] px-1 text-[13px] uppercase tracking-[0.08em]'
        : 'relative inline-flex h-11 items-center gap-1.5 whitespace-nowrap px-3 text-[13px] uppercase tracking-[0.08em]';
      if (item.lockedReason) {
        return (
          <span
            key={item.to}
            title={item.lockedReason}
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
          end={item.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(base, isActive ? 'font-bold text-white' : 'font-semibold text-[#C9CEDA] hover:text-white')
          }
        >
          {({ isActive }) => (
            <>
              {item.label}
              {item.extra}
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
            to={home}
            className="mr-6 whitespace-nowrap text-[17px] font-semibold tracking-[0.34em] text-white hover:text-white"
          >
            EG DIGITAL
          </Link>

          <nav aria-label="Main" className={cn('flex-wrap', bp.desktop)}>
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
                  {menuStatus}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {menuItems.map((m) => (
                  <DropdownMenuItem key={m.to} onClick={() => navigate(m.to)}>
                    <m.icon /> {m.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={handleLogout}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={cn(roundBtn, bp.mobile)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <nav aria-label="Main" className={cn('flex flex-col border-t border-white/[0.08] px-3 pb-3 sm:px-5', bp.mobile)}>
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
          <span>EG Digital · {portalName}</span>
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
