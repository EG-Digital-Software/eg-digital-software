import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, KeyRound, LogOut, User, IdCard, ListChecks } from 'lucide-react';
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

const NAV = [
  { to: '/client/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/client/invoices', label: 'Invoices', icon: Receipt },
  { to: '/client/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/client/licences', label: 'Products', icon: KeyRound },
  { to: '/client/details', label: 'My Details', icon: IdCard },
];

/** Full-width shell — content spans the whole screen with a small, even gutter. */
const SHELL = 'w-full px-4 sm:px-6 lg:px-8';

export function ClientLayout() {
  const user = useAuth((s) => s.user);
  const logout = useLogout();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-card/85 backdrop-blur-xl">
        <div className={cn(SHELL, 'relative flex h-16 items-center gap-3')}>
          <NavLink to="/client/dashboard" className="flex shrink-0 items-center">
            <Logo className="text-[24px]" />
          </NavLink>
          <span className="ml-1 hidden rounded-full border border-[#34B98C]/20 bg-[#34B98C]/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-[#2f9d78] sm:inline">
            Customer Portal
          </span>

          {/* Primary nav — a single pill rail, absolutely centred in the header. */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 rounded-full border border-border/70 bg-secondary/50 p-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-card text-foreground shadow-sm ring-1 ring-border/60'
                      : 'text-muted-foreground hover:text-foreground'
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
                <span className="hidden lg:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-full p-1 pr-2.5 transition-colors hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar>
                  {user?.avatarUrl && <AvatarImage src={mediaUrl(user.avatarUrl)} alt="" />}
                  <AvatarFallback>{initials(user?.firstName, user?.lastName)}</AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium leading-tight sm:block">
                  {user?.firstName} {user?.lastName}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs font-normal text-muted-foreground">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/client/account')}>
                  <User /> My Account
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={handleLogout}>
                  <LogOut /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Compact nav rail for tablet / phone, where the header pill is hidden. */}
        <nav className="border-t border-border/70 bg-card/60 md:hidden">
          <div className={cn(SHELL, 'flex items-center gap-1 overflow-x-auto py-2')}>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <div className={cn(SHELL, 'space-y-6 py-6 lg:py-8')}>
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className={cn(SHELL, 'py-6 text-center text-sm font-medium text-muted-foreground')}>
          This portal is under construction — some features may still be on the way.
        </div>
      </footer>
    </div>
  );
}
