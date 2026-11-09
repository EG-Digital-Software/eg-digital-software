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
import type { AccessMap } from '@/api/resources';
import { useAuth } from '@/store/auth';

/**
 * Admin portal tabs an admin can grant to team members through team roles.
 * Team, Approvals and Settings are never grantable — they stay admin-only.
 * Keys must match STAFF_TABS on the API. `viewOnly` tabs only ever show data.
 */
export const STAFF_TABS = [
  { key: 'dashboard', label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard, viewOnly: true },
  { key: 'customers', label: 'Customers', to: '/admin/customers', icon: Building2, viewOnly: false },
  { key: 'tasks', label: 'Tasks', to: '/admin/tasks', icon: ListChecks, viewOnly: false },
  { key: 'billing', label: 'Billing', to: '/admin/billing', icon: Receipt, viewOnly: false },
  { key: 'products', label: 'Products', to: '/admin/products', icon: Package, viewOnly: false },
  { key: 'payments', label: 'Payments', to: '/admin/payments', icon: CreditCard, viewOnly: false },
  { key: 'reports', label: 'Report', to: '/admin/reports', icon: BarChart3, viewOnly: true },
  { key: 'preview', label: 'Preview', to: '/admin/preview', icon: Eye, viewOnly: true },
] as const satisfies readonly { key: string; label: string; to: string; icon: LucideIcon; viewOnly: boolean }[];

export type StaffTab = (typeof STAFF_TABS)[number]['key'];

export const STAFF_TAB_LABEL: Record<string, string> = Object.fromEntries(STAFF_TABS.map((t) => [t.key, t.label]));

/**
 * Sub-tabs granted one by one, each view-only or editable. Must match
 * STAFF_SECTIONS on the API. The first one (Overview) is the way into a
 * customer, so it always comes with the tab. Credential stays admin-only.
 */
export const STAFF_SECTIONS: Partial<
  Record<StaffTab, readonly { key: string; label: string; hint: string; viewOnly?: boolean }[]>
> = {
  customers: [
    { key: 'overview', label: 'Overview', hint: 'Customer list and details. Edit lets them add, edit, renew and archive customers.' },
    { key: 'agreement', label: 'Agreement', hint: 'Agreement documents. Edit lets them upload, fill and remove.' },
    { key: 'products', label: 'Products & Licences', hint: 'Assigned products. Edit lets them assign, change and remove.' },
    { key: 'invoices', label: 'Invoices', hint: "The customer's invoices. Edit lets them create invoices." },
    { key: 'task', label: 'Task', hint: "The customer's task board. Edit lets them add and change tasks." },
    {
      key: 'history',
      label: 'Account History',
      hint: 'Paid invoices, trial period and account renewals.',
      viewOnly: true,
    },
  ],
};

export type AccessLevel = 'view' | 'edit';

/** Level held for a tab ("customers" = best across its sub-tabs) or a sub-tab ("customers.task"). */
export function levelFor(access: AccessMap, key: string): AccessLevel | null {
  if (key.includes('.')) return access[key] ?? null;
  let best: AccessLevel | null = null;
  for (const [k, level] of Object.entries(access)) {
    if (k.split('.')[0] !== key) continue;
    if (level === 'edit') return 'edit';
    best = 'view';
  }
  return best;
}

/** Short human summary of what a role grants, e.g. "Customers (Overview · view, Task · edit)". */
export function describeAccess(access: AccessMap = {}): { key: string; label: string }[] {
  return STAFF_TABS.flatMap((t) => {
    const sections = STAFF_SECTIONS[t.key];
    if (!sections) {
      const level = access[t.key];
      return level ? [{ key: t.key, label: t.viewOnly ? t.label : `${t.label} · ${level}` }] : [];
    }
    const parts = sections.filter((s) => access[`${t.key}.${s.key}`]).map((s) => `${s.label} · ${access[`${t.key}.${s.key}`]}`);
    return parts.length ? [{ key: t.key, label: `${t.label} (${parts.join(', ')})` }] : [];
  });
}

/**
 * What the signed-in user may do in the admin sections. The admin has every
 * tab at edit; a team member has the tabs / sub-tabs their roles grant, each
 * view-only or editable (loaded from the API).
 */
export function useStaffAccess() {
  const role = useAuth((s) => s.user?.role);
  const isStaff = role === 'EMPLOYEE';
  const isAdmin = role === 'SUPER_ADMIN';
  const q = useQuery({
    queryKey: ['employee', 'access'],
    queryFn: employeeApi.access,
    enabled: isStaff,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const access: AccessMap = isStaff ? (q.data?.access ?? {}) : {};
  const tabs = new Set<string>(isStaff ? (q.data?.tabs ?? []) : STAFF_TABS.map((t) => t.key));
  const level = (key: string): AccessLevel | null => (isAdmin ? 'edit' : isStaff ? levelFor(access, key) : null);
  return {
    isAdmin,
    isStaff,
    loading: isStaff && q.isLoading,
    tabs,
    /** Tab or sub-tab is visible (any level). */
    can: (key: StaffTab | `${StaffTab}.${string}`) => level(key) !== null,
    /** Tab or sub-tab allows changes. For a tab with sub-tabs, true when any sub-tab is editable. */
    canEdit: (key: StaffTab | `${StaffTab}.${string}`) => level(key) === 'edit',
  };
}
