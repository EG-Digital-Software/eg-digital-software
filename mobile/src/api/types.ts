// Mirrors the web app's task types (frontend/src/types) — same API, same shapes.

export type Role = 'SUPER_ADMIN' | 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE';

export interface User {
  id: string;
  role: Role;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
}

export type TaskProgress = 'NOT_STARTED' | 'IN_PROGRESS' | 'ONGOING' | 'COMPLETED';
export type TaskPriority = 'URGENT' | 'IMPORTANT' | 'MEDIUM' | 'LOW';

export interface TaskLabel {
  id: string;
  name: string;
  color: string;
}

export interface TaskAssignee {
  id?: string;
  userId: string;
  userType: Role;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
}

export type AssignableUser = Omit<TaskAssignee, 'id'>;

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  order: number;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  kind?: string | null;
  fileName: string;
  url: string;
  size: number;
  contentType?: string | null;
  uploadedById?: string | null;
  uploadedByName?: string | null;
  createdAt: string;
}

export interface TaskCommentReaction {
  id: string;
  commentId: string;
  userId: string;
  userType: Role;
  userName: string;
  emoji: string;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  authorType: Role;
  authorName: string;
  body: string;
  createdAt: string;
  attachments?: TaskAttachment[];
  reactions?: TaskCommentReaction[];
  replyToId?: string | null;
}

export type TaskNoteKind = 'NOTE' | 'ACCESS_POINT';

export interface TaskNote {
  id: string;
  taskId: string;
  kind?: TaskNoteKind;
  authorId: string;
  authorType: Role;
  authorName: string;
  subject?: string | null;
  body: string;
  createdAt: string;
}

export type TaskApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface TaskApproval {
  id: string;
  taskId: string;
  subject: string;
  message: string;
  status: TaskApprovalStatus;
  feedback?: string | null;
  requestedByName: string;
  decidedByName?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  attachments?: TaskAttachment[];
  parentId?: string | null;
}

export interface Task {
  id: string;
  taskNumber: string;
  customerId: string;
  bucketId: string;
  title: string;
  description?: string | null;
  descriptionAuthorName?: string | null;
  descriptionUpdatedAt?: string | null;
  progress: TaskProgress;
  priority: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  order: number;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssignee[];
  labels: TaskLabel[];
  checklist: ChecklistItem[];
  comments: TaskComment[];
  notes: TaskNote[];
  attachments: TaskAttachment[];
  archive: TaskAttachment[];
  approvals: TaskApproval[];
}

export interface TaskBucket {
  id: string;
  name: string;
  order: number;
  tasks: Task[];
}

export interface TaskBoard {
  buckets: TaskBucket[];
  labels: TaskLabel[];
}

export interface CustomerSummary {
  id: string;
  clientId: string;
  companyName?: string | null;
  contactPerson?: string | null;
}

export interface ClientProfile {
  clientId: string;
  companyName?: string | null;
  contactPerson?: string | null;
  accountStatus?: string | null;
  accountStatusEffective?: string | null;
}
