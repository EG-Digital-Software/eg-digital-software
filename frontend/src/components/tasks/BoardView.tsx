import { useState } from 'react';
import { Plus, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
import type { Task, TaskBucket } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { TaskCard } from './TaskCard';

// Rotating column accent colours give the board life (Trello/Planner-style).
const ACCENTS = ['bg-indigo-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-teal-500'];

interface Props {
  buckets: TaskBucket[];
  readOnly?: boolean;
  onOpenTask: (task: Task) => void;
  onCreateTask: (bucketId: string) => void;
  onMoveTask: (taskId: string, bucketId: string, index: number) => void;
  onAddBucket: (name: string) => void;
  onRenameBucket: (bucketId: string, name: string) => void;
  onDeleteBucket: (bucketId: string) => void;
}

export function BoardView({
  buckets,
  readOnly,
  onOpenTask,
  onCreateTask,
  onMoveTask,
  onAddBucket,
  onRenameBucket,
  onDeleteBucket,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overBucket, setOverBucket] = useState<string | null>(null);
  const [addingBucket, setAddingBucket] = useState(false);
  const [bucketName, setBucketName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  function handleDrop(bucketId: string, index: number) {
    if (dragId) onMoveTask(dragId, bucketId, index);
    setDragId(null);
    setOverBucket(null);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {buckets.map((bucket, bi) => (
        <div
          key={bucket.id}
          className={cn(
            'flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-secondary/60 to-secondary/20 shadow-sm transition',
            overBucket === bucket.id && 'ring-2 ring-primary/60 ring-offset-1'
          )}
          onDragOver={(e) => {
            if (!dragId || readOnly) return;
            e.preventDefault();
            setOverBucket(bucket.id);
          }}
          onDragLeave={() => setOverBucket((b) => (b === bucket.id ? null : b))}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(bucket.id, bucket.tasks.length);
          }}
        >
          {/* Accent strip */}
          <div className={cn('h-1 w-full', ACCENTS[bi % ACCENTS.length])} />

          {/* Column header */}
          <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
            {renaming === bucket.id ? (
              <Input
                autoFocus
                value={renameVal}
                className="h-7 text-sm"
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => {
                  if (renameVal.trim() && renameVal !== bucket.name) onRenameBucket(bucket.id, renameVal.trim());
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className={cn('h-2.5 w-2.5 rounded-full', ACCENTS[bi % ACCENTS.length])} />
                <span className="text-sm font-semibold">{bucket.name}</span>
                <span className="rounded-full bg-card px-2 text-xs font-medium text-muted-foreground shadow-sm">{bucket.tasks.length}</span>
              </div>
            )}
            {!readOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-background">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => { setRenaming(bucket.id); setRenameVal(bucket.name); }}>
                    <Pencil className="h-3.5 w-3.5" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-rose-600"
                    onSelect={() => {
                      if (confirm(`Delete bucket "${bucket.name}" and all its tasks?`)) onDeleteBucket(bucket.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-2.5 overflow-y-auto px-2.5 py-1.5" style={{ maxHeight: 'calc(100vh - 24rem)' }}>
            {bucket.tasks.map((task, i) => (
              <div
                key={task.id}
                onDragOver={(e) => {
                  if (!dragId || readOnly) return;
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDrop(bucket.id, i);
                }}
              >
                <TaskCard
                  task={task}
                  draggable={!readOnly}
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => { setDragId(null); setOverBucket(null); }}
                  onClick={() => onOpenTask(task)}
                />
              </div>
            ))}
            {bucket.tasks.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 bg-card/40 py-8 text-center text-xs text-muted-foreground">
                Drop tasks here
              </div>
            )}
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={() => onCreateTask(bucket.id)}
              className="m-2 mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 py-2 text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:bg-card hover:text-primary"
            >
              <Plus className="h-4 w-4" /> Add task
            </button>
          )}
        </div>
      ))}

      {/* Add bucket */}
      {!readOnly && (
        <div className="w-72 shrink-0">
          {addingBucket ? (
            <div className="rounded-xl bg-secondary/40 p-2">
              <Input
                autoFocus
                value={bucketName}
                placeholder="Bucket name"
                className="h-8"
                onChange={(e) => setBucketName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && bucketName.trim()) {
                    onAddBucket(bucketName.trim());
                    setBucketName('');
                    setAddingBucket(false);
                  }
                  if (e.key === 'Escape') setAddingBucket(false);
                }}
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (bucketName.trim()) { onAddBucket(bucketName.trim()); setBucketName(''); setAddingBucket(false); }
                  }}
                >
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingBucket(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingBucket(true)}
              className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <Plus className="h-4 w-4" /> Add bucket
            </button>
          )}
        </div>
      )}
    </div>
  );
}
