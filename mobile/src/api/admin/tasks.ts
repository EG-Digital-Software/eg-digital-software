import { api, request } from '../client';
import { adminTaskBase, putToBlob, SINGLE_PUT_MAX, type PickedFile, type UploadProgress } from '../tasks';
import type {
  AssignableUser,
  Task,
  TaskApproval,
  TaskAttachment,
  TaskBoard,
  TaskBucket,
  TaskLabel,
  TaskNote,
  TaskPriority,
  TaskProgress,
} from '../types';

/**
 * Admin task board API — `/customers/:clientId/tasks`, the same routes the web
 * admin portal uses (backend `buildTaskRouter()`). Read-only calls the shared
 * `taskApi()` already covers (board, task, comments) stay there.
 */

// ─── Types the shared Task type doesn't carry ─────────────

/** Tabs an admin/team member switches on per task. */
export interface TaskTabs {
  showSocialDashboard?: boolean;
  showContentCalendar?: boolean;
  showSeoDashboard?: boolean;
  showLocalListing?: boolean;
  showAzurePerformance?: boolean;
}
export type AdminTask = Task & TaskTabs & { createdById?: string | null };
export type AdminBoard = TaskBoard & { nextTaskNumber?: string };

export interface TaskInput extends TaskTabs {
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
  assignedTeam?: string | null;
}

export interface AccessPointLog {
  id: string;
  userName: string;
  action: 'UNLOCKED' | 'ADDED' | 'EDITED' | 'DELETED' | 'PIN_FAILED';
  detail: string | null;
  createdAt: string;
}
export interface AccessPointData {
  entries: TaskNote[];
  log: AccessPointLog[];
}

export interface Appointment {
  id: string;
  title: string;
  location?: string | null;
  notes?: string | null;
  startAt: string;
  endAt: string;
  createdByName: string;
  attendees: { id: string; name: string; email: string }[];
}
export interface AppointmentInput {
  title: string;
  startAt: string;
  endAt: string;
  location?: string;
  notes?: string;
  attendees: { name?: string; email: string }[];
}

/** A customer's purchased hours product (hours are logged against it). */
export interface HourProduct {
  id: string;
  product: string;
  purchasedAt: string;
  totalHours: number;
  usedHours: number;
  balanceHours: number;
}
export interface TimeEntry {
  id: string;
  customerProductId: string;
  product: string | null;
  workDate: string;
  hours: number;
  note: string | null;
  authorId: string;
  authorName: string;
  createdAt: string;
}
export interface TimeEntryInput {
  customerProductId: string;
  workDate: string; // yyyy-mm-dd
  hours: number;
  note?: string | null;
}

export type ContentPostStatus =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED';

export interface ContentPost {
  id: string;
  title: string;
  caption: string;
  hashtags: string;
  firstComment: string;
  media: { url: string; name: string | null; type: string | null } | null;
  platforms: string[];
  scheduledAt: string | null;
  timeZone: string;
  status: ContentPostStatus;
  approvedByName: string | null;
  publishedAt: string | null;
  lastError: string | null;
  createdByName: string | null;
  published: Record<string, string | null>;
  checks: { ok: boolean; title: string; detail: string }[];
}
export interface ContentCalendar {
  customerName: string;
  taskTitle: string;
  autoPublish: boolean;
  canEdit: boolean;
  canApprove: boolean;
  metaConfigured: boolean;
  platforms: { key: string; name: string; connected: boolean; canPublish: boolean; note: string }[];
  timeZones: string[];
  posts: ContentPost[];
  attachments: { id: string; fileName: string; url: string; contentType: string | null }[];
}
export interface ContentPostInput {
  title?: string;
  caption?: string;
  hashtags?: string;
  firstComment?: string;
  attachmentId?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  platforms?: string[];
  scheduledAt?: string | null;
  timeZone?: string;
}

