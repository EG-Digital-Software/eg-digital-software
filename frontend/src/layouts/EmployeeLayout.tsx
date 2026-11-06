import { Building2, ListChecks, User } from 'lucide-react';
import { employeeTaskApi } from '@/api/tasks';
import { useBoardHasNewActivity } from '@/lib/taskSeen';
import { PortalShell } from '@/components/layout/PortalShell';
import { useAuth } from '@/store/auth';

const TASK_API = employeeTaskApi();

export function EmployeeLayout() {
  const user = useAuth((s) => s.user);
  // Red dot on Tasks while any assigned task has activity this user hasn't opened.
  const tasksDot = useBoardHasNewActivity(TASK_API, 'employee');

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
      ]}
      menuItems={[{ label: 'My Account', icon: User, to: '/employee/account' }]}
    />
  );
}
