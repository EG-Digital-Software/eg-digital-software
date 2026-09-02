import { api } from './client';
import type {
  ApiEnvelope,
  AssignableUser,
  Task,
  TaskAttachment,
  TaskBoard,
  TaskBucket,
  TaskComment,
  TaskLabel,
  TaskPriority,
  TaskProgress,
} from '@/types';

export interface TaskInput {
  bucketId?: string;
  title?: string;
  description?: string | null;
  progress?: TaskProgress;
  priority?: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  assignees?: AssignableUser[];
  labelIds?: string[];
  checklist?: { text: string; done?: boolean }[];
}

const unwrap = <T>(p: Promise<{ data: ApiEnvelope<T> }>) => p.then((r) => r.data.data);

/**
 * Task board API bound to a base path. The admin uses
 * `/customers/:clientId/tasks`; the client portal uses `/client/tasks`. The
 * mutating methods 404 for clients (their routes are read-only), which is fine
 * — the client UI never calls them.
 */
export function taskApi(base: string) {
  return {
    board: () => unwrap<TaskBoard>(api.get(`${base}`)),
    assignableUsers: () => unwrap<AssignableUser[]>(api.get(`${base}/assignable-users`)),
    getTask: (taskId: string) => unwrap<Task>(api.get(`${base}/tasks/${taskId}`)),

    // Buckets
    createBucket: (name: string) => unwrap<TaskBucket>(api.post(`${base}/buckets`, { name })),
    updateBucket: (bucketId: string, body: { name?: string; order?: number }) =>
      unwrap<TaskBucket>(api.patch(`${base}/buckets/${bucketId}`, body)),
    deleteBucket: (bucketId: string) => unwrap<{ id: string }>(api.delete(`${base}/buckets/${bucketId}`)),
    reorderBuckets: (orderedIds: string[]) =>
      unwrap<{ ok: boolean }>(api.patch(`${base}/buckets/reorder`, { orderedIds })),

    // Tasks
    createTask: (body: TaskInput) => unwrap<Task>(api.post(`${base}/tasks`, body)),
    updateTask: (taskId: string, body: TaskInput) => unwrap<Task>(api.patch(`${base}/tasks/${taskId}`, body)),
    moveTask: (taskId: string, bucketId: string, order: number) =>
      unwrap<Task>(api.patch(`${base}/tasks/${taskId}/move`, { bucketId, order })),
    deleteTask: (taskId: string) => unwrap<{ id: string }>(api.delete(`${base}/tasks/${taskId}`)),

    // Comments
    addComment: (taskId: string, body: string) =>
      unwrap<TaskComment>(api.post(`${base}/tasks/${taskId}/comments`, { body })),
    deleteComment: (taskId: string, commentId: string) =>
      unwrap<{ id: string }>(api.delete(`${base}/tasks/${taskId}/comments/${commentId}`)),

    // Attachments
    addAttachment: (taskId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return unwrap<TaskAttachment>(
        api.post(`${base}/tasks/${taskId}/attachments`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      );
    },
    deleteAttachment: (taskId: string, attachmentId: string) =>
      unwrap<{ id: string }>(api.delete(`${base}/tasks/${taskId}/attachments/${attachmentId}`)),

    // Labels
    createLabel: (name: string, color: string) =>
      unwrap<TaskLabel>(api.post(`${base}/labels`, { name, color })),
    updateLabel: (labelId: string, body: { name?: string; color?: string }) =>
      unwrap<TaskLabel>(api.patch(`${base}/labels/${labelId}`, body)),
    deleteLabel: (labelId: string) => unwrap<{ id: string }>(api.delete(`${base}/labels/${labelId}`)),
  };
}

export type TaskApi = ReturnType<typeof taskApi>;

export const adminTaskApi = (clientId: string) => taskApi(`/customers/${clientId}/tasks`);
export const clientTaskApi = () => taskApi('/client/tasks');
