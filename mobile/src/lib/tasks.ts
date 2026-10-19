import type { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import type { Task, TaskComment, TaskPriority, TaskProgress } from '../api/types';

type IconName = keyof typeof Ionicons.glyphMap;

export const PROGRESS_META: Record<TaskProgress, { label: string; fg: string; bg: string; icon: IconName }> = {
  NOT_STARTED: { label: 'Not started', fg: colors.textMuted, bg: colors.border, icon: 'ellipse-outline' },
  IN_PROGRESS: { label: 'In progress', fg: colors.accent, bg: colors.accentSoft, icon: 'time-outline' },
  ONGOING: { label: 'Ongoing', fg: colors.violet, bg: colors.violetSoft, icon: 'sync-outline' },
  COMPLETED: { label: 'Completed', fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' },
};

export const PROGRESS_ORDER: TaskProgress[] = ['NOT_STARTED', 'IN_PROGRESS', 'ONGOING', 'COMPLETED'];

export const PRIORITY_META: Record<TaskPriority, { label: string; fg: string; bg: string; rank: number; icon: IconName }> = {
  URGENT: { label: 'Urgent', fg: colors.danger, bg: colors.dangerSoft, rank: 0, icon: 'alert-circle' },
  IMPORTANT: { label: 'Important', fg: colors.warning, bg: colors.warningSoft, rank: 1, icon: 'chevron-up-circle' },
  MEDIUM: { label: 'Medium', fg: colors.accent, bg: colors.accentSoft, rank: 2, icon: 'remove-circle' },
  LOW: { label: 'Low', fg: colors.textMuted, bg: colors.border, rank: 3, icon: 'chevron-down-circle' },
};

/** Label colour tokens used by the web board → solid colours. */
export const LABEL_COLORS: Record<string, string> = {
  rose: '#F43F5E',
  amber: '#F59E0B',
  lime: '#84CC16',
  emerald: '#10B981',
  teal: '#14B8A6',
  sky: '#0EA5E9',
  indigo: '#6366F1',
  violet: '#8B5CF6',
  pink: '#EC4899',
  slate: '#64748B',
};

export const labelColor = (c: string) => LABEL_COLORS[c] ?? LABEL_COLORS.slate;

/** Fraction of checklist items done (0..1), or null without a checklist. */
export function checklistProgress(task: Task): number | null {
  if (!task.checklist.length) return null;
  return task.checklist.filter((c) => c.done).length / task.checklist.length;
}

export type DueState = 'none' | 'overdue' | 'today' | 'soon' | 'upcoming';

export function dueState(task: Task): DueState {
  if (task.progress === 'COMPLETED' || !task.dueDate) return 'none';
  const due = new Date(task.dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const diff = Math.round((dueDay - today) / 86_400_000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 3) return 'soon';
  return 'upcoming';
}

export const dueColor = (s: DueState) =>
  s === 'overdue' ? colors.danger : s === 'today' || s === 'soon' ? colors.warning : colors.textMuted;

export const lastComment = (t: Task): TaskComment | undefined => t.comments[t.comments.length - 1];

/** Most recent activity on a task — its last chat message, else its last edit. */
export const lastActivityAt = (t: Task) => lastComment(t)?.createdAt ?? t.updatedAt;

export const pendingApprovals = (t: Task) => t.approvals.filter((a) => a.status === 'PENDING').length;
