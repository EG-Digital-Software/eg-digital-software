import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LayoutGrid,
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
} from 'lucide-react';
import type { AssignableUser, Task, TaskBoard as Board, TaskPriority, TaskProgress } from '@/types';
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
import { BoardView } from './BoardView';
import { GridView } from './GridView';
import { ScheduleView } from './ScheduleView';
import { ChartsView } from './ChartsView';
import { TaskDialog } from './TaskDialog';

type ViewKey = 'board' | 'grid' | 'schedule' | 'charts';

const VIEWS: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: 'board', label: 'Board', icon: <LayoutGrid className="h-4 w-4" /> },
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

export function TaskBoard({ api, scopeKey, readOnly = false }: { api: TaskApi; scopeKey: string; readOnly?: boolean }) {
  const qc = useQueryClient();
  const queryKey = ['tasks', scopeKey];

  const boardQ = useQuery({ queryKey, queryFn: () => api.board() });
  const usersQ = useQuery({ queryKey: ['tasks', scopeKey, 'users'], queryFn: () => api.assignableUsers() });

  const [view, setView] = useState<ViewKey>('board');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; taskId?: string; bucketId?: string } | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey });
  const onErr = (e: unknown) => toast.error(apiErrorMessage(e));

  const addBucket = useMutation({ mutationFn: (name: string) => api.createBucket(name), onSuccess: invalidate, onError: onErr });
  const renameBucket = useMutation({ mutationFn: (v: { id: string; name: string }) => api.updateBucket(v.id, { name: v.name }), onSuccess: invalidate, onError: onErr });
  const delBucket = useMutation({ mutationFn: (id: string) => api.deleteBucket(id), onSuccess: invalidate, onError: onErr });
  const createLabel = useMutation({ mutationFn: (v: { name: string; color: string }) => api.createLabel(v.name, v.color), onSuccess: invalidate, onError: onErr });
  const delLabel = useMutation({ mutationFn: (id: string) => api.deleteLabel(id), onSuccess: invalidate, onError: onErr });

  const move = useMutation({
    mutationFn: (v: { taskId: string; bucketId: string; index: number }) => api.moveTask(v.taskId, v.bucketId, v.index),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Board>(queryKey);
      if (prev) qc.setQueryData<Board>(queryKey, optimisticMove(prev, v.taskId, v.bucketId, v.index));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      onErr(e);
    },
    onSettled: invalidate,
  });

  const board = boardQ.data;
  const users = usersQ.data ?? [];

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

  if (boardQ.isLoading) return <LoadingBlock label="Loading tasks…" />;
  if (boardQ.isError || !board || !filtered) return <ErrorState onRetry={() => boardQ.refetch()} />;

  const totalTasks = board.buckets.reduce((n, b) => n + b.tasks.length, 0);
  const doneTasks = board.buckets.reduce((n, b) => n + b.tasks.filter((t) => t.progress === 'COMPLETED').length, 0);

  return (
    <div className="space-y-4">
      {/* Header band */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-inner">
              <ListChecks className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight">Task board</h2>
              <p className="text-sm text-muted-foreground">
                {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'} · {doneTasks} completed · {board.buckets.length} buckets
              </p>
            </div>
          </div>
          {totalTasks > 0 && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Progress</div>
                <div className="text-sm font-semibold">{Math.round((doneTasks / totalTasks) * 100)}%</div>
              </div>
              <div className="hidden h-2.5 w-40 overflow-hidden rounded-full bg-secondary sm:block">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all" style={{ width: `${(doneTasks / totalTasks) * 100}%` }} />
              </div>
            </div>
          )}
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

      {/* Views */}
      {view === 'board' && (
        <BoardView
          buckets={filtered.buckets}
          readOnly={readOnly}
          onOpenTask={(t) => setDialog({ mode: 'edit', taskId: t.id })}
          onCreateTask={(bucketId) => setDialog({ mode: 'create', bucketId })}
          onMoveTask={(taskId, bucketId, index) => move.mutate({ taskId, bucketId, index })}
          onAddBucket={(name) => addBucket.mutate(name)}
          onRenameBucket={(id, name) => renameBucket.mutate({ id, name })}
          onDeleteBucket={(id) => delBucket.mutate(id)}
        />
      )}
      {view === 'grid' && <GridView buckets={filtered.buckets} onOpenTask={(t) => setDialog({ mode: 'edit', taskId: t.id })} />}
      {view === 'schedule' && <ScheduleView buckets={filtered.buckets} onOpenTask={(t) => setDialog({ mode: 'edit', taskId: t.id })} />}
      {view === 'charts' && <ChartsView buckets={filtered.buckets} />}

      {dialog && (
        <TaskDialog
          open
          onClose={() => setDialog(null)}
          mode={dialog.mode}
          task={dialog.mode === 'edit' ? activeTask : null}
          createBucketId={dialog.bucketId}
          buckets={board.buckets}
          labels={board.labels}
          assignableUsers={users as AssignableUser[]}
          api={api}
          scopeKey={scopeKey}
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

/** Pure helper: move a task within the board data for an optimistic update. */
function optimisticMove(board: Board, taskId: string, targetBucketId: string, index: number): Board {
  let moving: Task | undefined;
  const stripped = board.buckets.map((b) => {
    const idx = b.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return b;
    moving = b.tasks[idx];
    return { ...b, tasks: b.tasks.filter((t) => t.id !== taskId) };
  });
  if (!moving) return board;
  const moved = { ...moving, bucketId: targetBucketId };
  return {
    ...board,
    buckets: stripped.map((b) => {
      if (b.id !== targetBucketId) return b;
      const tasks = [...b.tasks];
      tasks.splice(Math.max(0, Math.min(index, tasks.length)), 0, moved);
      return { ...b, tasks };
    }),
  };
}
