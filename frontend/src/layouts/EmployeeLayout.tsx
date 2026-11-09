import { Building2, ListChecks, User } from 'lucide-react';
import { employeeTaskApi } from '@/api/tasks';
import { useBoardHasNewActivity } from '@/lib/taskSeen';
import { PortalShell } from '@/components/layout/PortalShell';
import { useAuth } from '@/store/auth';
import { STAFF_TABS, useStaffAccess } from '@/lib/staffAccess';

const TASK_API = employeeTaskApi();

export function EmployeeLayout() {
  const user = useAuth((s) => s.user);
  // Red dot on Tasks while any assigned task has activity this user hasn't opened.
  const tasksDot = useBoardHasNewActivity(TASK_API, 'employee');
  // Admin sections granted through the member's roles. Customers and Tasks get
  // an "All" label so they read apart from the member's own lists.
  const { tabs } = useStaffAccess();
  const granted = STAFF_TABS.filter((t) => tabs.has(t.key)).map((t) => ({
    to: t.to,
    label: t.key === 'tasks' || t.key === 'customers' ? `All ${t.label}` : t.label,
    icon: t.icon,
  }));

  return (
    <PortalShell
      portalName="Team Portal"
      home="/employee/tasks"
      crumbRoot="Team"
      accountLine={
        user && (
          <>
            <span style={{ color: 'var(--fg)' }}>
              {user.firstName} {user.lastName}
            </span>{' '}
            · Team portal
          </>
        )
      }
      nav={[
        { to: '/employee/tasks', label: 'Tasks', icon: ListChecks, activity: tasksDot },
        { to: '/employee/customers', label: 'Customers', icon: Building2 },
        ...granted,
      ]}
      menuItems={[{ label: 'My Account', icon: User, to: '/employee/account' }]}
    />
  );
}
