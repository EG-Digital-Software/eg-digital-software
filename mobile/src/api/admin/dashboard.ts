import { API_URL } from '../../config';
import { api, ApiError, getSession, refreshSession } from '../client';

/**
 * Admin Dashboard + Approvals endpoints (same API as the web admin portal:
 * backend/src/routes/dashboard.routes.ts and admin.routes.ts).
 */

// ─── Types ────────────────────────────────────────────────

export interface DashboardSummary {
  /** Value invoiced this month (drafts and cancellations excluded). */
  totalSales: { current: number; previous: number; changePct: number };
  /** Cash collected this month. */
  revenue: { current: number; previous: number; changePct: number };
  customers: { total: number; new: number; changePct: number };
  products: { active: number; lowStock: number };
  outstanding: { count: number; amount: number };
  overdue: { count: number; amount: number };
  licences: { active: number; expiringSoon: number; expired: number; suspended: number };
}

export type SeriesMetric = 'revenue' | 'sales' | 'invoices' | 'customers';
export type SeriesRange = '7d' | '30d' | '90d' | '6m' | '12m';
export interface SeriesPoint {
  date: string;
  value: number;
}

export interface LicenceRow {
  id: string;
  clientId: string;
  customer: string;
  product: string;
  licence: string;
  expiryDate?: string | null;
  daysRemaining: number | null;
  status: string;
}

export interface LowStockRow {
  id: string;
  name: string;
  sku: string;
  available: number;
  threshold: number;
  status: 'LOW' | 'OUT_OF_STOCK';
}

export interface RecentActivity {
  customers: { clientId: string; companyName?: string | null; contactPerson?: string | null; createdAt: string }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    total: string | number;
    status: string;
    createdAt: string;
    customer?: { companyName?: string | null; clientId?: string } | null;
  }[];
  payments: {
    id: string;
    amount: string | number;
    paidAt: string;
    /** Newer API builds only. */
    invoiceId?: string | null;
    invoice?: { invoiceNumber: string } | null;
  }[];
}

export interface TaskOverview {
  total: number;
  inProgress: number;
  pending: number;
  completed: number;
  upcoming: {
    id: string;
    title: string;
    dueDate: string | null;
    progress: 'NOT_STARTED' | 'IN_PROGRESS' | 'ONGOING' | 'COMPLETED';
    customer: string;
    /** Newer API builds only; older ones fall back to matching the name. */
    clientId?: string | null;
  }[];
}

export interface PickerCustomer {
  clientId: string;
  companyName?: string | null;
  contactPerson?: string | null;
}

export interface ProductRow {
  id: string;
  name: string;
  category?: string | null;
  productCode?: string | null;
  type?: string | null;
  sku?: string | null;
  description?: string | null;
  unit?: string | null;
  pricePerQty?: string | number;
  availableStock?: number;
  lowStockThreshold?: number;
  billingPeriod?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RegistrationRole = 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE';

export interface PendingUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: RegistrationRole;
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  avatarUrl?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  designation?: string | null;
  phone?: string | null;
  customer?: { clientId: string; companyName?: string | null } | null;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RegistrationsMeta extends PageMeta {
  counts: Record<ApprovalStatus, number>;
  count: number;
}

export interface Paged<T, M extends PageMeta = PageMeta> {
  items: T[];
  meta: M;
}

export interface RevealedCredential {
  email: string;
  password: string | null;
  available: boolean;
}

export type TimeSheetTab = 'ADMIN_PENDING' | 'ADMIN_APPROVED' | 'ADMIN_REJECTED';

export interface TimeSheetRequest {
  id: string;
  poolId: string;
  poolName: string;
  customerId: string;
  clientId: string;
  customerName: string;
  taskNumber: string;
  taskTitle: string;
  date: string;
  endDate: string;
  requestId: string;
  priority: string;
  category: string;
  description: string;
  staff: string;
  hours: number;
  authorName: string;
  month: string;
  /** Hours the month holds without this request. */
  monthUsed: number;
  monthlyHours: number;
  monthlyMax: number;
  rejectReason?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  /** After the admin approved: the client's decision (PENDING / APPROVED / REJECTED). */
  status: string;
  adminDecidedBy?: string | null;
  adminDecidedAt?: string | null;
  /** Newer API builds only. */
  taskId?: string | null;
}

export interface EmployeeInput {
  firstName: string;
  lastName?: string;
  email: string;
  designation?: string;
  password: string;
}

export interface EmployeeUpdate {
  firstName?: string;
  lastName?: string;
  email?: string;
  designation?: string;
  phone?: string;
}

// ─── Helpers ──────────────────────────────────────────────

const qs = (params: Record<string, string | number | undefined | null>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

/**
 * GET a paginated list. The shared client returns only `data`, but list
 * endpoints carry `meta` (totals, approval counts) beside it, so this keeps both.
 * Same auth + one-shot refresh as `request`.
 */
async function getPaged<T, M extends PageMeta = PageMeta>(path: string): Promise<Paged<T, M>> {
  const send = () => {
    const headers: Record<string, string> = { 'X-Client': 'mobile' };
    const token = getSession()?.accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, { headers, credentials: 'include' });
  };
  let res: Response;
  try {
    res = await send();
  } catch {
    throw new ApiError('Network error — check your connection and try again.', 0);
  }
  if (res.status === 401 && getSession()) {
    if (await refreshSession()) res = await send();
  }
  const text = await res.text();
  let json: { success?: boolean; message?: string; data?: T[]; meta?: M } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body — reported below.
  }
  if (!res.ok || !json || json.success === false) {
    throw new ApiError(json?.message || `Request failed (${res.status})`, res.status);
  }
  return { items: json.data ?? [], meta: (json.meta ?? { page: 1, pageSize: 0, total: 0, totalPages: 0 }) as M };
}

