import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { clientTaskApi } from '@/api/tasks';
import { clientApi } from '@/api/client-portal';
import { customerName } from '@/lib/customer';
import { useAuth } from '@/store/auth';
import { CLIENT_TASK_SUMMARY_KEY, isTaskUnseen, readSeen, taskActivityMeta, taskRowSeenKey } from '@/lib/taskSeen';

const isOngoing = (p: string) => p === 'IN_PROGRESS' || p === 'ONGOING';

/**
 * The customer's own view of their task board — read-only, but they can still
 * comment and attach files so it stays a two-way collaboration space.
 *
 * When an admin suspends the account, Tasks are locked: we never render (or let
 * TaskBoard fetch) the board, so a suspended client can neither open nor view
 * their tasks — even by hitting /client/tasks directly.
 */
export default function ClientTasksPage() {
  const meId = useAuth((s) => s.user?.id);
  const { data: profile, isLoading } = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });
  const suspended = (profile?.accountStatusEffective ?? profile?.accountStatus) === 'SUSPENDED';
  const { data: tasks } = useQuery({
    queryKey: CLIENT_TASK_SUMMARY_KEY,
    queryFn: clientApi.taskSummary,
    enabled: !!profile && !suspended,
  });

  const all = tasks ?? [];
  const meta = taskActivityMeta(all);
  const seen = readSeen(taskRowSeenKey(meId, 'client'));
  const stats = [
    { label: 'Total', value: all.length },
    { label: 'Ongoing', value: all.filter((t) => isOngoing(t.progress)).length, color: 'var(--vT)' },
    { label: 'Not started', value: all.filter((t) => t.progress === 'NOT_STARTED').length },
    {
      label: 'Unread updates',
      value: Object.entries(meta).filter(([id, m]) => isTaskUnseen(id, m, seen, meId)).length,
      color: 'var(--rT)',
    },
  ];

  return (
    <div className="ec-page">
      <div className="up">
        <div className="eyebrow">Task board</div>
        <h1 className="disp ec-h1">Work we’re tracking for you</h1>
        <p className="muted" style={{ margin: 0 }}>
          Open any task to see files, approvals and chat with the team.
        </p>
      </div>

      {/* Wait for the profile before deciding, so a suspended client never sees
          the board flash before the lock. */}
      {isLoading ? (
        <div className="glass skel" style={{ height: 320 }} />
      ) : suspended ? (
        <section
          className="glass up"
          style={{ padding: '56px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
        >
          <span
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(215,38,61,.1)',
              color: 'var(--rT)',
              display: 'grid',
              placeItems: 'center',
              marginBottom: 16,
            }}
          >
            <Lock className="h-6 w-6" />
          </span>
          <h2 className="disp" style={{ margin: 0, fontSize: 22 }}>
            Tasks are locked
          </h2>
          <p className="muted" style={{ margin: '8px 0 0', maxWidth: 440, lineHeight: 1.6 }}>
            Your account is currently suspended, so the Tasks area isn't available. Please contact your account manager
            to restore access.
          </p>
        </section>
      ) : (
        <>
          <div className="stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {stats.map((s) => (
              <div key={s.label} className="glass card" style={{ padding: 16 }}>
                <div className="eyebrow">{s.label}</div>
                <div className="disp stat" style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: s.color }}>
                  {tasks ? s.value : '–'}
                </div>
              </div>
            ))}
          </div>
          <section className="glass up" style={{ animationDelay: '.15s', padding: 16, overflow: 'hidden' }}>
            <TaskBoard
              api={clientTaskApi()}
              scopeKey="client"
              customerName={profile ? customerName(profile) : undefined}
              readOnly
            />
          </section>
        </>
      )}
    </div>
  );
}
