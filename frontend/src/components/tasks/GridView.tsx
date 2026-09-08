import { useMemo, useState } from 'react';
import { ArrowUpDown, Pencil, Trash2, Eye, Check } from 'lucide-react';
import type { Task, TaskBucket } from '@/types';
import { cn, formatDate } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PRIORITY_META, PROGRESS_META, dueState, DUE_META } from '@/lib/tasks';

type SortKey = 'taskNumber' | 'title' | 'progress' | 'priority' | 'startDate' | 'dueDate';

export function GridView({
  buckets,
  customerName,
  readOnly = false,
  onOpenTask,
  onDeleteTask,
  onToggleComplete,
}: {
  buckets: TaskBucket[];
  customerName?: string;
  readOnly?: boolean;
  onOpenTask: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
  onToggleComplete?: (task: Task) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'taskNumber', dir: 'asc' });

  const rows = useMemo<Task[]>(() => buckets.flatMap((b) => b.tasks), [buckets]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case 'taskNumber':
          cmp = a.taskNumber.localeCompare(b.taskNumber, undefined, { numeric: true });
          break;
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'progress':
          cmp = a.progress.localeCompare(b.progress);
          break;
        case 'priority':
          cmp = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
          break;
        case 'startDate':
          cmp = (a.startDate ? new Date(a.startDate).getTime() : Infinity) -
            (b.startDate ? new Date(b.startDate).getTime() : Infinity);
          break;
        case 'dueDate':
          cmp = (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
            (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
          break;
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        <ArrowUpDown className={cn('h-3 w-3', sort.key === k ? 'text-foreground' : 'text-muted-foreground/40')} />
      </button>
    </TableHead>
  );

  if (rows.length === 0) {
    return <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">No tasks yet.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <Th k="taskNumber">Task No.</Th>
            <Th k="title">Task</Th>
            <TableHead>Assigned</TableHead>
            <Th k="progress">Progress</Th>
            <Th k="priority">Priority</Th>
            <Th k="startDate">Start date</Th>
            <Th k="dueDate">End date</Th>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((t) => {
            const due = dueState(t);
            const ProgressIcon = PROGRESS_META[t.progress].icon;
            const PriorityIcon = PRIORITY_META[t.priority].icon;
            const done = t.progress === 'COMPLETED';
            return (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => onOpenTask(t)}>
                <TableCell className="pr-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => onToggleComplete?.(t)}
                    title={done ? 'Mark as not started' : 'Mark as completed'}
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full border-2 transition',
                      done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40 hover:border-emerald-500'
                    )}
                  >
                    {done && <Check className="h-3 w-3" />}
                  </button>
                </TableCell>
                <TableCell className="font-medium tabular-nums">{t.taskNumber}</TableCell>
                <TableCell className="font-medium">
                  <span className={cn(done && 'text-muted-foreground line-through')}>{t.title}</span>
                </TableCell>
                <TableCell className="text-sm">{customerName ?? '—'}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <ProgressIcon className={cn('h-4 w-4', PROGRESS_META[t.progress].text)} />
                    {PROGRESS_META[t.progress].label}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium', PRIORITY_META[t.priority].badge)}>
                    <PriorityIcon className="h-3.5 w-3.5" />
                    {PRIORITY_META[t.priority].label}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {t.startDate ? formatDate(t.startDate) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className={cn('text-sm', DUE_META[due].text)}>
                  {t.dueDate ? formatDate(t.dueDate) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  {readOnly ? (
                    <button
                      type="button"
                      onClick={() => onOpenTask(t)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenTask(t)}
                        title="Edit task"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm(`Delete ${t.taskNumber} "${t.title}"? This cannot be undone.`)) onDeleteTask?.(t.id); }}
                        title="Delete task"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
