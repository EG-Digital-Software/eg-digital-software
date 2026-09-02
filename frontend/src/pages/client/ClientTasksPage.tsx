import { PageHeader } from '@/components/shared/misc';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { clientTaskApi } from '@/api/tasks';

/**
 * The customer's own view of their task board — read-only, but they can still
 * comment and attach files so it stays a two-way collaboration space.
 */
export default function ClientTasksPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Tasks" description="Work we're tracking for your account." />
      <TaskBoard api={clientTaskApi()} scopeKey="client" readOnly />
    </div>
  );
}
