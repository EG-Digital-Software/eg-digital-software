import type { ComponentType } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, User, type LucideProps } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useLogout } from '@/hooks/useSession';
import { initials, cn, mediaUrl } from '@/lib/utils';
import { Logo } from '@/components/layout/Logo';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/misc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface PortalNavItem {
  to: string;
  label: string;
  icon: ComponentType<LucideProps>;
}

/**
 * Shared shell for the role portals (Supplier, Employee). A compact top-nav
 * with a coloured portal badge, role navigation, and an account menu.
 */
export function PortalShell({
  badge,
  badgeClass,
  nav,
  home,
  accountPath,
}: {
  badge: string;
  badgeClass: string;
  nav: PortalNavItem[];
  /** Kept for callers; logout now returns to the portal chooser. */
  loginPath?: string;
  home: string;
  accountPath: string;
}) {
  const user = useAuth((s) => s.user);
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex h-16 w-full items-center gap-3 px-4 lg:px-6">
          <NavLink to={home} className="flex shrink-0 items-center">
            <Logo className="text-[24px]" />
          </NavLink>
          <span className={cn('ml-1 hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline', badgeClass)}>
            {badge}
          </span>

          <nav className="ml-auto flex items-center gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
                <span className="hidden sm:inline">{item.label}</span>
              </NavLink>
            ))}

            <NotificationBell />

            <DropdownMenu>
              <DropdownMenuTrigger className="ml-1 rounded-full focus:outline-none">
                <Avatar>
                  {user?.avatarUrl && <AvatarImage src={mediaUrl(user.avatarUrl)} alt="" />}
                  <AvatarFallback>{initials(user?.firstName, user?.lastName)}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs font-normal text-muted-foreground">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(accountPath)}>
                  <User /> My Account
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={handleLogout}>
                  <LogOut /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div
          key={location.pathname}
          className="animate-fade-in w-full space-y-6 p-4 lg:p-6 xl:p-8"
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
