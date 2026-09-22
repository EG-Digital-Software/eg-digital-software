import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/store/auth';
import {
  Rows3,
  CalendarDays,
  PieChart,
  Search,
  Tag,
  Plus,
  Trash2,
  Filter,
  X,
  ListChecks,
  ChevronDown,
} from 'lucide-react';
import type { AssignableUser, Task, TaskBucket, TaskBoard as Board, TaskPriority, TaskProgress } from '@/types';
import type { TaskApi } from '@/api/tasks';
import { apiErrorMessage } from '@/api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { LoadingBlock, ErrorState } from '@/components/shared/states';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  PROGRESS_META,
  PROGRESS_ORDER,
  labelColor,
  LABEL_COLOR_TOKENS,
} from '@/lib/tasks';
import { GridView } from './GridView';
import { ScheduleView } from './ScheduleView';
import { ChartsView } from './ChartsView';
import { TaskDialog } from './TaskDialog';

type ViewKey = 'grid' | 'schedule' | 'charts';

const VIEWS: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: 'grid', label: 'Grid', icon: <Rows3 className="h-4 w-4" /> },
  { key: 'schedule', label: 'Schedule', icon: <CalendarDays className="h-4 w-4" /> },
  { key: 'charts', label: 'Charts', icon: <PieChart className="h-4 w-4" /> },
];

interface Filters {
  search: string;
  assignee: string;
  priority: TaskPriority | '';
  progress: TaskProgress | '';
  labelId: string;
}

const EMPTY_FILTERS: Filters = { search: '', assignee: '', priority: '', progress: '', labelId: '' };

