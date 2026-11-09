import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CreditCard,
  Eye,
  LayoutDashboard,
  ListChecks,
  Package,
  Receipt,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import { employeeApi } from '@/api/staff-portal';
import { useAuth } from '@/store/auth';

/**
 * Admin portal tabs an admin can grant to team members through team roles.
 * Team, Approvals and Settings are never grantable — they stay admin-only.
 * Keys must match STAFF_TABS on the API.
 */
export const STAFF_TABS = [
  { key: 'dashboard', label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
  { key: 'customers', label: 'Customers', to: '/admin/customers', icon: Building2 },
  { key: 'tasks', label: 'Tasks', to: '/admin/tasks', icon: ListChecks },
  { key: 'billing', label: 'Billing', to: '/admin/billing', icon: Receipt },
  { key: 'products', label: 'Products', to: '/admin/products', icon: Package },
  { key: 'payments', label: 'Payments', to: '/admin/payments', icon: CreditCard },
  { key: 'reports', label: 'Report', to: '/admin/reports', icon: BarChart3 },
  { key: 'preview', label: 'Preview', to: '/admin/preview', icon: Eye },
] as const satisfies readonly { key: string; label: string; to: string; icon: LucideIcon }[];

export type StaffTab = (typeof STAFF_TABS)[number]['key'];

export const STAFF_TAB_LABEL: Record<string, string> = Object.fromEntries(STAFF_TABS.map((t) => [t.key, t.label]));

/**
 * What the signed-in user may do in the admin sections. The admin has every
 * tab; a team member has the tabs their roles grant (loaded from the API).
 */
export function useStaffAccess() {
  const role = useAuth((s) => s.user?.role);
  const isStaff = role === 'EMPLOYEE';
  const q = useQuery({
    queryKey: ['employee', 'access'],
    queryFn: employeeApi.access,
    enabled: isStaff,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const tabs = new Set<string>(isStaff ? (q.data?.tabs ?? []) : STAFF_TABS.map((t) => t.key));
  return {
    isAdmin: role === 'SUPER_ADMIN',
    isStaff,
    loading: isStaff && q.isLoading,
    tabs,
    can: (tab: StaffTab) => tabs.has(tab),
  };
}