// ─── Dashboard ────────────────────────────────────────────

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>('/dashboard/summary'),
  series: (metric: SeriesMetric, range: SeriesRange) => api.get<SeriesPoint[]>(`/dashboard/series${qs({ metric, range })}`),
  licences: () => api.get<LicenceRow[]>('/dashboard/licences'),
  lowStock: () => api.get<LowStockRow[]>('/dashboard/low-stock'),
  recent: () => api.get<RecentActivity>('/dashboard/recent-activity'),
  tasksOverview: (clientId?: string) => api.get<TaskOverview>(`/dashboard/tasks-overview${qs({ clientId })}`),
  /** Customers for the Task overview filter (the API caps a page at 100). */
  customers: () => api.get<PickerCustomer[]>(`/customers${qs({ pageSize: 100, sortBy: 'companyName', sortDir: 'asc' })}`),
  /** Newest products, with the catalogue total. */
  products: () =>
    getPaged<ProductRow>(`/products${qs({ page: 1, pageSize: 6, sortBy: 'createdAt', sortDir: 'desc' })}`),
  /** Full catalogue, a page at a time (DashProducts). */
  productList: (p: { page: number; pageSize: number; search?: string; status?: 'ACTIVE' | 'INACTIVE' | '' }) =>
    getPaged<ProductRow>(`/products${qs({ ...p, sortBy: 'name', sortDir: 'asc' })}`),
};

// ─── Approvals ────────────────────────────────────────────

export const approvalsApi = {
  registrations: (p: { page: number; pageSize: number; search?: string; status?: ApprovalStatus; role?: RegistrationRole | '' }) =>
    getPaged<PendingUser, RegistrationsMeta>(`/admin/registrations${qs(p)}`),
  pendingCount: async () => (await api.get<{ count: number }>('/admin/registrations/count')).count,
  approve: (id: string) => api.post<PendingUser>(`/admin/registrations/${encodeURIComponent(id)}/approve`),
  reject: (id: string) => api.post<PendingUser>(`/admin/registrations/${encodeURIComponent(id)}/reject`),
  remove: (id: string) => api.del<unknown>(`/admin/registrations/${encodeURIComponent(id)}`),

  createEmployee: (body: EmployeeInput) => api.post<PendingUser>('/admin/employees', body),
  updateEmployee: (id: string, body: EmployeeUpdate) => api.patch<PendingUser>(`/admin/employees/${encodeURIComponent(id)}`, body),
  revealPassword: (id: string) => api.get<RevealedCredential>(`/admin/employees/${encodeURIComponent(id)}/password`),
  changePassword: (id: string, password: string) =>
    api.patch<{ id: string }>(`/admin/employees/${encodeURIComponent(id)}/password`, { password }),

  timeSheetRequests: (status: TimeSheetTab) => api.get<TimeSheetRequest[]>(`/admin/timesheet-requests${qs({ status })}`),
  decideTimeSheet: (id: string, body: { decision: 'APPROVED' | 'REJECTED'; reason?: string }) =>
    api.post<unknown>(`/admin/timesheet-requests/${encodeURIComponent(id)}/decision`, body),
};
