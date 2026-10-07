import { User } from 'lucide-react';
import { NewActivityDot } from '@/components/tasks/NewActivityDot';
import { employeeTaskApi } from '@/api/tasks';
import { useBoardHasNewActivity } from '@/lib/taskSeen';
import { GraphitePortalShell } from '@/components/layout/GraphitePortalShell';

const TASK_API = employeeTaskApi();

export function EmployeeLayout() {
  // Red dot on Tasks while any assigned task has activity this user hasn't opened.
  const tasksDot = useBoardHasNewActivity(TASK_API, 'employee');

  return (
    <GraphitePortalShell
      portalName="Team Portal"
      home="/employee/tasks"
      nav={[
        { to: '/employee/tasks', label: 'Tasks', extra: tasksDot && <NewActivityDot /> },
        { to: '/employee/customers', label: 'Customers' },
      ]}
      menuItems={[{ label: 'My Account', icon: User, to: '/employee/account' }]}
    />
  );
}
