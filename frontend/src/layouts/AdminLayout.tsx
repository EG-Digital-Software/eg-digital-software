import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  BadgeCheck,
  Building2,
  Cloud,
  CreditCard,
  Eye,
  LayoutDashboard,
  ListChecks,
  Package,
  Receipt,
  Settings,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import { adminApi } from '@/api/resources';
import { useAdminTaskActivity } from '@/lib/taskSeen';
import { PortalShell } from '@/components/layout/PortalShell';
import { brand } from '@/config/brand';
import { useAuth } from '@/store/auth';
import { EmployeeLayout } from './EmployeeLayout';

/**
 * Admin sections are shared with team members their roles let in; they keep
 * their own Team portal shell, whose nav lists just the tabs they were granted.
 */
export function AdminLayout() {
  const role = useAuth((s) => s.user?.role);
  return role === 'EMPLOYEE' ? <EmployeeLayout /> : <SuperAdminLayout />;
}

function SuperAdminLayout() {
  const { data: pending } = useQuery({
    queryKey: ['admin', 'pendingCount'],
    queryFn: adminApi.pendingCount,
    refetchInterval: 60_000,
  });
  // Red dot on Tasks while any task (any company) has activity this admin hasn't opened.
  const tasksDot = useAdminTaskActivity().any;

  return (
    <PortalShell
      portalName="Admin Portal"
      home="/admin/dashboard"
      crumbRoot="Admin"
      accountLine={
        <>
          <span style={{ color: 'var(--fg)' }}>{brand.seller.legalName}</span> · Admin portal
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
        { to: '/admin/approvals', label: 'Approvals', icon: BadgeCheck, count: pending ?? 0, countTone: 'orange' },
        { to: '/admin/reports', label: 'Report', icon: BarChart3 },
        { to: '/admin/preview', label: 'Preview', icon: Eye },
        { to: '/admin/marketing', label: 'Marketing', icon: TrendingUp },
        { to: '/admin/cloud', label: 'Cloud', icon: Cloud },
      ]}
      menuItems={[
        { label: 'My Account', icon: User, to: '/admin/profile' },
        { label: 'Settings', icon: Settings, to: '/admin/settings' },
      ]}
    />
  );
}
