import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  User,
  KeyRound,
  Settings,
  LogOut,
  Menu,
  LayoutDashboard,
  Users,
  Receipt,
  Package,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { useAuth } from '@/store/auth';
import { adminApi } from '@/api/resources';
import { useLogout } from '@/hooks/useSession';
import { initials, cn, mediaUrl } from '@/lib/utils';
import { Logo } from '@/components/layout/Logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/misc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Admin',
  CLIENT: 'Client',
  SUPPLIER: 'Supplier',
  EMPLOYEE: 'Employee',
};

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/billing', label: 'Billing', icon: Receipt },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/payments', label: 'Payments', icon: Wallet },
  { to: '/admin/approvals', label: 'Approvals', icon: ShieldCheck },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { data: pending } = useQuery({
    queryKey: ['admin', 'pendingCount'],
    queryFn: adminApi.pendingCount,
    refetchInterval: 60_000,
  });
  return (
    <>
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )
          }
        >
          <item.icon className="h-[18px] w-[18px] shrink-0" />
          <span>{item.label}</span>
          {item.to === '/admin/approvals' && !!pending && pending > 0 && (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
              {pending}
            </span>
          )}
        </NavLink>
      ))}
    </>
  );
}

export function Topbar() {
  const user = useAuth((s) => s.user);
  const logout = useLogout();
  const navigate = useNavigate();
  const [mobileNav, setMobileNav] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="relative flex h-16 items-center gap-3 px-4 lg:px-6">
        {/* Brand */}
        <NavLink to="/admin/dashboard" className="flex shrink-0 items-center">
          <Logo className="text-[26px]" />
        </NavLink>

        {/* Nav — absolutely centered on the header */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex">
          <NavItems />
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Search */}
          <div className="relative mr-1 hidden w-48 md:block xl:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search…"
              className="h-9 w-full rounded-lg border border-input bg-secondary/40 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg p-1.5 pr-2.5 hover:bg-secondary focus:outline-none">
              <Avatar>
                {user?.avatarUrl && <AvatarImage src={mediaUrl(user.avatarUrl)} alt="" />}
                <AvatarFallback>{initials(user?.firstName, user?.lastName)}</AvatarFallback>
              </Avatar>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium leading-tight">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="text-sm font-medium">{user?.email}</p>
                <p className="text-xs font-normal text-muted-foreground">
                  {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/admin/profile')}>
                <User /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/admin/profile?tab=password')}>
                <KeyRound /> Change Password
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/admin/settings')}>
                <Settings /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={handleLogout}>
                <LogOut /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile nav toggle */}
          <button
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary lg:hidden"
            onClick={() => setMobileNav((v) => !v)}
            aria-label="Toggle navigation"
          >
            {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileNav && (
        <div className="border-t border-border bg-card px-4 py-3 lg:hidden">
          <div className="relative mb-3 md:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search…"
              className="h-9 w-full rounded-lg border border-input bg-secondary/40 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <nav className="flex flex-col gap-1">
            <NavItems onNavigate={() => setMobileNav(false)} />
          </nav>
        </div>
      )}
    </header>
  );
}
