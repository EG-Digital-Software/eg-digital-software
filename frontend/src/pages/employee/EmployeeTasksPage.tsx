import { ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/shared/misc';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { employeeTaskApi } from '@/api/tasks';

/**
 * Employee portal — the same task board the admin/client use, scoped to the
 * tasks assigned to the signed-in staff member. Read-only (view, complete,
 * comment and attach); columns are grouped per customer.
 */
export default function EmployeeTasksPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Tasks" description="Tasks assigned to you across all customers." icon={ListChecks} iconTone="sky" />
      <TaskBoard api={employeeTaskApi()} scopeKey="employee" readOnly />
    </div>
  );
}
