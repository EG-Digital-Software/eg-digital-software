import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Task, TaskBucket } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PRIORITY_META } from '@/lib/tasks';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function ScheduleView({ buckets, onOpenTask }: { buckets: TaskBucket[]; onOpenTask: (task: Task) => void }) {
  const [cursor, setCursor] = useState(() => new Date());

  const tasks = useMemo(() => buckets.flatMap((b) => b.tasks), [buckets]);
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      const key = dayKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKey(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const unscheduled = tasks.filter((t) => !t.dueDate);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{MONTHS[month]} {year}</h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>Today</Button>
          <Button size="icon" variant="outline" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-secondary/40 text-center text-xs font-semibold text-muted-foreground">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const key = date ? dayKey(date) : `empty-${i}`;
            const dayTasks = date ? byDay.get(dayKey(date)) ?? [] : [];
            const isToday = date && dayKey(date) === todayKey;
            return (
              <div
                key={key}
                className={cn(
                  'min-h-[6.5rem] border-b border-r border-border p-1.5 last:border-r-0',
                  !date && 'bg-secondary/20',
                  (i + 1) % 7 === 0 && 'border-r-0'
                )}
              >
                {date && (
                  <>
                    <div className={cn('mb-1 text-right text-xs', isToday ? 'font-bold text-primary' : 'text-muted-foreground')}>
                      {isToday ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">{date.getDate()}</span>
                      ) : (
                        date.getDate()
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayTasks.slice(0, 3).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onOpenTask(t)}
                          className="flex w-full items-center gap-1 rounded bg-card px-1.5 py-1 text-left text-[11px] shadow-sm hover:ring-1 hover:ring-primary/40"
                        >
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_META[t.priority].bar)} />
                          <span className={cn('truncate', t.progress === 'COMPLETED' && 'text-muted-foreground line-through')}>{t.title}</span>
                        </button>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="px-1 text-[11px] text-muted-foreground">+{dayTasks.length - 3} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">No due date ({unscheduled.length})</h4>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpenTask(t)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm shadow-sm hover:border-primary/40"
              >
                <span className={cn('h-2 w-2 rounded-full', PRIORITY_META[t.priority].bar)} />
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
