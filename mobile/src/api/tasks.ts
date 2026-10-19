import { API_URL } from '../config';
import { api, request, getSession } from './client';
import type {
  AssignableUser,
  ClientProfile,
  CustomerSummary,
  Task,
  TaskApproval,
  TaskAttachment,
  TaskBoard,
  TaskComment,
  TaskCommentReaction,
  TaskNote,
  TaskProgress,
} from './types';

/** A file picked on the device (document or photo library). */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
}

export type UploadProgress = (percent: number) => void;

type UploadTarget = { direct: true; uploadUrl: string; url: string } | { direct: false };

/** PUT a local file straight into blob storage through its write-only SAS URL. */
function putToBlob(uploadUrl: string, file: PickedFile, onProgress?: UploadProgress): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let blob: Blob;
    try {
      blob = await (await fetch(file.uri)).blob();
    } catch {
      reject(new Error(`Could not read "${file.name}"`));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
    xhr.setRequestHeader('Content-Type', file.mimeType || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage replied ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('The upload was interrupted'));
    xhr.send(blob);
  });
}

/**
 * Upload one chat/attachment file straight to storage (any size) and return the
 * reference the API expects. Null = send it with the request instead (storage
 * can't take direct uploads, e.g. a local dev API).
 */
async function uploadTaskFile(base: string, taskId: string, file: PickedFile, onProgress?: UploadProgress) {
  let t: UploadTarget;
  try {
    t = await api.post<UploadTarget>(`${base}/tasks/${taskId}/uploads/upload-url`, { fileName: file.name });
  } catch {
    return null;
  }
  if (!t.direct) return null;
  onProgress?.(0);
  await putToBlob(t.uploadUrl, file, onProgress);
  onProgress?.(100);
  return {
    url: t.url,
    fileName: file.name,
    contentType: file.mimeType || undefined,
    size: file.size ?? undefined,
  };
}

function multipart(fields: Record<string, string | undefined>, file: PickedFile) {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => v && form.append(k, v));
  // React Native's FormData streams a local file from { uri, name, type }.
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as never);
  return form;
}

/**
 * The task API bound to one board. Same paths the web app uses:
 *  - admin:    /customers/:clientId/tasks
 *  - client:   /client/tasks
 *  - employee: /employee/tasks
 */
export function taskApi(base: string) {
  return {
    base,
    board: () => api.get<TaskBoard>(base),
    getTask: (taskId: string) => api.get<Task>(`${base}/tasks/${taskId}`),
    mentionableUsers: (taskId: string) => api.get<AssignableUser[]>(`${base}/tasks/${taskId}/mentionable-users`),
    setProgress: (taskId: string, progress: TaskProgress) =>
      api.patch<Task>(`${base}/tasks/${taskId}/progress`, { progress }),
    setChecklist: (taskId: string, checklist: { text: string; done: boolean }[]) =>
      api.patch<Task>(`${base}/tasks/${taskId}`, { checklist }),

    addComment: async (taskId: string, body: string, file?: PickedFile, replyToId?: string, onProgress?: UploadProgress) => {
      if (file) {
        const upload = await uploadTaskFile(base, taskId, file, onProgress);
        if (upload) return api.post<TaskComment>(`${base}/tasks/${taskId}/comments`, { body, replyToId, upload });
        return request<TaskComment>(`${base}/tasks/${taskId}/comments`, {
          method: 'POST',
          body: multipart({ body: body || undefined, replyToId }, file),
        });
      }
      return api.post<TaskComment>(`${base}/tasks/${taskId}/comments`, { body, replyToId });
    },
    toggleReaction: (taskId: string, commentId: string, emoji: string) =>
      api.post<TaskCommentReaction[]>(`${base}/tasks/${taskId}/comments/${commentId}/reactions`, { emoji }),

    addNote: (taskId: string, body: string) => api.post<TaskNote>(`${base}/tasks/${taskId}/notes`, { body, kind: 'NOTE' }),

    addAttachment: async (taskId: string, file: PickedFile, onProgress?: UploadProgress) => {
      const upload = await uploadTaskFile(base, taskId, file, onProgress);
      if (upload) return api.post<TaskAttachment>(`${base}/tasks/${taskId}/attachments`, { upload });
      return request<TaskAttachment>(`${base}/tasks/${taskId}/attachments`, { method: 'POST', body: multipart({}, file) });
    },

    decideApproval: (taskId: string, approvalId: string, body: { status: 'APPROVED' | 'REJECTED'; feedback?: string | null }) =>
      api.patch<TaskApproval>(`${base}/tasks/${taskId}/approvals/${approvalId}`, body),
  };
}

export type TaskApi = ReturnType<typeof taskApi>;

export const clientTaskBase = '/client/tasks';
export const employeeTaskBase = '/employee/tasks';
export const adminTaskBase = (clientId: string) => `/customers/${encodeURIComponent(clientId)}/tasks`;

/** Admin: customers to pick a board from (the API caps a page at 100). */
export async function listCustomers(search?: string): Promise<CustomerSummary[]> {
  const q = new URLSearchParams({ pageSize: '100', sortBy: 'companyName', sortDir: 'asc' });
  if (search) q.set('search', search);
  return api.get<CustomerSummary[]>(`/customers?${q.toString()}`);
}

/** Client: own profile — used to lock Tasks while the account is suspended. */
export const clientProfile = () => api.get<ClientProfile>('/client/profile');

/** Absolute URL for a stored file (local-dev uploads come back relative). */
export function fileUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL.replace(/\/api\/?$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

export const currentUserId = () => getSession()?.user.id;
