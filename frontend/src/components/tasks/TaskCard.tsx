import { CheckSquare, MessageSquare, Paperclip, ListChecks, Flag } from 'lucide-react';
import type { Task } from '@/types';
import { cn, formatDate, initials } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/misc';
import { PRIORITY_META, labelColor, checklistProgress, dueState, DUE_META } from '@/lib/tasks';

/** A single Planner card. Used inside the board columns. */
export function TaskCard({
  task,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}) {
  const priority = PRIORITY_META[task.priority];
  const checklist = checklistProgress(task);
  const due = dueState(task);
  const done = task.progress === 'COMPLETED';

  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border border-border/70 bg-card p-3 text-left shadow-sm ring-1 ring-transparent transition-all duration-150',
        'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:ring-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/40',
        draggable && 'cursor-grab active:cursor-grabbing',
        done && 'opacity-75'
      )}
    >
      {/* Priority accent */}
      <span className={cn('absolute left-0 top-3 h-[calc(100%-1.5rem)] w-1 rounded-full', priority.bar)} />

      {task.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1 pl-2">
          {task.labels.map((l) => (
            <span key={l.id} className={cn('h-1.5 w-8 rounded-full', labelColor(l.color).solid)} title={l.name} />
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 pl-2">
        {done && <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
        <p className={cn('text-sm font-medium leading-snug', done && 'line-through text-muted-foreground')}>
          {task.title}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-2 text-xs text-muted-foreground">
        {task.priority !== 'MEDIUM' && task.priority !== 'LOW' && (
          <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium', priority.badge)}>
            <Flag className="h-3 w-3" />
            {priority.label}
          </span>
        )}
        {task.dueDate && (
          <span className={cn('inline-flex items-center gap-1 font-medium', DUE_META[due].text)}>
            {formatDate(task.dueDate)}
          </span>
        )}
        {checklist !== null && (
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" />
            {task.checklist.filter((c) => c.done).length}/{task.checklist.length}
          </span>
        )}
        {task.attachments.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3.5 w-3.5" />
            {task.attachments.length}
          </span>
        )}
        {task.comments.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            {task.comments.length}
          </span>
        )}
      </div>

      {task.assignees.length > 0 && (
        <div className="mt-2.5 flex items-center pl-2">
          <div className="flex -space-x-2">
            {task.assignees.slice(0, 4).map((a) => (
              <Avatar key={a.userId} className="h-6 w-6 border-2 border-card">
                {a.avatarUrl && <AvatarImage src={a.avatarUrl} alt={a.name} />}
                <AvatarFallback className="text-[9px]">{initials(a.name)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          {task.assignees.length > 4 && (
            <span className="ml-1 text-xs text-muted-foreground">+{task.assignees.length - 4}</span>
          )}
        </div>
      )}
    </button>
  );
}
