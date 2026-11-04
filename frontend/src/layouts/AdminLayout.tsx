import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  BadgeCheck,
  Building2,
  CreditCard,
  LayoutDashboard,
  ListChecks,
  Package,
  Receipt,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { adminApi } from '@/api/resources';
import { useAdminTaskActivity } from '@/lib/taskSeen';
import { ElomaPortalShell } from '@/components/layout/ElomaPortalShell';
import { brand } from '@/config/brand';

export function AdminLayout() {
  const { data: pending } = useQuery({
    queryKey: ['admin', 'pendingCount'],
    queryFn: adminApi.pendingCount,
    refetchInterval: 60_000,
  });
  // Red dot on Tasks while any task (any company) has activity this admin hasn't opened.
  const tasksDot = useAdminTaskActivity().any;

  return (
    <ElomaPortalShell
      portalName="Admin Portal"
      home="/admin/dashboard"
      crumbRoot="Admin"
      contextRight={
        <>
          <b>{brand.seller.legalName}</b> · Admin portal
        </>
      }
      nav={[
        { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/admin/team', label: 'Team', icon: Users },
        { to: '/admin/customers', label: 'Customers', icon: Building2 },
        { to: '/admin/tasks', label: 'Tasks', icon: ListChecks, activity: tasksDot },
        { to: '/admin/billing', label: 'Billing', icon: Receipt },
        { to: '/admin/products', label: 'Products', icon: Package },
        { to: '/admin/payments', label: 'Payments', icon: CreditCard },
        { to: '/admin/approvals', label: 'Approvals', icon: BadgeCheck, count: pending ?? 0, countTone: 'warn' },
        { to: '/admin/reports', label: 'Report', icon: BarChart3 },
      ]}
      menuItems={[
        { label: 'My Account', icon: User, to: '/admin/profile' },
        { label: 'Settings', icon: Settings, to: '/admin/settings' },
      ]}
    />
  );
}