export type ReportKind = 'seo' | 'local' | 'azure';
export interface ReportPayload {
  kind: ReportKind;
  customerName: string;
  taskTitle: string;
  canEdit: boolean;
  team: string[];
  data: Record<string, unknown>;
  updatedAt: string | null;
  updatedByName: string | null;
}

// ─── Direct-to-storage uploads (approval files) ───────────

type UploadTarget = { direct: true; uploadUrl: string; url: string } | { direct: false };

/**
 * Upload approval files straight to storage and return their references. Null =
 * send them with the request instead (no direct storage, or a small upload failed).
 */
async function uploadApprovalFiles(base: string, taskId: string, files: PickedFile[], onProgress?: UploadProgress) {
  if (!files.length) return null;
  const targets: Extract<UploadTarget, { direct: true }>[] = [];
  try {
    for (const f of files) {
      const t = await api.post<UploadTarget>(`${base}/tasks/${taskId}/approvals/upload-url`, { fileName: f.name });
      if (!t.direct) return null;
      targets.push(t);
    }
  } catch {
    return null;
  }
  const total = files.reduce((n, f) => n + (f.size ?? 0), 0) || 1;
  const done = new Array<number>(files.length).fill(0);
  const sizes: number[] = [];
  onProgress?.(0);
  for (let i = 0; i < files.length; i++) {
    try {
      const size = files[i]!.size ?? 0;
      sizes[i] = await putToBlob(targets[i]!.uploadUrl, files[i]!, (pct) => {
        done[i] = (pct / 100) * size;
        onProgress?.(Math.min(99, Math.round((done.reduce((a, b) => a + b, 0) / total) * 100)));
      });
    } catch (e) {
      // Small sets can still go through the API; a large one reports the error.
      if (total <= SINGLE_PUT_MAX && total <= 100 * 1024 * 1024) return null;
      throw e;
    }
  }
  onProgress?.(100);
  return files.map((f, i) => ({ url: targets[i]!.url, fileName: f.name, contentType: f.mimeType || undefined, size: sizes[i] }));
}

function approvalForm(subject: string, message: string, files: PickedFile[]) {
  const form = new FormData();
  form.append('subject', subject);
  form.append('message', message);
  files.forEach((f) => form.append('files', { uri: f.uri, name: f.name, type: f.mimeType || 'application/octet-stream' } as never));
  return form;
}

async function sendApproval(base: string, taskId: string, url: string, body: { subject: string; message: string; files: PickedFile[] }, onProgress?: UploadProgress) {
  const uploads = await uploadApprovalFiles(base, taskId, body.files, onProgress);
  if (uploads) return api.post<TaskApproval>(url, { subject: body.subject, message: body.message, uploads });
  if (body.files.length) return request<TaskApproval>(url, { method: 'POST', body: approvalForm(body.subject, body.message, body.files) });
  return api.post<TaskApproval>(url, { subject: body.subject, message: body.message });
}

const accessHeaders = (key: string) => ({ 'X-Access-Point-Key': key });

/** Requests that carry the Access Point unlock key. */
function withHeader<T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', key: string, body?: unknown): Promise<T> {
  return request<T>(path, { method, body, headers: accessHeaders(key) });
}

// ─── Board Time Sheet (hour pools) ────────────────────────

