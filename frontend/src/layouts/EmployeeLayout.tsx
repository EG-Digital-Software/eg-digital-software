import { Building2, ListChecks, User } from 'lucide-react';
import { employeeTaskApi } from '@/api/tasks';
import { useBoardHasNewActivity } from '@/lib/taskSeen';
import { ElomaPortalShell } from '@/components/layout/ElomaPortalShell';
import { useAuth } from '@/store/auth';

const TASK_API = employeeTaskApi();

export function EmployeeLayout() {
  const user = useAuth((s) => s.user);
  // Red dot on Tasks while any assigned task has activity this user hasn't opened.
  const tasksDot = useBoardHasNewActivity(TASK_API, 'employee');

  return (
    <ElomaPortalShell
      portalName="Team Portal"
      home="/employee/tasks"
      crumbRoot="Team"
      contextRight={
        user && (
          <>
            <b>
              {user.firstName} {user.lastName}
            </b>{' '}
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
