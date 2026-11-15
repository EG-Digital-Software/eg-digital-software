import { API_URL } from '../config';
import { File, FileMode, UploadType } from 'expo-file-system';
import { api, request, getSession } from './client';
import type {
  AssignableUser,
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

/** Files up to this size go up in one native request; bigger ones in blocks. */
export const SINGLE_PUT_MAX = 256 * 1024 * 1024;
const BLOCK_SIZE = 8 * 1024 * 1024;
const PARALLEL = 4;
const RETRIES = 5;

const withQuery = (sasUrl: string, extra: string) => `${sasUrl}${sasUrl.includes('?') ? '&' : '?'}${extra}`;
/** Same block ids as the web ("block-000000", base64) — the API sorts by them when it finishes an upload. */
const blockId = (i: number) => btoa(`block-${String(i).padStart(6, '0')}`);

class StorageError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** One PUT with a raw body, reporting bytes sent. */
function xhrPut(url: string, body: ArrayBuffer | string, headers: Record<string, string>, onSent?: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => onSent?.(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new StorageError(`Storage replied ${xhr.status}`, xhr.status));
    xhr.onerror = () => reject(new StorageError('The upload was interrupted', 0));
    xhr.send(body);
  });
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // 403 = the upload URL was refused (expired / not allowed); retrying can't help.
      if (attempt >= RETRIES || (err instanceof StorageError && err.status === 403)) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
}

/** Upload a large file as 8 MB blocks (4 at a time), then commit them in order. */
async function putInBlocks(sasUrl: string, local: File, size: number, contentType: string, onProgress?: UploadProgress) {
  const count = Math.ceil(size / BLOCK_SIZE);
  const sent = new Array<number>(count).fill(0);
  const report = () => onProgress?.(Math.min(99, Math.round((sent.reduce((a, b) => a + b, 0) / size) * 100)));

  // One handle, reads taken in turn (the handle has a single offset).
  const handle = local.open(FileMode.ReadOnly);
  let reading: Promise<unknown> = Promise.resolve();
  const read = (i: number) => {
    const p = reading.then(async () => {
      handle.offset = i * BLOCK_SIZE;
      return handle.readBytes(Math.min(BLOCK_SIZE, size - i * BLOCK_SIZE));
    });
    reading = p.catch(() => undefined);
    return p;
  };

  try {
    let next = 0;
    const worker = async () => {
      while (next < count) {
        const i = next++;
        const chunk = await read(i);
        const body = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
        await withRetry(() =>
          xhrPut(withQuery(sasUrl, `comp=block&blockid=${encodeURIComponent(blockId(i))}`), body, { 'Content-Type': 'application/octet-stream' }, (n) => {
            sent[i] = n;
            report();
          })
        );
        sent[i] = chunk.byteLength;
        report();
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, count) }, worker));
  } finally {
    handle.close();
  }

  const list = Array.from({ length: count }, (_, i) => `<Latest>${blockId(i)}</Latest>`).join('');
  await withRetry(() =>
    xhrPut(withQuery(sasUrl, 'comp=blocklist'), `<?xml version="1.0" encoding="utf-8"?><BlockList>${list}</BlockList>`, {
      'Content-Type': 'application/xml',
      'x-ms-blob-content-type': contentType,
      'x-ms-blob-cache-control': 'public, max-age=31536000, immutable',
    })
  );
}

/**
 * PUT a local file straight into blob storage through its write-only SAS URL and
 * return the number of bytes actually sent. The API checks that exactly this
 * many bytes landed, so it must be the real file's size — the picker's
 * `fileSize` can differ from the file on disk (e.g. a converted photo).
 */
/** Put a local file to a storage upload URL (block upload above 256 MB); returns the bytes sent. */
export async function putToBlob(uploadUrl: string, file: PickedFile, onProgress?: UploadProgress): Promise<number> {
  const headers = { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': file.mimeType || 'application/octet-stream' };
  let local: File | null = null;
  try {
    local = new File(file.uri);
  } catch {
    local = null;
  }
  const diskSize = local?.exists ? local.size : null;

  // Big files go up in blocks, like the web: no size limit beyond Azure's own
  // (a single PUT stops at ~4.75 GB), and a dropped block is simply retried.
  if (local && diskSize && diskSize > SINGLE_PUT_MAX) {
    await putInBlocks(uploadUrl, local, diskSize, file.mimeType || 'application/octet-stream', onProgress);
    return diskSize;
  }

  if (local && diskSize) {
    // Native upload: streams the file itself, any size, no JS copy of the bytes.
    const res = await local.upload(uploadUrl, {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers,
      onProgress: ({ bytesSent, totalBytes }) => {
        if (totalBytes > 0) onProgress?.(Math.round((bytesSent / totalBytes) * 100));
      },
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`Storage replied ${res.status}`);
    return diskSize;
  }

  // Fallback (e.g. a content:// address the file API can't open): send a Blob.
  let blob: Blob;
  try {
    blob = await (await fetch(file.uri)).blob();
  } catch {
    throw new Error(`Could not read "${file.name}"`);
  }
  if (!blob.size) throw new Error(`Could not read "${file.name}"`);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage replied ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('The upload was interrupted'));
    xhr.send(blob);
  });
  return blob.size;
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
  let size: number;
  try {
    size = await putToBlob(t.uploadUrl, file, onProgress);
  } catch (e) {
    // A big file can't go through the API (it would sit in the server's memory),
    // so its own error stands; a small one is sent through the API instead.
    if ((file.size ?? 0) > SINGLE_PUT_MAX) throw e;
    onProgress?.(0);
    return null;
  }
  onProgress?.(100);
  return {
    url: t.url,
    fileName: file.name,
    contentType: file.mimeType || undefined,
    size,
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
/** Admin: a customer's task board. */
export const adminTaskBase = (clientId: string) => `/customers/${encodeURIComponent(clientId)}/tasks`;

/** Absolute URL for a stored file (local-dev uploads come back relative). */
export function fileUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL.replace(/\/api\/?$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

export const currentUserId = () => getSession()?.user.id;