/** Sign-off on a logged entry (see the web's lib/timesheet). */
export type EntryStatus = 'ADMIN_PENDING' | 'ADMIN_REJECTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface TimeSheetEntry {
  id: string;
  taskId: string;
  /** YYYY-MM-DD */
  date: string;
  endDate: string;
  requestId: string;
  priority: string;
  category: string;
  description: string;
  staff: string;
  actualHours: number;
  notes?: string | null;
  authorName: string;
  status: EntryStatus;
  rejectReason?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
}
export interface TimeSheetApproval {
  id: string;
  date: string;
  hours: number;
  reference?: string | null;
  approvedBy: string;
}
export interface TimeSheetPool {
  id: string;
  customerId: string;
  name: string;
  taskIds: string[];
  termStart: string;
  termEnd: string;
  poolHours: number;
  monthlyHours: number;
  monthlyMax: number;
  monthlyAlertAt: number;
  poolAlertAt: number;
  extraRate: number;
  tasks: { taskId: string; taskNumber: string; title: string; label?: string | null }[];
  entries: TimeSheetEntry[];
  approvals: TimeSheetApproval[];
}
export interface TimeSheetData {
  today: string;
  pools: TimeSheetPool[];
}
export interface TimeSheetPoolInput {
  name: string;
  termStart: string;
  termEnd: string;
  poolHours: number;
  monthlyHours: number;
  monthlyMax: number;
  monthlyAlertAt: number;
  poolAlertAt: number;
  extraRate: number;
  tasks: { taskId: string; label?: string | null }[];
}
export interface TimeSheetEntryInput {
  taskId: string;
  date: string;
  endDate: string;
  requestId: string;
  priority: string;
  category: string;
  description: string;
  staff: string;
  actualHours: number;
  notes?: string;
}

/** Activity fields of a task, as the admin activity feed returns them. */
export interface ActivityTask {
  id: string;
  clientId?: string;
  createdAt?: string;
  createdById?: string | null;
  comments?: { createdAt: string; authorId: string }[];
  notes?: { createdAt: string; authorId: string }[];
  attachments?: { createdAt: string; uploadedById?: string | null }[];
  approvals?: { createdAt: string; requestedById?: string; decidedAt?: string | null; decidedById?: string | null; status: string }[];
}

// ─── The API ──────────────────────────────────────────────

