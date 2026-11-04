import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Lock, LogOut, Moon, Sun, type LucideProps } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner';
import { NewActivityDot } from '@/components/tasks/NewActivityDot';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/store/auth';
import { useLogout } from '@/hooks/useSession';
import { cn, initials, mediaUrl } from '@/lib/utils';
import '@/components/layout/eloma.css';

type Theme = 'light' | 'dark';
const THEME_KEY = 'eg-portal-theme';

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage blocked — fall through to the system preference */
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export interface ElomaNavItem {
  to: string;
  label: string;
  icon: ComponentType<LucideProps>;
  /** Count bubble on the dock icon (hidden at 0). */
  count?: number;
  countTone?: 'ok' | 'warn';
  /** Blinking dot for unseen activity. */
  activity?: boolean;
  /** Render as a disabled item with this tooltip. */
  lockedReason?: string;
}

export interface ElomaMenuItem {
  label: string;
  icon: ComponentType<LucideProps>;
  to: string;
}

/**
 * Portal shell shared by the customer, team and admin portals — navy top rail,
 * context bar, floating dock nav and a light/dark toggle. While mounted it puts
 * `.eg-eloma` on <html> (plus the graphite dark remaps in dark mode) so
 * portalled dialogs and menus match.
 */
export function ElomaPortalShell({
  portalName,
  home,
  nav,
  menuItems,
  crumbRoot,
  contextRight,
  menuStatus,
}: {
  /** e.g. "Client Portal" — shown in the footer. */
  portalName: string;
  home: string;
  nav: ElomaNavItem[];
  /** Account-menu links shown above Sign out. */
  menuItems: ElomaMenuItem[];
  /** First breadcrumb segment (company name, "Admin"…). */
  crumbRoot?: string;
  /** Right side of the context bar. */
  contextRight?: ReactNode;
  /** Optional line under the user's email in the account menu. */
  menuStatus?: ReactNode;
}) {
  const user = useAuth((s) => s.user);
  const impersonating = useAuth((s) => !!s.impersonation);
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const cl = document.documentElement.classList;
    cl.add('eg-eloma');
    // Dark mode reuses the graphite theme's remaps of hard-coded light tints
    // (task chips, badges…); eloma.css overrides its palette and panel shape.
    cl.toggle('eg-graphite', theme === 'dark');
    cl.toggle('eg-eloma-dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* not persisted — fine */
    }
  }, [theme]);
  useEffect(
    () => () => document.documentElement.classList.remove('eg-eloma', 'eg-eloma-dark', 'eg-graphite'),
    []
  );

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const pageName =
    nav.find((n) => location.pathname.startsWith(n.to))?.label ??
    menuItems.find((m) => location.pathname.startsWith(m.to))?.label ??
    '';

  return (
    <div className={cn('el-app', impersonating && 'pt-10')}>
      <ImpersonationBanner />

      <header className="el-rail" style={impersonating ? { top: 40 } : undefined}>
        <div className="el-rail-in">
          <Link to={home} className="whitespace-nowrap text-white hover:text-white" aria-label="Home">
            <Logo light className="text-[24px]" />
          </Link>
          <div className="grow" />
          <button
            type="button"
            className="el-modebtn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Moon /> : <Sun />}
            <span className="lbl">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
          <div className="el-iconbtn">
            <NotificationBell />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="el-avatar focus:outline-none"
              aria-label={`Account: ${user?.firstName ?? ''} ${user?.lastName ?? ''}`}
            >
              {user?.avatarUrl ? <img src={mediaUrl(user.avatarUrl)} alt="" /> : initials(user?.firstName, user?.lastName)}
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
          <button type="button" className="el-signout" onClick={handleLogout} aria-label="Sign out" title="Sign out">
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <div className="el-ctx">
        <div className="el-ctx-in">
          <span>
            {crumbRoot ? `${crumbRoot} / ` : ''}
            <b>{pageName}</b>
          </span>
          <span className="grow" />
          {contextRight && <span className="acct">{contextRight}</span>}
        </div>
      </div>

      <main className="el-main">
        <div key={location.pathname} className="el-view animate-fade-in">
          <Outlet />
        </div>
      </main>

      <nav className="el-dock" aria-label="Main">
        {nav.map((item) => {
          const Icon = item.icon;
          if (item.lockedReason) {
            return (
              <span key={item.to} className="locked" title={item.lockedReason} aria-disabled="true">
                <Lock />
                {item.label}
              </span>
            );
          }
          return (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => cn(isActive && 'active')}>
              <Icon />
              {item.label}
              {!!item.count && <span className={cn('count', item.countTone === 'warn' && 'warn')}>{item.count}</span>}
              {item.activity && <NewActivityDot className="ping" />}
            </NavLink>
          );
        })}
      </nav>

      <footer className="el-foot">
        <span>EG Eloma {portalName} · Eloma Group</span>
        <span className="grow" />
        {user?.email && <span>Signed in as {user.email}</span>}
        <span>Times shown in your local time</span>
        <button type="button" onClick={handleLogout}>
          Sign out
        </button>
      </footer>
    </div>
  );
}
