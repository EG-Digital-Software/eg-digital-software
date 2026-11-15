import type { Task, TaskComment } from '../api/types';

export const lastComment = (t: Task): TaskComment | undefined => t.comments[t.comments.length - 1];

/** Most recent activity on a task — its last chat message, else its last edit. */
export const lastActivityAt = (t: Task) => lastComment(t)?.createdAt ?? t.updatedAt;
