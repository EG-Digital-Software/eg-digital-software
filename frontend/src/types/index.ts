export type Role = 'SUPER_ADMIN' | 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  avatarUrl?: string | null;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  errors?: Record<string, string>;
  meta?: PageMeta;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export type LicenceStatus =
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'CRITICAL'
  | 'EXPIRED'
  | 'SUSPENDED';

export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

export interface Product {
  id: string;
  productCode: string;
  sku?: string | null;
  type?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  unit?: string | null;
  pricePerQty: string;
  taxRate: string;
  totalStock: number;
  availableStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export type AddressType = 'PRINCIPAL' | 'BILLING' | 'SHIPPING';

export type BusinessType =
  | 'HOSPITALITY_AND_TOURISM'
  | 'FARMING_AND_AGRICULTURE'
  | 'MINING'
  | 'FISHING_AND_FORESTRY'
  | 'MANUFACTURING'
  | 'CONSTRUCTION'
  | 'PROCESSING'
  | 'RETAIL_AND_WHOLESALE'
  | 'HEALTHCARE_AND_TRANSPORT'
  | 'INFORMATION_TECHNOLOGY'
  | 'EDUCATION_AND_RESEARCH'
  | 'FINANCE_AND_MEDIA';

export interface Address {
  id: string;
  type: AddressType;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country: string;
}

export interface CustomerProduct {
  id: string;
  quantity: number;
  price: string;
  issueDate: string;
  expiryDate?: string | null;
  status: LicenceStatus;
  notes?: string | null;
  product: Product;
  licence?: { licenceKey: string } | null;
}

export type AccountStatus = 'ACTIVE' | 'DORMANT' | 'SUSPENDED';

export interface Customer {
  id: string;
  /** System-generated, immutable business key (EGD-2627-5000). */
  clientId: string;

  // Company Information
  /** ISO-3166 alpha-2 registration country; drives which identifiers apply. */
  registrationCountry?: string | null;
  /** Country-specific identifiers keyed by field, e.g. { abn, acn } or { companyNumber, vat }. */
  companyIdentifiers?: Record<string, string> | null;
  abn?: string | null;
  acn?: string | null;
  companyName?: string | null;
  tradingAs?: string | null;
  tradingNames?: string[] | null;
  businessType?: BusinessType | null;

  // Contact Information
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactMobile?: string | null;
  contactMobileCountry?: string | null;
  contactPosition?: string | null;
  authorized?: boolean;
  authorizedPerson?: string | null;
  authorizedEmail?: string | null;
  authorizedMobile?: string | null;
  authorizedMobileCountry?: string | null;

  // Invoicing Details
  invoiceCustomer?: string | null;
  billingEmail?: string | null;
  billingContactPerson?: string | null;
  billingContactNumber?: string | null;
  billingContactNumberCountry?: string | null;
  creditScore?: number | null;
  invoiceTerm?: string | null;
  paymentMethod?: string | null;

  reference?: string | null;

  // Customer Credential — the linked portal login (email only; the password is
  // never sent with the record, it is fetched on demand via revealCredential).
  credentialEmail?: string | null;
  hasCredential?: boolean;

  status: 'ACTIVE' | 'ARCHIVED';
  /** Admin-pinned account standing. ACTIVE means "auto-derive". */
  accountStatus: AccountStatus;
  /** Standing resolved for display: pinned override, else derived from activity. */
  accountStatusEffective?: AccountStatus;
  createdAt: string;
  addresses?: Address[];
  directors?: Director[];
  itContacts?: ItContact[];
  customerProducts?: CustomerProduct[];
  invoices?: Invoice[];
  _count?: { customerProducts: number };
}

export interface Director {
  id: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  email: string;
  contactNumber?: string | null;
  contactNumberCountry?: string | null;
}

export interface ItContact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneCountry?: string | null;
}

/** A portal login linked to a customer (admin can provision several). */
export interface CustomerCredential {
  id: string;
  email: string;
  isActive: boolean;
  approvalStatus: string;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  productId?: string | null;
  sku?: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
}

export interface Payment {
  id: string;
  amount: string;
  status: string;
  paidAt?: string | null;
  paymentMethod?: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  term?: string | null;
  reference?: string | null;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  amountPaid: string;
  currency: string;
  status: InvoiceStatus;
  paymentUrl?: string | null;
  paymentQrUrl?: string | null;
  notes?: string | null;
  items?: InvoiceItem[];
  payments?: Payment[];
  customer?: Partial<Customer>;
  createdAt: string;
}

export interface DashboardSummary {
  totalSales: { current: number; previous: number; changePct: number };
  revenue: { current: number; previous: number; changePct: number };
  customers: { total: number; new: number; changePct: number };
  products: { active: number; lowStock: number };
  /** Everything still owed — matches the Billing page's Outstanding tab. */
  outstanding: { count: number; amount: number };
  /** Owed and past its due date — matches the Billing page's Overdue tab. */
  overdue: { count: number; amount: number };
  licences: { active: number; expiringSoon: number; expired: number; suspended: number };
}

export interface LicenceRow {
  id: string;
  clientId: string;
  customer: string;
  product: string;
  licence: string;
  expiryDate?: string | null;
  daysRemaining: number | null;
  status: LicenceStatus;
}

export interface LowStockRow {
  id: string;
  name: string;
  sku: string;
  available: number;
  threshold: number;
  status: 'LOW' | 'OUT_OF_STOCK';
}

export interface SeriesPoint {
  date: string;
  value: number;
}

// ── Tasks (Microsoft Planner-style board) ────────────────
export type TaskProgress = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type TaskPriority = 'URGENT' | 'IMPORTANT' | 'MEDIUM' | 'LOW';

export interface TaskLabel {
  id: string;
  customerId: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface TaskAssignee {
  id?: string;
  userId: string;
  userType: Role;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
}

export interface ChecklistItem {
  id: string;
  taskId: string;
  text: string;
  done: boolean;
  order: number;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  authorType: Role;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  url: string;
  size: number;
  contentType?: string | null;
  uploadedById?: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  customerId: string;
  bucketId: string;
  title: string;
  description?: string | null;
  progress: TaskProgress;
  priority: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  order: number;
  completedAt?: string | null;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssignee[];
  labels: TaskLabel[];
  checklist: ChecklistItem[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
}

export interface TaskBucket {
  id: string;
  customerId: string;
  name: string;
  order: number;
  tasks: Task[];
}

export interface TaskBoard {
  buckets: TaskBucket[];
  labels: TaskLabel[];
}

/** A staff member a task can be assigned to. */
export type AssignableUser = Omit<TaskAssignee, 'id'>;
