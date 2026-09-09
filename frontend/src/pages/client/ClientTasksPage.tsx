import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/shared/misc';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { clientTaskApi } from '@/api/tasks';
import { clientApi } from '@/api/client-portal';
import { customerName } from '@/lib/customer';

/**
 * The customer's own view of their task board — read-only, but they can still
 * comment and attach files so it stays a two-way collaboration space.
 */
export default function ClientTasksPage() {
  const { data: profile } = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });

  return (
    <div className="space-y-6">
      <PageHeader title="Tasks" description="Work we're tracking for your account." icon={ListChecks} iconTone="sky" />
      <TaskBoard
        api={clientTaskApi()}
        scopeKey="client"
        customerName={profile ? customerName(profile) : undefined}
        readOnly
      />
    </div>
  );
}
