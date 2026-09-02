import type { TaskPriority, TaskProgress, Task } from '@/types';

export const PROGRESS_META: Record<TaskProgress, { label: string; dot: string; text: string }> = {
  NOT_STARTED: { label: 'Not started', dot: 'bg-slate-400', text: 'text-slate-600' },
  IN_PROGRESS: { label: 'In progress', dot: 'bg-blue-500', text: 'text-blue-600' },
  COMPLETED: { label: 'Completed', dot: 'bg-emerald-500', text: 'text-emerald-600' },
};

export const PROGRESS_ORDER: TaskProgress[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'];

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; badge: string; bar: string; rank: number }
> = {
  URGENT: { label: 'Urgent', badge: 'bg-rose-100 text-rose-700 border-rose-200', bar: 'bg-rose-500', rank: 0 },
  IMPORTANT: {
    label: 'Important',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    bar: 'bg-amber-500',
    rank: 1,
  },
  MEDIUM: { label: 'Medium', badge: 'bg-sky-100 text-sky-700 border-sky-200', bar: 'bg-sky-500', rank: 2 },
  LOW: { label: 'Low', badge: 'bg-slate-100 text-slate-600 border-slate-200', bar: 'bg-slate-400', rank: 3 },
};

export const PRIORITY_ORDER: TaskPriority[] = ['URGENT', 'IMPORTANT', 'MEDIUM', 'LOW'];

/** Colour palette for labels — token → Tailwind classes. */
export const LABEL_COLORS: Record<string, { chip: string; solid: string; swatch: string }> = {
  rose: { chip: 'bg-rose-100 text-rose-700', solid: 'bg-rose-500', swatch: 'bg-rose-500' },
  amber: { chip: 'bg-amber-100 text-amber-700', solid: 'bg-amber-500', swatch: 'bg-amber-500' },
  lime: { chip: 'bg-lime-100 text-lime-700', solid: 'bg-lime-500', swatch: 'bg-lime-500' },
  emerald: { chip: 'bg-emerald-100 text-emerald-700', solid: 'bg-emerald-500', swatch: 'bg-emerald-500' },
  teal: { chip: 'bg-teal-100 text-teal-700', solid: 'bg-teal-500', swatch: 'bg-teal-500' },
  sky: { chip: 'bg-sky-100 text-sky-700', solid: 'bg-sky-500', swatch: 'bg-sky-500' },
  indigo: { chip: 'bg-indigo-100 text-indigo-700', solid: 'bg-indigo-500', swatch: 'bg-indigo-500' },
  violet: { chip: 'bg-violet-100 text-violet-700', solid: 'bg-violet-500', swatch: 'bg-violet-500' },
  pink: { chip: 'bg-pink-100 text-pink-700', solid: 'bg-pink-500', swatch: 'bg-pink-500' },
  slate: { chip: 'bg-slate-100 text-slate-600', solid: 'bg-slate-500', swatch: 'bg-slate-400' },
};

export const LABEL_COLOR_TOKENS = Object.keys(LABEL_COLORS);

export function labelColor(color: string) {
  return LABEL_COLORS[color] ?? LABEL_COLORS.slate;
}

/** Fraction of checklist items done (0..1), or null if there is no checklist. */
export function checklistProgress(task: Task): number | null {
  if (!task.checklist.length) return null;
  return task.checklist.filter((c) => c.done).length / task.checklist.length;
}

export type DueState = 'none' | 'overdue' | 'today' | 'soon' | 'upcoming';

export function dueState(task: Task): DueState {
  if (task.progress === 'COMPLETED' || !task.dueDate) return 'none';
  const due = new Date(task.dueDate);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 3) return 'soon';
  return 'upcoming';
}

export const DUE_META: Record<DueState, { text: string }> = {
  none: { text: 'text-muted-foreground' },
  overdue: { text: 'text-rose-600' },
  today: { text: 'text-amber-600' },
  soon: { text: 'text-amber-600' },
  upcoming: { text: 'text-muted-foreground' },
};
