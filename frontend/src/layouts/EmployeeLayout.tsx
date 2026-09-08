import { ListChecks } from 'lucide-react';
import { PortalShell } from '@/components/layout/PortalShell';

export function EmployeeLayout() {
  return (
    <PortalShell
      badge="Employee Portal"
      badgeClass="bg-sky-500/10 text-sky-600"
      home="/employee/tasks"
      accountPath="/employee/account"
      loginPath="/employee/login"
      nav={[{ to: '/employee/tasks', label: 'Task', icon: ListChecks }]}
    />
  );
}