export function TaskBoard({ api, scopeKey, customerName, readOnly = false, groupTabs = false }: { api: TaskApi; scopeKey: string; customerName?: string; readOnly?: boolean; groupTabs?: boolean }) {
  const qc = useQueryClient();
  const queryKey = ['tasks', scopeKey];

  const [view, setView] = useState<ViewKey>('grid');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // Employee portal only: the board is grouped one bucket-per-customer, shown as
  // company tabs. Holds the selected company's id; empty until one is picked, at
  // which point it defaults to the first company.
  const [activeGroup, setActiveGroup] = useState<string>('');
  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; taskId?: string; bucketId?: string } | null>(null);

  const meId = useAuth((s) => s.user?.id);
  // Poll the board so another person's change surfaces here (and lights up the
  // affected task row) without a manual refresh — paused while we're mutating.
  const boardQ = useQuery({
    queryKey,
    queryFn: () => api.board(),
    // Poll even when this window is in the background (and refresh on focus), so
    // another person's change lights up the row/customer here without a reload.
    refetchInterval: () => (qc.isMutating() === 0 ? 10000 : false),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const usersQ = useQuery({ queryKey: ['tasks', scopeKey, 'users'], queryFn: () => api.assignableUsers() });
  const apptKey = ['tasks', scopeKey, 'appointments'];
  const apptQ = useQuery({ queryKey: apptKey, queryFn: () => api.listAppointments() });

  const invalidate = () => qc.invalidateQueries({ queryKey });
  const invalidateAppts = () => qc.invalidateQueries({ queryKey: apptKey });
  const onErr = (e: unknown) => toast.error(apiErrorMessage(e));

  const bookAppt = useMutation({
    mutationFn: (body: Parameters<TaskApi['createAppointment']>[0]) => api.createAppointment(body),
    onSuccess: () => { invalidateAppts(); toast.success('Appointment booked — invites sent'); },
    onError: onErr,
  });
  const cancelAppt = useMutation({
    mutationFn: (id: string) => api.deleteAppointment(id),
    onSuccess: () => { invalidateAppts(); toast.success('Appointment cancelled'); },
    onError: onErr,
  });

  const delTask = useMutation({ mutationFn: (id: string) => api.deleteTask(id), onSuccess: () => { invalidate(); toast.success('Task deleted'); }, onError: onErr });
  const setProgress = useMutation({
    mutationFn: (v: { id: string; progress: TaskProgress }) => api.setProgress(v.id, v.progress),
    // Optimistic: flip the checkbox instantly instead of waiting for the round-trip.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Board>(queryKey);
      if (prev) {
        const completedAt = v.progress === 'COMPLETED' ? new Date().toISOString() : null;
        qc.setQueryData<Board>(queryKey, {
          ...prev,
          buckets: prev.buckets.map((b) => ({
            ...b,
            tasks: b.tasks.map((t) => (t.id === v.id ? { ...t, progress: v.progress, completedAt } : t)),
          })),
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      onErr(e);
    },
    onSettled: invalidate,
  });
  const createLabel = useMutation({ mutationFn: (v: { name: string; color: string }) => api.createLabel(v.name, v.color), onSuccess: invalidate, onError: onErr });
  const delLabel = useMutation({ mutationFn: (id: string) => api.deleteLabel(id), onSuccess: invalidate, onError: onErr });

  const board = boardQ.data;
  const users = usersQ.data ?? [];

  // ── Per-task "new activity" highlight ───────────────────
  // For each task: a signature of its activity (task creation + comments, notes,
  // attachments, approval requests/decisions) and WHO did the most recent one.
  // Every event carries an actor, so we can notify everyone except the person
  // who made the change.
  const taskMeta = useMemo<Record<string, { sig: string; lastActor: string | null }>>(() => {
    const map: Record<string, { sig: string; lastActor: string | null }> = {};
    for (const b of board?.buckets ?? []) {
      for (const t of b.tasks) {
        const events: { ts: string; actor: string | null }[] = [];
        if (t.createdAt) events.push({ ts: t.createdAt, actor: t.createdById ?? null });
        for (const c of t.comments ?? []) events.push({ ts: c.createdAt, actor: c.authorId });
        for (const n of t.notes ?? []) events.push({ ts: n.createdAt, actor: n.authorId });
        for (const a of t.attachments ?? []) events.push({ ts: a.createdAt, actor: a.uploadedById ?? null });
        for (const ap of t.approvals ?? []) {
          events.push({ ts: ap.createdAt, actor: ap.requestedById });
          if (ap.decidedAt) events.push({ ts: ap.decidedAt, actor: ap.decidedById ?? null });
        }
        let last = events[0];
        for (const e of events) if (e.ts > (last?.ts ?? '')) last = e;
        // Approval statuses are folded in so reopen/decision also changes the sig.
        const sig = `${events.length}:${last?.ts ?? ''}:${(t.approvals ?? []).map((a) => a.status).join(',')}`;
        map[t.id] = { sig, lastActor: last?.actor ?? null };
      }
    }
    return map;
  }, [board]);

  const rowSeenKey = `taskRowSeen:v2:${meId ?? 'anon'}:${scopeKey}`;
  const [seenTasks, setSeenTasks] = useState<Record<string, string>>({});
  const seenLoaded = useRef(false);
  useEffect(() => {
    if (seenLoaded.current || !board) return;
    seenLoaded.current = true;
    try {
      const raw = localStorage.getItem(rowSeenKey);
      if (raw) setSeenTasks(JSON.parse(raw));
      else {
        const base = Object.fromEntries(Object.entries(taskMeta).map(([id, m]) => [id, m.sig]));
        setSeenTasks(base);
        localStorage.setItem(rowSeenKey, JSON.stringify(base));
      }
    } catch {
      /* ignore */
    }
  }, [board, rowSeenKey, taskMeta]);

  // Opening a task (dialog) marks it seen for this user — on open and for any
  // change that lands while it's open — so viewing it clears its highlight.
  useEffect(() => {
    const id = dialog?.taskId;
    if (!seenLoaded.current || !id) return;
    const sig = taskMeta[id]?.sig;
    if (sig === undefined) return;
    setSeenTasks((s) => {
      if (s[id] === sig) return s;
      const next = { ...s, [id]: sig };
      try {
        localStorage.setItem(rowSeenKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [dialog?.taskId, taskMeta, rowSeenKey]);

  // A task is highlighted for me when its activity changed since I last opened it
  // AND I'm not the one who made that latest change.
  const isTaskUpdated = (taskId: string) => {
    if (!seenLoaded.current) return false;
    const m = taskMeta[taskId];
    if (!m) return false;
    return seenTasks[taskId] !== m.sig && m.lastActor !== meId;
  };
  // Employee portal customer selector: a customer's box lights up when it has
  // task activity the user hasn't looked at. VIEWING that customer (selecting it)
  // clears its box — so it won't stay red once you've been through it. Individual
  // task rows still clear only when each is opened.
  const bucketAgg = (bucketId: string) =>
    (board?.buckets.find((x) => x.id === bucketId)?.tasks ?? [])
      .map((t) => `${t.id}:${taskMeta[t.id]?.sig ?? ''}`)
      .join('|');
  const boxSeenKey = `taskCustBoxSeen:v2:${meId ?? 'anon'}:${scopeKey}`;
  const [seenBox, setSeenBox] = useState<Record<string, string>>({});
  const boxSeenLoaded = useRef(false);
  useEffect(() => {
    if (boxSeenLoaded.current || !board) return;
    boxSeenLoaded.current = true;
    try {
      const raw = localStorage.getItem(boxSeenKey);
      if (raw) setSeenBox(JSON.parse(raw));
      else {
        const base = Object.fromEntries(board.buckets.map((b) => [b.id, bucketAgg(b.id)]));
        setSeenBox(base);
        localStorage.setItem(boxSeenKey, JSON.stringify(base));
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, boxSeenKey]);
  const bucketBoxRed = (bucketId: string) =>
    boxSeenLoaded.current && seenBox[bucketId] !== undefined && seenBox[bucketId] !== bucketAgg(bucketId);

  // Apply filters to each bucket's task list.
  const filtered = useMemo<Board | undefined>(() => {
    if (!board) return undefined;
    const q = filters.search.trim().toLowerCase();
    const match = (t: Task) =>
      (!q || t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q)) &&
      (!filters.assignee || t.assignees.some((a) => a.userId === filters.assignee)) &&
      (!filters.priority || t.priority === filters.priority) &&
      (!filters.progress || t.progress === filters.progress) &&
      (!filters.labelId || t.labels.some((l) => l.id === filters.labelId));
    return { ...board, buckets: board.buckets.map((b) => ({ ...b, tasks: b.tasks.filter(match) })) };
  }, [board, filters]);

  const activeTask = useMemo(() => {
    if (!dialog?.taskId || !board) return null;
    for (const b of board.buckets) {
      const t = b.tasks.find((x) => x.id === dialog.taskId);
      if (t) return t;
    }
    return null;
  }, [dialog, board]);

  const hasFilters = filters.search || filters.assignee || filters.priority || filters.progress || filters.labelId;

  // Keep the customer currently being viewed marked seen (clears its box).
  useEffect(() => {
    if (!boxSeenLoaded.current || !filtered) return;
    const group = filtered.buckets.some((b) => b.id === activeGroup)
      ? activeGroup
      : filtered.buckets[0]?.id ?? '';
    if (!group) return;
    const agg = bucketAgg(group);
    setSeenBox((s) => {
      if (s[group] === agg) return s;
      const next = { ...s, [group]: agg };
      try {
        localStorage.setItem(boxSeenKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup, filtered, taskMeta, boxSeenKey]);

  if (boardQ.isLoading) return <LoadingBlock label="Loading tasks…" />;
  if (boardQ.isError || !board || !filtered) return <ErrorState onRetry={() => boardQ.refetch()} />;

  // Company tabs (employee portal): default to the first company, and fall back
  // to it if the selected one is gone from the current board.
  const effectiveGroup = filtered.buckets.some((b) => b.id === activeGroup)
    ? activeGroup
    : filtered.buckets[0]?.id ?? '';
  const visibleBuckets = !groupTabs
    ? filtered.buckets
    : filtered.buckets.filter((b) => b.id === effectiveGroup);

  const totalTasks = board.buckets.reduce((n, b) => n + b.tasks.length, 0);
  const doneTasks = board.buckets.reduce((n, b) => n + b.tasks.filter((t) => t.progress === 'COMPLETED').length, 0);

  return (
    <div className="space-y-4">
      {/* Header band */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-white p-5 shadow-sm">
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-inner">
              <ListChecks className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight">Task Board</h2>
              <p className="text-sm text-muted-foreground">
                {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'} · {doneTasks} completed
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/80 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/60">
        {/* View switcher */}
        <div className="inline-flex rounded-lg bg-secondary/70 p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                view === v.key
                  ? 'bg-card text-primary shadow-sm ring-1 ring-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {v.icon}
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            placeholder="Search tasks"
            className="h-9 w-40 rounded-lg pl-8 sm:w-56"
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>

        {/* Filters */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={cn(hasFilters && 'border-primary text-primary')}>
              <Filter className="mr-1.5 h-4 w-4" /> Filter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 p-3">
            <DropdownMenuLabel className="px-0">Filter tasks</DropdownMenuLabel>
            <div className="mt-2 space-y-2.5">
              <FilterRow label="Assignee">
                <Select value={filters.assignee} onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))} className="h-8">
                  <option value="">Anyone</option>
                  {users.map((u) => (
                    <option key={u.userId} value={u.userId}>{u.name}</option>
                  ))}
                </Select>
              </FilterRow>
              <FilterRow label="Priority">
                <Select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as TaskPriority | '' }))} className="h-8">
                  <option value="">Any</option>
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>{PRIORITY_META[p].label}</option>
                  ))}
                </Select>
              </FilterRow>
              <FilterRow label="Progress">
                <Select value={filters.progress} onChange={(e) => setFilters((f) => ({ ...f, progress: e.target.value as TaskProgress | '' }))} className="h-8">
                  <option value="">Any</option>
                  {PROGRESS_ORDER.map((p) => (
                    <option key={p} value={p}>{PROGRESS_META[p].label}</option>
                  ))}
                </Select>
              </FilterRow>
              <FilterRow label="Label">
                <Select value={filters.labelId} onChange={(e) => setFilters((f) => ({ ...f, labelId: e.target.value }))} className="h-8">
                  <option value="">Any</option>
                  {board.labels.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </FilterRow>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setFilters(EMPTY_FILTERS)}>
                  <X className="mr-1.5 h-4 w-4" /> Clear filters
                </Button>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {!readOnly && <LabelManager labels={board.labels} onCreate={(name, color) => createLabel.mutate({ name, color })} onDelete={(id) => delLabel.mutate(id)} />}

        <div className="ml-auto">
          {!readOnly && (
            <Button size="sm" onClick={() => setDialog({ mode: 'create', bucketId: board.buckets[0]?.id })} disabled={!board.buckets.length}>
              <Plus className="mr-1.5 h-4 w-4" /> New task
            </Button>
          )}
        </div>
      </div>

      {/* Customer selector — employee portal groups tasks by customer.
          A dropdown keeps the header compact when a staff member works across
          many customers. */}
      {groupTabs && board.buckets.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Customer</span>
          <GroupPicker
            buckets={board.buckets}
            filteredBuckets={filtered.buckets}
            value={effectiveGroup}
            onSelect={setActiveGroup}
            isRed={bucketBoxRed}
          />
        </div>
      )}

      {/* Views */}
      {view === 'grid' && (
        <GridView
          buckets={visibleBuckets}
          readOnly={readOnly}
          onOpenTask={(t) => setDialog({ mode: 'edit', taskId: t.id })}
          onDeleteTask={(id) => delTask.mutate(id)}
          onToggleComplete={(t) => setProgress.mutate({ id: t.id, progress: t.progress === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED' })}
          isUpdated={isTaskUpdated}
        />
      )}
      {view === 'schedule' && (
        <ScheduleView
          buckets={visibleBuckets}
          onOpenTask={(t) => setDialog({ mode: 'edit', taskId: t.id })}
          appointments={apptQ.data ?? []}
          users={users as AssignableUser[]}
          onBook={(input) => bookAppt.mutate(input)}
          onCancel={(id) => cancelAppt.mutate(id)}
          booking={bookAppt.isPending}
        />
      )}
      {view === 'charts' && <ChartsView buckets={visibleBuckets} />}

      {dialog && (
        <TaskDialog
          open
          onClose={() => setDialog(null)}
          mode={dialog.mode}
          task={dialog.mode === 'edit' ? activeTask : null}
          createBucketId={dialog.bucketId}
          buckets={board.buckets}
          assignableUsers={users as AssignableUser[]}
          api={api}
          scopeKey={scopeKey}
          customerName={customerName}
          nextTaskNumber={board.nextTaskNumber}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function LabelManager({
  labels,
  onCreate,
  onDelete,
}: {
  labels: Board['labels'];
  onCreate: (name: string, color: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('sky');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Tag className="mr-1.5 h-4 w-4" /> Labels
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-3">
        <DropdownMenuLabel className="px-0">Labels</DropdownMenuLabel>
        <div className="mt-2 space-y-1.5">
          {labels.length === 0 && <p className="text-xs text-muted-foreground">No labels yet.</p>}
          {labels.map((l) => (
            <div key={l.id} className="group flex items-center gap-2">
              <span className={cn('h-3 w-3 rounded-full', labelColor(l.color).solid)} />
              <span className="flex-1 truncate text-sm">{l.name}</span>
              <button type="button" onClick={() => onDelete(l.id)} className="opacity-0 transition group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-rose-500" />
              </button>
            </div>
          ))}
        </div>
        <DropdownMenuSeparator />
        <div className="space-y-2">
          <Input value={name} placeholder="New label" className="h-8" onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {LABEL_COLOR_TOKENS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn('h-5 w-5 rounded-full ring-offset-2 transition', labelColor(c).swatch, color === c && 'ring-2 ring-foreground')}
              />
            ))}
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={!name.trim()}
            onClick={() => { onCreate(name.trim(), color); setName(''); }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add label
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


/**
 * Employee portal customer selector. A custom dropdown (not a native <select>)
 * so each customer row can carry its own red border when it has task activity
 * the employee hasn't looked at yet — the trigger button shows the same outline
 * plus a dot when any customer is flagged.
 */
function GroupPicker({
  buckets,
  filteredBuckets,
  value,
  onSelect,
  isRed,
}: {
  buckets: TaskBucket[];
  filteredBuckets: TaskBucket[];
  value: string;
  onSelect: (id: string) => void;
  isRed: (id: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = buckets.find((b) => b.id === value);
  const anyRed = buckets.some((b) => isRed(b.id));
  const count = (id: string) => filteredBuckets.find((x) => x.id === id)?.tasks.length ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 min-w-[16rem] max-w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm shadow-sm transition hover:border-ring',
          anyRed && 'border-rose-400 ring-1 ring-rose-300'
        )}
      >
        <span className="flex-1 truncate text-left font-medium">
          {current ? `${current.name} (${count(current.id)})` : 'Select customer'}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
        {anyRed && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" aria-label="Customers with new activity" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 max-h-72 w-[20rem] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg">
          {buckets.map((b) => {
            const active = b.id === value;
            const red = isRed(b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  onSelect(b.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition',
                  active ? 'border-transparent bg-secondary' : 'border-transparent hover:bg-secondary',
                  // The specific customer with unseen activity keeps a red outline
                  // even in the open list, so the employee sees exactly which one.
                  red && 'border-rose-400 bg-rose-50/60 ring-1 ring-rose-300'
                )}
              >
                <span className="truncate font-medium">
                  {b.name} ({count(b.id)})
                </span>
                {red && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
