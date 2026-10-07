import { useQuery } from '@tanstack/react-query';
import { Settings, User } from 'lucide-react';
import { adminApi } from '@/api/resources';
import { NewActivityDot } from '@/components/tasks/NewActivityDot';
import { useAdminTaskActivity } from '@/lib/taskSeen';
import { GraphitePortalShell } from '@/components/layout/GraphitePortalShell';

export function AdminLayout() {
  const { data: pending } = useQuery({
    queryKey: ['admin', 'pendingCount'],
    queryFn: adminApi.pendingCount,
    refetchInterval: 60_000,
  });
  // Red dot on Tasks while any task (any company) has activity this admin hasn't opened.
  const tasksDot = useAdminTaskActivity().any;

  return (
    <GraphitePortalShell
      portalName="Admin Portal"
      home="/admin/dashboard"
      navBreakpoint="xl"
      nav={[
        { to: '/admin/dashboard', label: 'Dashboard', end: true },
        { to: '/admin/team', label: 'Team' },
        { to: '/admin/customers', label: 'Customers' },
        { to: '/admin/tasks', label: 'Tasks', extra: tasksDot && <NewActivityDot /> },
        { to: '/admin/billing', label: 'Billing' },
        { to: '/admin/products', label: 'Products' },
        { to: '/admin/payments', label: 'Payments' },
        {
          to: '/admin/approvals',
          label: 'Approvals',
          extra: !!pending && pending > 0 && (
            <span className="rounded-full bg-white px-1.5 py-px text-[10px] font-bold tracking-normal text-[#070A12]">
              {pending}
            </span>
          ),
        },
        { to: '/admin/reports', label: 'Report' },
      ]}
      menuItems={[
        { label: 'My Account', icon: User, to: '/admin/profile' },
        { label: 'Settings', icon: Settings, to: '/admin/settings' },
      ]}
    />
  );
}
