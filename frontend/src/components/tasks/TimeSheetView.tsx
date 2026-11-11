import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Clock, Download, Info, Pencil, Plus, RefreshCw } from 'lucide-react';
import type { TaskApi } from '@/api/tasks';
import { apiErrorMessage } from '@/api/client';
import { useAuth } from '@/store/auth';
import type { TaskBucket } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingBlock, ErrorState } from '@/components/shared/states';
import {
  TIME_CATEGORIES,
  TIME_STAFF,
  TIME_PRIORITIES,
  dayLabel,
  hoursLabel,
  money,
  monthLabel,
  summarisePool,
  newRequestId,
  rangeLabel,
  timeSheetCsv,
  type TimeSheetApproval,
  type TimeSheetEntryInput,
  type TimeSheetPool,
  type TimeSheetPoolInput,
} from '@/lib/timesheet';

/** Which portal the board is in — decides who may log time, approve or set pools up. */
export type TimeSheetPortal = 'admin' | 'client' | 'team';

type Summary = ReturnType<typeof summarisePool>;

const PRIORITY_TONE: Record<string, string> = {
  Phase: 'bg-secondary text-secondary-foreground',
  P1: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  P2: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  P3: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  P4: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
};

const fieldLabel = 'mb-1 block text-xs font-medium text-muted-foreground';

function Notice({ tone, children }: { tone: 'amber' | 'red' | 'blue'; children: React.ReactNode }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    blue: 'border-sky-200 bg-sky-50 text-sky-800',
  };
  const Icon = tone === 'blue' ? Info : AlertTriangle;
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', tones[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Meter({ value, max, tone }: { value: number; max: number; tone: 'navy' | 'amber' | 'red' | 'green' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const bar = { navy: 'bg-primary', amber: 'bg-amber-500', red: 'bg-red-600', green: 'bg-emerald-500' }[tone];
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cn('h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      {children}
    </div>
  );
}

/**
 * Board Time Sheet — the customer's hour pools. Each pool is shared by one or
 * more tasks and shows this month's usage, the pool balance, alerts, every
 * entry and a month-by-month summary. The admin sets pools up, the admin and
 * team log time, and the client approves extra hours once a pool runs out.
 */
export function TimeSheetView({
  api,
  scopeKey,
  portal,
  buckets,
}: {
  api: TaskApi;
  scopeKey: string;
  portal: TimeSheetPortal;
  /** The board's tasks: the admin picks pool tasks from them; the team logs only on these. */
  buckets: TaskBucket[];
}) {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const queryKey = ['tasks', scopeKey, 'timesheet'];
  const q = useQuery({ queryKey, queryFn: () => api.timeSheet() });
  const [selected, setSelected] = useState<string>('');
  const [poolForm, setPoolForm] = useState<{ pool: TimeSheetPool | null } | null>(null);

  const canManage = portal === 'admin';
  const canLog = portal === 'admin' || portal === 'team';
  const canApprove = portal === 'client' || (portal === 'admin' && user?.role === 'SUPER_ADMIN');
  const boardTasks = useMemo(() => buckets.flatMap((b) => b.tasks), [buckets]);
  const myTaskIds = useMemo(() => new Set(boardTasks.map((t) => t.id)), [boardTasks]);

  const savePool = useMutation({
    mutationFn: (v: { id?: string; body: TimeSheetPoolInput }) =>
      v.id ? api.updateTimeSheetPool(v.id, v.body) : api.createTimeSheetPool(v.body),
    onSuccess: (pool) => {
      qc.invalidateQueries({ queryKey });
      setSelected(pool.id);
      setPoolForm(null);
      toast.success('Pool saved');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (q.isLoading) return <LoadingBlock label="Loading time sheet…" />;
  if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;

  const { pools, today } = q.data;
  const pool = pools.find((p) => p.id === selected) ?? pools[0];

  return (
    <div className="space-y-4">
      {(pools.length > 1 || canManage) && (
        <div className="flex flex-wrap items-stretch gap-2" role="tablist">
          {pools.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === pool?.id}
              onClick={() => setSelected(p.id)}
              className={cn(
                'min-w-[200px] rounded-xl border px-4 py-3 text-left transition',
                p.id === pool?.id ? 'border-primary bg-card ring-2 ring-primary/10' : 'border-border bg-card/60 hover:bg-card'
              )}
            >
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.tasks.map((t) => t.taskNumber).join(' + ')}</div>
            </button>
          ))}
          {canManage && (
            <button
              type="button"
              onClick={() => setPoolForm({ pool: null })}
              className="inline-flex min-w-[160px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:text-primary"
            >
              <Plus className="h-4 w-4" /> New pool
            </button>
          )}
        </div>
      )}

      {!pool ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
            <Clock className="h-7 w-7 text-muted-foreground" />
          </div>
          <h4 className="mt-4 text-base font-semibold">No hour pool yet</h4>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {canManage
              ? 'Create a pool for the hours this customer has bought, and pick the tasks that share it.'
              : 'Time will show here once EG Eloma sets up the hours for these tasks.'}
          </p>
          {canManage && (
            <Button className="mt-4" onClick={() => setPoolForm({ pool: null })}>
              <Plus className="mr-1.5 h-4 w-4" /> Create pool
            </Button>
          )}
        </div>
      ) : (
        <PoolPanel
          key={pool.id}
          api={api}
          queryKey={queryKey}
          pool={pool}
          today={today}
          canManage={canManage}
          canLog={canLog}
          canApprove={canApprove}
          approverName={user ? `${user.firstName} ${user.lastName}`.trim() : ''}
          loggableTaskIds={portal === 'team' ? myTaskIds : null}
          onEdit={() => setPoolForm({ pool })}
        />
      )}

      {poolForm && (
        <PoolFormDialog
          pool={poolForm.pool}
          tasks={boardTasks.map((t) => ({ id: t.id, taskNumber: t.taskNumber, title: t.title }))}
          saving={savePool.isPending}
          onClose={() => setPoolForm(null)}
          onSave={(body) => savePool.mutate({ id: poolForm.pool?.id, body })}
        />
      )}
    </div>
  );
}

