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
  /** Team the task is assigned to; clients see this instead of employees. */
  assignedTeam?: string | null;
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

// ─── Client portal (same shapes as the web's client-portal API) ─────────

export interface Address {
  id: string;
  type: string;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
}

export interface Director {
  id: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
  contactNumber?: string | null;
}

/** An editable region on an agreement PDF; coordinates are page fractions (top-left origin). */
export interface AgreementField {
  id: string;
  kind: 'text' | 'signature';
  label: string;
  page: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  filledBy?: 'client' | 'admin';
}

export interface CustomerDocument {
  id: string;
  fileName: string;
  url: string;
  size: number;
  contentType?: string | null;
  status?: 'AWAITING_CLIENT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PENDING';
  fields?: AgreementField[] | null;
  signedUrl?: string | null;
  signedAt?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

export interface AccountManager {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  designation?: string | null;
}

export interface ClientProfile {
  id: string;
  clientId: string;
  registrationCountry?: string | null;
  companyIdentifiers?: Record<string, string> | null;
  abn?: string | null;
  acn?: string | null;
  companyName?: string | null;
  tradingAs?: string | null;
  businessType?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactMobile?: string | null;
  contactPosition?: string | null;
  billingEmail?: string | null;
  invoicingTerm?: string | null;
  accountStatus?: string | null;
  accountStatusEffective?: string | null;
  addresses?: Address[];
  directors?: Director[];
  documents?: CustomerDocument[];
  accountManager?: AccountManager | null;
}

export interface ClientDashboard {
  outstanding: { amount: number; count: number };
  overdue: { amount: number; count: number };
  totalPaid: number;
  invoices: number;
  products: number;
  licences: { active: number; expiringSoon: number; expired: number };
}

export type LicenceStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'CRITICAL' | 'EXPIRED' | 'SUSPENDED';

export interface ClientProduct {
  id: string;
  product: string;
  sku: string;
  licence: string;
  price: string;
  discountPercent?: string | null;
  unitHoursEnabled?: boolean;
  unitHours?: string | null;
  contractType?: string | null;
  gstType?: string | null;
  issueDate: string;
  expiryDate?: string | null;
  daysRemaining: number | null;
  pending: boolean;
  status: LicenceStatus;
}

export interface AvailableProduct {
  id: string;
  name: string;
  productCode: string;
  priceMode: 'AUTOMATIC' | 'MANUAL';
  country?: string | null;
  price: string | null;
  billingPeriod: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUALLY' | 'ONE_TIME' | null;
  gstType?: 'INCLUSIVE' | 'EXCLUSIVE' | null;
}

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  term?: string | null;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  amountPaid: string;
  currency: string;
  status: InvoiceStatus;
  paymentUrl?: string | null;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  createdAt: string;
}