export function adminTasks(clientId: string) {
  const base = adminTaskBase(clientId);
  const t = (taskId: string) => `${base}/tasks/${taskId}`;
  return {
    base,
    board: () => api.get<AdminBoard>(base),
    assignableUsers: () => api.get<AssignableUser[]>(`${base}/assignable-users`),

    // Buckets (columns)
    createBucket: (name: string) => api.post<TaskBucket>(`${base}/buckets`, { name }),
    updateBucket: (bucketId: string, body: { name?: string; order?: number }) => api.patch<TaskBucket>(`${base}/buckets/${bucketId}`, body),
    deleteBucket: (bucketId: string) => api.del<{ id: string }>(`${base}/buckets/${bucketId}`),
    reorderBuckets: (orderedIds: string[]) => api.patch<{ ok: boolean }>(`${base}/buckets/reorder`, { orderedIds }),

    // Tasks
    createTask: (body: TaskInput) => api.post<AdminTask>(`${base}/tasks`, body),
    updateTask: (taskId: string, body: TaskInput) => api.patch<AdminTask>(t(taskId), body),
    moveTask: (taskId: string, bucketId: string, order: number) => api.patch<AdminTask>(`${t(taskId)}/move`, { bucketId, order }),
    deleteTask: (taskId: string) => api.del<{ id: string }>(t(taskId)),

    // Labels
    createLabel: (name: string, color: string) => api.post<TaskLabel>(`${base}/labels`, { name, color }),
    deleteLabel: (labelId: string) => api.del<{ id: string }>(`${base}/labels/${labelId}`),

    // Notes
    addNote: (taskId: string, body: string) => api.post<TaskNote>(`${t(taskId)}/notes`, { body, kind: 'NOTE' }),
    editNote: (taskId: string, noteId: string, body: string) => api.patch<TaskNote>(`${t(taskId)}/notes/${noteId}`, { body }),
    deleteNote: (taskId: string, noteId: string) => api.del<{ id: string }>(`${t(taskId)}/notes/${noteId}`),

    // Attachments (adding goes through the shared taskApi upload)
    deleteAttachment: (taskId: string, attachmentId: string) => api.del<{ id: string }>(`${t(taskId)}/attachments/${attachmentId}`),

    // Archive (admin-only media store)
    addArchive: (taskId: string, file: PickedFile) => {
      const form = new FormData();
      form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as never);
      return request<TaskAttachment>(`${t(taskId)}/archive`, { method: 'POST', body: form });
    },
    renameArchive: (taskId: string, attachmentId: string, fileName: string) =>
      api.patch<TaskAttachment>(`${t(taskId)}/archive/${attachmentId}`, { fileName }),
    deleteArchive: (taskId: string, attachmentId: string) => api.del<{ id: string }>(`${t(taskId)}/archive/${attachmentId}`),

    // Approvals
    submitApproval: (taskId: string, body: { subject: string; message: string; files: PickedFile[] }, onProgress?: UploadProgress) =>
      sendApproval(base, taskId, `${t(taskId)}/approvals`, body, onProgress),
    resubmitApproval: (taskId: string, approvalId: string, body: { subject: string; message: string; files: PickedFile[] }, onProgress?: UploadProgress) =>
      sendApproval(base, taskId, `${t(taskId)}/approvals/${approvalId}/resubmit`, body, onProgress),
    decideApproval: (taskId: string, approvalId: string, body: { status: 'APPROVED' | 'REJECTED'; feedback?: string | null }) =>
      api.patch<TaskApproval>(`${t(taskId)}/approvals/${approvalId}`, body),
    reopenApproval: (taskId: string, approvalId: string) => api.post<TaskApproval>(`${t(taskId)}/approvals/${approvalId}/reopen`),
    reopenResubmitWindow: (taskId: string, approvalId: string) =>
      api.post<TaskApproval>(`${t(taskId)}/approvals/${approvalId}/reopen-resubmit`),
    deleteApproval: (taskId: string, approvalId: string) => api.del<{ id: string }>(`${t(taskId)}/approvals/${approvalId}`),

    // Access Point — the signed-in user's PIN opens it and returns a short-lived key.
    unlockAccessPoint: (taskId: string, pin: string) => api.post<AccessPointData & { key: string }>(`${t(taskId)}/access-point/unlock`, { pin }),
    getAccessPoint: (taskId: string, key: string) => withHeader<AccessPointData>(`${t(taskId)}/access-point`, 'GET', key),
    addAccessEntry: (taskId: string, key: string, body: string) =>
      withHeader<TaskNote>(`${t(taskId)}/notes`, 'POST', key, { body, kind: 'ACCESS_POINT' }),
    editAccessEntry: (taskId: string, key: string, noteId: string, body: string) =>
      withHeader<TaskNote>(`${t(taskId)}/notes/${noteId}`, 'PATCH', key, { body }),
    deleteAccessEntry: (taskId: string, key: string, noteId: string) =>
      withHeader<{ id: string }>(`${t(taskId)}/notes/${noteId}`, 'DELETE', key),

    // Hours logged on a task, from the customer's purchased hours products
    hourProducts: (taskId: string) => api.get<HourProduct[]>(`${t(taskId)}/hour-products`),
    timeEntries: (taskId: string) => api.get<TimeEntry[]>(`${t(taskId)}/time-entries`),
    addTimeEntry: (taskId: string, body: TimeEntryInput) => api.post<TimeEntry>(`${t(taskId)}/time-entries`, body),
    deleteTimeEntry: (taskId: string, entryId: string) => api.del<{ id: string }>(`${t(taskId)}/time-entries/${entryId}`),

    // Appointments (board-wide; booking emails invites)
    appointments: () => api.get<Appointment[]>(`${base}/appointments`),
    createAppointment: (body: AppointmentInput) => api.post<Appointment>(`${base}/appointments`, body),
    deleteAppointment: (id: string) => api.del<{ id: string }>(`${base}/appointments/${id}`),

    // Content Calendar
    contentCalendar: (taskId: string) => api.get<ContentCalendar>(`${t(taskId)}/content`),
    setContentAutoPublish: (taskId: string, on: boolean) =>
      request<{ autoPublish: boolean }>(`${t(taskId)}/content/auto-publish`, { method: 'PUT', body: { on } }),
    createContentPost: (taskId: string, body: ContentPostInput) => api.post<{ id: string }>(`${t(taskId)}/content/posts`, body),
    updateContentPost: (taskId: string, postId: string, body: ContentPostInput) =>
      api.patch<{ ok: true }>(`${t(taskId)}/content/posts/${postId}`, body),
    deleteContentPost: (taskId: string, postId: string) => api.del<{ ok: true }>(`${t(taskId)}/content/posts/${postId}`),
    contentPostAction: (taskId: string, postId: string, action: 'request-approval' | 'schedule' | 'unschedule' | 'publish') =>
      api.post<{ ok: true }>(`${t(taskId)}/content/posts/${postId}/${action}`),
    decideContentPost: (taskId: string, postId: string, approve: boolean, note?: string) =>
      api.post<{ ok: true }>(`${t(taskId)}/content/posts/${postId}/decision`, { approve, note }),

    // Reports (SEO Dashboard, Local Listing, Azure Performance) and Social dashboard — read only here
    report: (taskId: string, kind: ReportKind) => api.get<ReportPayload>(`${t(taskId)}/reports/${kind}`),
    saveReport: (taskId: string, kind: ReportKind, patch: unknown) => request<unknown>(`${t(taskId)}/reports/${kind}`, { method: 'PUT', body: patch }),
    social: (taskId: string) => api.get<Record<string, unknown>>(`${t(taskId)}/social`),
    saveSocial: (taskId: string, patch: unknown) => request<unknown>(`${t(taskId)}/social`, { method: 'PUT', body: patch }),
    saveSocialMetrics: (taskId: string, rows: unknown[]) => request<unknown>(`${t(taskId)}/social/metrics`, { method: 'PUT', body: { rows } }),
    syncSocial: (taskId: string) => api.post<unknown>(`${t(taskId)}/social/sync`),
    connectSocial: (taskId: string, provider: string) => api.post<{ url: string }>(`${t(taskId)}/social/connect/${encodeURIComponent(provider)}`),
    selectSocialAccounts: (taskId: string, connectionId: string, body: unknown) => api.patch<unknown>(`${t(taskId)}/social/connections/${connectionId}`, body),
    disconnectSocial: (taskId: string, connectionId: string) => api.del<unknown>(`${t(taskId)}/social/connections/${connectionId}`),

    // Board Time Sheet
    timeSheet: () => api.get<TimeSheetData>(`${base}/timesheet`),
    createTimeSheetPool: (body: TimeSheetPoolInput) => api.post<TimeSheetPool>(`${base}/timesheet/pools`, body),
    updateTimeSheetPool: (poolId: string, body: TimeSheetPoolInput) => api.patch<TimeSheetPool>(`${base}/timesheet/pools/${poolId}`, body),
    addTimeSheetEntry: (poolId: string, body: TimeSheetEntryInput) => api.post<TimeSheetPool>(`${base}/timesheet/pools/${poolId}/entries`, body),
    updateTimeSheetEntry: (poolId: string, entryId: string, body: TimeSheetEntryInput) =>
      request<TimeSheetPool>(`${base}/timesheet/pools/${poolId}/entries/${entryId}`, { method: 'PUT', body }),
    deleteTimeSheetEntry: (poolId: string, entryId: string) => api.del<TimeSheetPool>(`${base}/timesheet/pools/${poolId}/entries/${entryId}`),
    approveTimeSheetExtra: (poolId: string, body: { hours: number; reference?: string }) =>
      api.post<TimeSheetPool>(`${base}/timesheet/pools/${poolId}/approvals`, body),
  };
}

export type AdminTasksApi = ReturnType<typeof adminTasks>;

/** Admin: decide a team member's time-sheet request over the monthly maximum. */
export const decideTimeSheetRequest = (entryId: string, body: { decision: 'APPROVED' | 'REJECTED'; reason?: string }) =>
  api.post<unknown>(`/admin/timesheet-requests/${entryId}/decision`, body);

/** Admin: activity of every customer's tasks (drives the "new activity" dots). */
export const taskActivityByTask = () => api.get<(ActivityTask & { clientId: string })[]>('/admin/tasks/activity/tasks');