function PoolPanel({
  api,
  queryKey,
  pool,
  today,
  canManage,
  canLog,
  canApprove,
  approverName,
  loggableTaskIds,
  onEdit,
}: {
  api: TaskApi;
  queryKey: unknown[];
  pool: TimeSheetPool;
  today: string;
  canManage: boolean;
  canLog: boolean;
  canApprove: boolean;
  approverName: string;
  /** Team portal: only these tasks may be logged on. Null = any pool task. */
  loggableTaskIds: Set<string> | null;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const s = useMemo(() => summarisePool(pool, pool.entries, today, pool.approvals), [pool, today]);
  const multi = pool.tasks.length > 1;
  const cur = s.current;
  const labels = useMemo(() => new Map(pool.tasks.map((t) => [t.taskId, t.label?.trim() || t.taskNumber])), [pool.tasks]);
  const taskName = (id: string) => labels.get(id) ?? id;

  const entries = useMemo(() => [...pool.entries].sort((a, b) => b.date.localeCompare(a.date)), [pool.entries]);
  const months = useMemo(() => Array.from(new Set(entries.map((e) => e.date.slice(0, 7)))), [entries]);
  const [month, setMonth] = useState<string>(() => (cur && months.includes(cur.month) ? cur.month : months[0] ?? 'all'));
  const [tab, setTab] = useState<'entries' | 'monthly'>('entries');
  const [logging, setLogging] = useState(false);
  const [approving, setApproving] = useState(false);

  const shown = month === 'all' ? entries : entries.filter((e) => e.date.startsWith(month));
  const shownActual = shown.reduce((n, e) => n + e.actualHours, 0);
  const loggable = pool.tasks.filter((t) => !loggableTaskIds || loggableTaskIds.has(t.taskId));

  const terms = `${pool.poolHours} h pool shared by ${pool.tasks.map((t) => taskName(t.taskId)).join(' + ')} · ${pool.monthlyHours} h a month, up to ${pool.monthlyMax} h in a month if needed · ${money(pool.extraRate)}/h beyond the pool`;

  const refresh = () => qc.invalidateQueries({ queryKey });
  const addEntry = useMutation({
    mutationFn: (body: TimeSheetEntryInput) => api.addTimeSheetEntry(pool.id, body),
    onSuccess: (_p, body) => { refresh(); setLogging(false); setMonth(body.date.slice(0, 7)); toast.success('Time logged'); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const approve = useMutation({
    mutationFn: (body: { hours: number; reference?: string }) => api.approveTimeSheetExtra(pool.id, body),
    onSuccess: () => { refresh(); setApproving(false); toast.success('Extra hours approved'); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  function exportCsv() {
    const blob = new Blob([timeSheetCsv([...entries].reverse(), taskName)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${pool.name.replace(/[^\w.-]+/g, '-')}-time-sheet.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Clock className="h-4 w-4" /> {pool.name}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {dayLabel(pool.termStart)} – {dayLabel(pool.termEnd)} · {terms}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
          {canManage && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit pool
            </Button>
          )}
          {canApprove && (
            <Button variant="outline" size="sm" onClick={() => setApproving((v) => !v)}>
              <Plus className="mr-1.5 h-4 w-4" /> Approve extra hours
            </Button>
          )}
          {canLog && loggable.length > 0 && (
            <Button size="sm" onClick={() => setLogging((v) => !v)}>
              <Plus className="mr-1.5 h-4 w-4" /> Log time
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {s.workPaused && (
          <Notice tone="red">
            <b>Pool used up.</b> Work pauses until extra hours are approved in the customer portal at {money(pool.extraRate)}/h. P1 fixes for EG Eloma's own code continue.
          </Notice>
        )}
        {s.poolExhausted && !s.workPaused && (
          <Notice tone="blue">
            <b>Using approved extra hours.</b> {hoursLabel(s.extraRemaining)} left of {hoursLabel(s.extraApproved)} approved, billed at {money(pool.extraRate)}/h on the next monthly invoice.
          </Notice>
        )}
        {s.extraUnapproved > 0 && (
          <Notice tone="red">
            <b>{hoursLabel(s.extraUnapproved)} logged beyond the pool without approval.</b> The client needs to approve these hours in the portal before they can be invoiced.
          </Notice>
        )}
        {cur && cur.overMonthlyMax > 0 && (
          <Notice tone="red">
            <b>{monthLabel(cur.month)} is {hoursLabel(cur.overMonthlyMax)} over the {pool.monthlyMax} h monthly maximum.</b> Move that work to next month.
          </Notice>
        )}
        {cur && cur.overMonthlyHours > 0 && cur.overMonthlyMax === 0 && (
          <Notice tone="amber">
            <b>{monthLabel(cur.month)} is {hoursLabel(cur.overMonthlyHours)} over the usual {pool.monthlyHours} h.</b> Up to {pool.monthlyMax} h can be used this month if needed.
          </Notice>
        )}
        {cur && cur.monthlyAlert && cur.overMonthlyMax === 0 && cur.overMonthlyHours === 0 && (
          <Notice tone="amber">
            <b>Monthly alert:</b> {hoursLabel(cur.used)} used in {monthLabel(cur.month)} (alert at {pool.monthlyAlertAt} h, maximum {pool.monthlyMax} h).
          </Notice>
        )}
        {!s.poolExhausted && s.totalUsed >= pool.poolAlertAt && (
          <Notice tone="amber">
            <b>Pool alert:</b> {hoursLabel(s.totalUsed)} of {pool.poolHours} h used ({Math.round((s.totalUsed / pool.poolHours) * 100)}%).
          </Notice>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={cur ? `This month · ${monthLabel(cur.month)}` : 'This month'}
          value={cur ? `${hoursLabel(cur.used)} / ${pool.monthlyHours} h` : '—'}
          sub={cur ? `Up to ${pool.monthlyMax} h if needed · ${hoursLabel(s.availableThisMonth)} still available` : 'Outside the term'}
        >
          {cur && <Meter value={cur.used} max={pool.monthlyMax} tone={cur.used >= pool.monthlyMax ? 'red' : cur.used > pool.monthlyHours || cur.used >= pool.monthlyAlertAt ? 'amber' : 'navy'} />}
        </Stat>
        <Stat label="Pool balance" value={hoursLabel(Math.max(0, s.balance))} sub={`of ${pool.poolHours} h`}>
          <Meter value={Math.max(0, s.balance)} max={pool.poolHours} tone="green" />
        </Stat>
        <Stat
          label="Used to date"
          value={hoursLabel(s.totalUsed)}
          sub={`Pool alert at ${pool.poolAlertAt} h`}
        >
          <Meter value={s.totalUsed} max={pool.poolHours} tone={s.totalUsed >= pool.poolAlertAt ? 'amber' : 'navy'} />
        </Stat>
        <Stat
          label="Extra hours"
          value={s.extraApproved > 0 ? `${hoursLabel(s.extraHours)} / ${hoursLabel(s.extraApproved)}` : hoursLabel(s.extraHours)}
          sub={
            s.extraApproved > 0
              ? `${money(s.extraCharge)} so far · ${hoursLabel(s.extraRemaining)} approved hours left`
              : s.extraHours > 0
                ? `${money(s.extraCharge)} at ${money(pool.extraRate)}/h`
                : `None approved · ${money(pool.extraRate)}/h if the pool runs out`
          }
        >
          {s.extraApproved > 0 && <Meter value={s.extraHours} max={s.extraApproved} tone={s.extraRemaining <= 0 ? 'red' : 'navy'} />}
        </Stat>
      </div>

      {approving && canApprove && (
        <ApproveExtraForm
          pool={pool}
          approverName={approverName}
          saving={approve.isPending}
          onCancel={() => setApproving(false)}
          onSave={(body) => approve.mutate(body)}
        />
      )}
      {logging && canLog && (
        <LogTimeForm
          pool={pool}
          summary={s}
          today={today}
          tasks={loggable.map((t) => ({ id: t.taskId, name: taskName(t.taskId) }))}
          saving={addEntry.isPending}
          onCancel={() => setLogging(false)}
          onSave={(body) => addEntry.mutate(body)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-secondary p-1 text-sm">
          {(['entries', 'monthly'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-md px-3 py-1 font-medium transition',
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'entries' ? 'Entries' : 'Monthly summary'}
            </button>
          ))}
        </div>
        {tab === 'entries' && (
          <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" className="w-auto">
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </Select>
        )}
      </div>

      {tab === 'entries' ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          {shown.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No time logged{month !== 'all' ? ` in ${monthLabel(month)}` : ''}.
            </div>
          ) : (
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-border bg-secondary/50 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Start – End</th>
                  <th className="px-3 py-2.5">Request</th>
                  {multi && <th className="px-3 py-2.5">Task</th>}
                  <th className="px-3 py-2.5">Priority</th>
                  <th className="px-3 py-2.5">Work</th>
                  <th className="px-3 py-2.5">Staff</th>
                  <th className="px-4 py-2.5 text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((e) => {
                  return (
                    <tr key={e.id} className="align-top hover:bg-secondary/30">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{rangeLabel(e.date, e.endDate)}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted-foreground">{e.requestId}</td>
                      {multi && <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{taskName(e.taskId)}</td>}
                      <td className="px-3 py-3">
                        <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', PRIORITY_TONE[e.priority] ?? PRIORITY_TONE.Phase)}>{e.priority}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div>{e.description}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {e.category}
                          {e.notes ? ` · ${e.notes}` : ''}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{e.staff}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{e.actualHours.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-border bg-secondary/50 text-sm font-medium">
                <tr>
                  <td className="px-4 py-2.5" colSpan={multi ? 6 : 5}>
                    {shown.length} {shown.length === 1 ? 'entry' : 'entries'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{shownActual.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      ) : (
        <>
          <MonthlySummary pool={pool} summary={s} taskName={taskName} />
          <ApprovalsTable pool={pool} approvals={pool.approvals} />
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Issues that span the website and backend are logged to the task whose code caused them.
      </p>
    </section>
  );
}

function MonthlySummary({ pool, summary, taskName }: { pool: TimeSheetPool; summary: Summary; taskName: (id: string) => string }) {
  const multi = pool.tasks.length > 1;
  const num = 'px-3 py-2.5 text-right tabular-nums';
  const dash = <span className="text-muted-foreground/50">—</span>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-border bg-secondary/50 text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 text-left">Month</th>
            {multi && pool.taskIds.map((id) => <th key={id} className="px-3 py-2.5 text-right">{taskName(id)}</th>)}
            <th className="px-3 py-2.5 text-right">Used</th>
            <th className="px-3 py-2.5 text-right">Balance</th>
            <th className="px-3 py-2.5 text-right">Extra</th>
            <th className="px-4 py-2.5 text-left">Alerts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {summary.rows.map((r) => {
            const upcoming = r.status === 'upcoming';
            return (
              <tr key={r.month} className={r.status === 'current' ? 'bg-emerald-500/10' : upcoming ? 'text-muted-foreground' : ''}>
                <td className="whitespace-nowrap px-4 py-2.5 font-medium">
                  {monthLabel(r.month)}
                  {r.status === 'current' && (
                    <span className="ml-2 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Current</span>
                  )}
                </td>
                {multi && pool.taskIds.map((id) => <td key={id} className={num}>{upcoming ? dash : (r.usedByTask[id] ?? 0).toFixed(1)}</td>)}
                <td className={cn(num, 'font-medium')}>{upcoming ? dash : `${r.used.toFixed(1)} / ${pool.monthlyHours}`}</td>
                <td className={num}>{upcoming ? dash : (r.status === 'current' ? r.balanceStart - r.used : r.balanceEnd).toFixed(1)}</td>
                <td className={num}>
                  {r.extraHours > 0 ? <span className="text-red-700">{r.extraHours.toFixed(1)} · {money(r.extraCharge)}</span> : dash}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {r.overMonthlyMax > 0 && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 ring-1 ring-red-200">Over max</span>}
                    {r.overMonthlyHours > 0 && r.overMonthlyMax === 0 && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 ring-1 ring-amber-200">Over {pool.monthlyHours} h</span>
                    )}
                    {r.monthlyAlert && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 ring-1 ring-amber-200">{pool.monthlyAlertAt} h alert</span>}
                    {r.poolAlert && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 ring-1 ring-amber-200">
                        {Math.round((pool.poolAlertAt / pool.poolHours) * 100)}% pool
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalsTable({ pool, approvals }: { pool: TimeSheetPool; approvals: TimeSheetApproval[] }) {
  if (approvals.length === 0) return null;
  const total = approvals.reduce((n, a) => n + a.hours, 0);
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-secondary/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Approved extra hours
      </div>
      <table className="w-full min-w-[560px] text-sm">
        <tbody className="divide-y divide-border">
          {approvals.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{dayLabel(a.date)}</td>
              <td className="px-3 py-2.5">
                Approved by {a.approvedBy}
                {a.reference ? ` · ${a.reference}` : ''}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{hoursLabel(a.hours)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-muted-foreground">up to {money(a.hours * pool.extraRate)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border bg-secondary/50 font-medium">
          <tr>
            <td className="px-4 py-2.5" colSpan={2}>Total approved</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{hoursLabel(total)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">up to {money(total * pool.extraRate)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function LogTimeForm({
  pool,
  summary,
  today,
  tasks,
  saving,
  onSave,
  onCancel,
}: {
  pool: TimeSheetPool;
  summary: Summary;
  today: string;
  tasks: { id: string; name: string }[];
  saving: boolean;
  onSave: (body: TimeSheetEntryInput) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    date: today,
    endDate: today,
    taskId: tasks[tasks.length - 1]?.id ?? '',
    requestId: newRequestId(),
    priority: 'P4',
    category: '',
    description: '',
    staff: '',
    actualHours: '',
    notes: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const actual = parseFloat(f.actualHours);
  const hours = Number.isFinite(actual) ? actual : 0;
  const month = summary.rows.find((r) => r.month === f.date.slice(0, 7));
  const after = (month?.used ?? 0) + hours;
  const outside = f.date < pool.termStart || f.endDate > pool.termEnd;
  const backwards = !!f.endDate && f.endDate < f.date;
  const overMax = !!month && after > pool.monthlyMax;
  const available = Math.max(0, summary.balance) + summary.extraRemaining;
  const needsApproval = hours > available && f.priority !== 'P1';
  const filled = !outside && !backwards && f.endDate && f.category && f.taskId && f.requestId.trim() && f.description.trim() && f.staff.trim() && Number.isFinite(actual) && actual >= 0;

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!filled || overMax || needsApproval) return;
        onSave({
          date: f.date,
          endDate: f.endDate,
          taskId: f.taskId,
          requestId: f.requestId.trim(),
          priority: f.priority,
          category: f.category,
          description: f.description.trim(),
          staff: f.staff.trim(),
          actualHours: actual,
          notes: f.notes.trim() || undefined,
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <label>
          <span className={fieldLabel}>Start Date</span>
          <Input
            type="date"
            value={f.date}
            onChange={(e) => setF({ ...f, date: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate })}
          />
        </label>
        <label>
          <span className={fieldLabel}>End Date</span>
          <Input type="date" min={f.date} value={f.endDate} onChange={set('endDate')} />
        </label>
        {tasks.length > 1 && (
          <label>
            <span className={fieldLabel}>Task</span>
            <Select value={f.taskId} onChange={set('taskId')}>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </label>
        )}
        <label>
          <span className={fieldLabel}>Request ID</span>
          <div className="flex gap-1">
            <Input value={f.requestId} readOnly className="font-mono" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 px-2"
              title="Make a new request ID"
              aria-label="Make a new request ID"
              onClick={() => setF({ ...f, requestId: newRequestId() })}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </label>
        <label>
          <span className={fieldLabel}>Priority</span>
          <Select value={f.priority} onChange={set('priority')}>
            {TIME_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </label>
        <label>
          <span className={fieldLabel}>Category</span>
          <Select value={f.category} onChange={set('category')}>
            <option value="" disabled>Select Category</option>
            {TIME_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </label>
        <label>
          <span className={fieldLabel}>Staff</span>
          <Select value={f.staff} onChange={set('staff')}>
            <option value="" disabled>Select Staff</option>
            {TIME_STAFF.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </label>
        <label className="col-span-2 md:col-span-4">
          <span className={fieldLabel}>Description</span>
          <Input value={f.description} onChange={set('description')} />
        </label>
        <label>
          <span className={fieldLabel}>Hours</span>
          <Input type="number" min={0} step={0.05} value={f.actualHours} onChange={set('actualHours')} />
        </label>
        <label className="col-span-2 md:col-span-6">
          <span className={fieldLabel}>Notes (optional)</span>
          <Input value={f.notes} onChange={set('notes')} />
        </label>
      </div>

      {backwards && <Notice tone="red">The end date must not be before the start date.</Notice>}
      {outside && <Notice tone="red">These dates are outside the term ({dayLabel(pool.termStart)} – {dayLabel(pool.termEnd)}).</Notice>}
      {needsApproval && (
        <Notice tone="red">
          Only {hoursLabel(available)} is left in the pool and approved extra hours. The client needs to approve at least {hoursLabel(hours - available)} more before this can be logged (P1 fixes are exempt).
        </Notice>
      )}
      {overMax && month && (
        <Notice tone="red">
          This takes {monthLabel(month.month)} to {hoursLabel(after)}, over the {pool.monthlyMax} h monthly maximum. Date the work into next month.
        </Notice>
      )}
      {!overMax && month && after > pool.monthlyHours && month.used <= pool.monthlyHours && (
        <Notice tone="amber">
          This takes {monthLabel(month.month)} past the usual {pool.monthlyHours} h, to {hoursLabel(after)} (up to {pool.monthlyMax} h allowed if needed).
        </Notice>
      )}
      {!overMax && month && after >= pool.monthlyAlertAt && month.used < pool.monthlyAlertAt && (
        <Notice tone="amber">Saving this crosses the {pool.monthlyAlertAt} h monthly alert.</Notice>
      )}
      {actual === 0 && (
        <Notice tone="blue">0 h entries record work logged on another task (for example, a backend cause found while working a website ticket).</Notice>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!filled || overMax || needsApproval || saving}>
          {saving ? 'Saving…' : 'Save entry'}
        </Button>
      </div>
    </form>
  );
}

function ApproveExtraForm({
  pool,
  approverName,
  saving,
  onSave,
  onCancel,
}: {
  pool: TimeSheetPool;
  approverName: string;
  saving: boolean;
  onSave: (body: { hours: number; reference?: string }) => void;
  onCancel: () => void;
}) {
  const [hours, setHours] = useState('10');
  const [reference, setReference] = useState('');
  const [agreed, setAgreed] = useState(false);
  const h = parseFloat(hours);
  const valid = Number.isFinite(h) && h > 0;

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && agreed) onSave({ hours: h, reference: reference.trim() || undefined });
      }}
    >
      <div className="text-sm font-semibold">Approve extra hours</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label>
          <span className={fieldLabel}>Hours</span>
          <Input type="number" min={0} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
        <div>
          <span className={fieldLabel}>Rate</span>
          <div className="py-2 text-sm">{money(pool.extraRate)}/h</div>
        </div>
        <div>
          <span className={fieldLabel}>Up to</span>
          <div className="py-2 text-sm font-semibold tabular-nums">{valid ? money(h * pool.extraRate) : '—'}</div>
        </div>
        <label>
          <span className={fieldLabel}>Reference (optional)</span>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Quote or request ID" />
        </label>
      </div>
      {!valid && <Notice tone="red">Enter the hours to approve.</Notice>}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
        <span>
          I{approverName ? ` (${approverName})` : ''} approve up to {valid ? hoursLabel(h) : 'these hours'} beyond the pool at {money(pool.extraRate)}/h. Only hours actually used are invoiced, on the next monthly invoice. Approved hours end with the term on {dayLabel(pool.termEnd)}.
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!valid || !agreed || saving}>{saving ? 'Saving…' : 'Approve'}</Button>
      </div>
    </form>
  );
}

function PoolFormDialog({
  pool,
  tasks,
  saving,
  onSave,
  onClose,
}: {
  pool: TimeSheetPool | null;
  tasks: { id: string; taskNumber: string; title: string }[];
  saving: boolean;
  onSave: (body: TimeSheetPoolInput) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState(() => ({
    name: pool?.name ?? '',
    termStart: pool?.termStart ?? '',
    termEnd: pool?.termEnd ?? '',
    poolHours: String(pool?.poolHours ?? ''),
    monthlyHours: String(pool?.monthlyHours ?? ''),
    monthlyMax: String(pool?.monthlyMax ?? ''),
    monthlyAlertAt: String(pool?.monthlyAlertAt ?? ''),
    poolAlertAt: String(pool?.poolAlertAt ?? ''),
    extraRate: String(pool?.extraRate ?? ''),
  }));
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries((pool?.tasks ?? []).map((t) => [t.taskId, t.label ?? '']))
  );
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => parseFloat(v);
  const nums = ['poolHours', 'monthlyHours', 'monthlyMax', 'monthlyAlertAt', 'poolAlertAt', 'extraRate'] as const;
  const ready =
    f.name.trim() &&
    f.termStart &&
    f.termEnd &&
    f.termEnd >= f.termStart &&
    nums.every((k) => Number.isFinite(n(f[k]))) &&
    n(f.monthlyHours) > 0 &&
    n(f.monthlyHours) <= n(f.monthlyMax) &&
    Object.keys(picked).length > 0;

  const num = (label: string, k: keyof typeof f, step = '0.5', hint?: string) => (
    <label>
      <span className={fieldLabel}>{label}</span>
      <Input type="number" min={0} step={step} value={f[k]} onChange={set(k)} />
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{pool ? 'Edit hour pool' : 'New hour pool'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            onSave({
              name: f.name.trim(),
              termStart: f.termStart,
              termEnd: f.termEnd,
              poolHours: n(f.poolHours),
              monthlyHours: n(f.monthlyHours),
              monthlyMax: n(f.monthlyMax),
              monthlyAlertAt: n(f.monthlyAlertAt),
              poolAlertAt: n(f.poolAlertAt),
              extraRate: n(f.extraRate),
              tasks: Object.entries(picked).map(([taskId, label]) => ({ taskId, label: label.trim() || null })),
            });
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className={fieldLabel}>Name</span>
              <Input value={f.name} onChange={set('name')} placeholder="e.g. 3two1.com.au website" />
            </label>
            <label>
              <span className={fieldLabel}>Term start</span>
              <Input type="date" value={f.termStart} onChange={set('termStart')} />
            </label>
            <label>
              <span className={fieldLabel}>Term end</span>
              <Input type="date" value={f.termEnd} onChange={set('termEnd')} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {num('Pool hours', 'poolHours')}
            {num('Monthly hours (h)', 'monthlyHours', '0.5', 'Hours normally used in a month, e.g. 30')}
            {num('Max in a month if needed (h)', 'monthlyMax', '0.5', 'e.g. 80')}
            {num('Monthly alert at (h)', 'monthlyAlertAt')}
            {num('Pool alert at (h)', 'poolAlertAt')}
            {num('Extra-hour rate ($/h)', 'extraRate', '1')}
          </div>

          <div>
            <span className={fieldLabel}>Tasks that share this pool</span>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
              {tasks.length === 0 && <p className="px-1 py-2 text-sm text-muted-foreground">This customer has no tasks yet.</p>}
              {tasks.map((t) => {
                const on = t.id in picked;
                return (
                  <div key={t.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-secondary/40">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setPicked((p) => {
                          const next = { ...p };
                          if (e.target.checked) next[t.id] = '';
                          else delete next[t.id];
                          return next;
                        })
                      }
                    />
                    <span className="font-mono text-xs text-muted-foreground">{t.taskNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    {on && (
                      <Input
                        value={picked[t.id]}
                        onChange={(e) => setPicked((p) => ({ ...p, [t.id]: e.target.value }))}
                        placeholder="Short label, e.g. Redesign"
                        className="h-8 w-48 text-xs"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!ready || saving}>{saving ? 'Saving…' : pool ? 'Save pool' : 'Create pool'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
