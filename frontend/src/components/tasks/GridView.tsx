import { useMemo, useState } from 'react';
import { ArrowUpDown, CheckSquare } from 'lucide-react';
import type { Task, TaskBucket } from '@/types';
import { cn, formatDate, initials } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/misc';
import { PRIORITY_META, PROGRESS_META, labelColor, dueState, DUE_META } from '@/lib/tasks';

type SortKey = 'title' | 'bucket' | 'progress' | 'priority' | 'dueDate';

interface Row extends Task {
  bucketName: string;
}

export function GridView({ buckets, onOpenTask }: { buckets: TaskBucket[]; onOpenTask: (task: Task) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'dueDate', dir: 'asc' });

  const rows = useMemo<Row[]>(
    () => buckets.flatMap((b) => b.tasks.map((t) => ({ ...t, bucketName: b.name }))),
    [buckets]
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'bucket':
          cmp = a.bucketName.localeCompare(b.bucketName);
          break;
        case 'progress':
          cmp = a.progress.localeCompare(b.progress);
          break;
        case 'priority':
          cmp = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
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
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <Th k="title">Task</Th>
            <Th k="bucket">Bucket</Th>
            <TableHead>Assigned</TableHead>
            <Th k="progress">Progress</Th>
            <Th k="priority">Priority</Th>
            <Th k="dueDate">Due</Th>
            <TableHead>Labels</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((t) => {
            const due = dueState(t);
            return (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => onOpenTask(t)}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {t.progress === 'COMPLETED' && <CheckSquare className="h-4 w-4 text-emerald-500" />}
                    <span className={cn(t.progress === 'COMPLETED' && 'text-muted-foreground line-through')}>{t.title}</span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{t.bucketName}</TableCell>
                <TableCell>
                  <div className="flex -space-x-2">
                    {t.assignees.slice(0, 3).map((a) => (
                      <Avatar key={a.userId} className="h-6 w-6 border-2 border-card">
                        {a.avatarUrl && <AvatarImage src={a.avatarUrl} alt={a.name} />}
                        <AvatarFallback className="text-[9px]">{initials(a.name)}</AvatarFallback>
                      </Avatar>
                    ))}
                    {t.assignees.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <span className={cn('h-2 w-2 rounded-full', PROGRESS_META[t.progress].dot)} />
                    {PROGRESS_META[t.progress].label}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-xs font-medium', PRIORITY_META[t.priority].badge)}>
                    {PRIORITY_META[t.priority].label}
                  </span>
                </TableCell>
                <TableCell className={cn('text-sm', DUE_META[due].text)}>
                  {t.dueDate ? formatDate(t.dueDate) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {t.labels.map((l) => (
                      <span key={l.id} className={cn('rounded px-1.5 py-0.5 text-xs font-medium', labelColor(l.color).chip)}>{l.name}</span>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
