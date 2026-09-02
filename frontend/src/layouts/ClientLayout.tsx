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
  { to: '/client/licences', label: 'Licences', icon: KeyRound },
  { to: '/client/details', label: 'My Details', icon: IdCard },
];

export function ClientLayout() {
  const user = useAuth((s) => s.user);
  const logout = useLogout();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex h-16 w-full items-center gap-3 px-4 lg:px-6">
          <NavLink to="/client/dashboard" className="flex shrink-0 items-center">
            <Logo className="text-[24px]" />
          </NavLink>
          <span className="ml-1 hidden rounded-full bg-[#34B98C]/10 px-2 py-0.5 text-[11px] font-medium text-[#34B98C] sm:inline">
            Client Portal
          </span>

          <nav className="ml-auto flex items-center gap-1">
            {NAV.map((item) => (
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
                <DropdownMenuItem onClick={() => navigate('/client/account')}>
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
        <div className="w-full space-y-6 p-4 lg:p-6 xl:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
