import { useQuery } from '@tanstack/react-query';
import { ListChecks, Lock } from 'lucide-react';
import { PageHeader } from '@/components/shared/misc';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { LoadingBlock } from '@/components/shared/states';
import { clientTaskApi } from '@/api/tasks';
import { clientApi } from '@/api/client-portal';
import { customerName } from '@/lib/customer';

/**
 * The customer's own view of their task board — read-only, but they can still
 * comment and attach files so it stays a two-way collaboration space.
 *
 * When an admin suspends the account, Tasks are locked: we never render (or let
 * TaskBoard fetch) the board, so a suspended client can neither open nor view
 * their tasks — even by hitting /client/tasks directly.
 */
export default function ClientTasksPage() {
  const { data: profile, isLoading } = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });
  const suspended = (profile?.accountStatusEffective ?? profile?.accountStatus) === 'SUSPENDED';

  return (
    <div className="space-y-6">
      <PageHeader title="Tasks" description="Work we're tracking for your account." icon={ListChecks} iconTone="sky" />
      {/* Wait for the profile before deciding, so a suspended client never sees
          the board flash before the lock. */}
      {isLoading ? (
        <LoadingBlock />
      ) : suspended ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-16 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10">
            <Lock className="h-6 w-6 text-rose-600" />
          </span>
          <h2 className="text-lg font-semibold">Tasks are locked</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Your account is currently suspended, so the Tasks area isn't available. Please contact your account
            manager to restore access.
          </p>
        </div>
      ) : (
        <TaskBoard
          api={clientTaskApi()}
          scopeKey="client"
          customerName={profile ? customerName(profile) : undefined}
          readOnly
        />
      )}
    </div>
  );
}
