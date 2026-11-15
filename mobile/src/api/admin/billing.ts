import { API_URL } from '../../config';
import { api, request, ApiError, getSession, refreshSession } from '../client';

/**
 * Admin Billing + Payments API — the same endpoints the web admin portal uses
 * (`frontend/src/api/resources.ts`: invoiceApi, paymentApi, settingsApi).
 */

// ─── Types ────────────────────────────────────────────────

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type InvoiceTab = 'all' | 'outstanding' | 'paid' | 'overdue';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Page<T, M = PageMeta> {
  items: T[];
  meta: M;
}

export interface BillingProduct {
  id: string;
  productCode: string;
  sku?: string | null;
  name: string;
  unit?: string | null;
  billingPeriod?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUALLY' | 'ONE_TIME' | null;
}

/** A customer's product assignment (agreed price, tax, GST/contract type). */
export interface BillingCustomerProduct {
  id: string;
  price: string;
  discountPercent?: string | null;
  priceBasis?: 'DAILY' | 'MONTHLY' | null;
  unitHoursEnabled?: boolean;
  unitHours?: string | null;
  taxRate?: string | null;
  contractType?: string | null;
  gstType?: string | null;
  invoicingTerm?: string | null;
  unit?: string | null;
  status?: string;
  product: BillingProduct;
  licence?: { licenceKey: string } | null;
}

export interface BillingCustomer {
  id: string;
  clientId: string;
  companyName?: string | null;
  tradingAs?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  billingEmail?: string | null;
  abn?: string | null;
  contactMobile?: string | null;
  contactMobileCountry?: string | null;
  customerProducts?: BillingCustomerProduct[];
}

/** The issuing entity printed on every tax invoice (Settings → Organisation). */
export interface OrganisationSettings {
  companyName: string;
  legalName: string;
  abn: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  billingEmail: string;
  supportEmail: string;
  phone: string;
  website: string;
  disputeWindowDays: number;
}

/** Non-sensitive payment settings shown on the invoice / pay page. */
export interface PublicPaymentSettings {
  cardPaymentsEnabled: boolean;
  upiEnabled: boolean;
  upiId?: string | null;
  bankTransferEnabled: boolean;
  bankName?: string | null;
  accountName?: string | null;
  bsb?: string | null;
  accountNumber?: string | null;
  payInstructions?: string | null;
}

export interface InvoiceItemProduct {
  id: string;
  productId?: string | null;
  name: string;
  sku?: string | null;
  unit?: string | null;
  agreedPrice: string;
  unitHours?: string | null;
  taxRate?: string | null;
  gstType?: string | null;
  amount: string;
  position: number;
}

export interface AdminInvoiceItem {
  id: string;
  productId?: string | null;
  products?: InvoiceItemProduct[];
  product?: BillingProduct | null;
  sku?: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
  contractType?: string | null;
  gstType?: string | null;
}

export interface InvoicePayment {
  id: string;
  amount: string;
  status: string;
  paidAt?: string | null;
  paymentMethod?: string | null;
}

export interface AdminInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  term?: string | null;
  nextBillingDate?: string | null;
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
  items?: AdminInvoiceItem[];
  payments?: InvoicePayment[];
  customer?: Partial<BillingCustomer>;
  createdAt: string;
}

export interface InvoiceLineInput {
  productId?: string;
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  contractType: 'LOCKED' | 'TRIAL';
  gstType: 'INCLUSIVE' | 'EXCLUSIVE';
}

export interface InvoiceInput {
  invoiceDate?: string;
  dueDate?: string;
  term?: string;
  nextBillingDate?: string;
  reference?: string;
  discount: number;
  notes?: string;
  items: InvoiceLineInput[];
}

export interface DashboardSummary {
  totalSales: { current: number; previous: number; changePct: number };
  revenue: { current: number; previous: number; changePct: number };
  outstanding: { count: number; amount: number };
  overdue: { count: number; amount: number };
}

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

export interface PaymentRow {
  id: string;
  provider: string;
  transactionId?: string | null;
  amount: string;
  currency: string;
  status: PaymentStatus;
  paymentMethod?: string | null;
  paidAt?: string | null;
  createdAt: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: string;
    customer?: { clientId: string; companyName?: string | null; contactPerson?: string | null };
  };
}

export type PaymentProviderName = 'worldline' | 'mock' | 'stripe' | 'razorpay';

export interface PaymentSettings {
  provider: PaymentProviderName;
  publishableKey: string;
  worldlineEnvironment: 'live' | 'test';
  worldlineMerchantId: string;
  worldlineApiKeyId: string;
  worldlineWebhookKeyId: string;
  cardPaymentsEnabled: boolean;
  upiEnabled: boolean;
  upiId: string;
  bankTransferEnabled: boolean;
  bankName: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
  payInstructions: string;
  hasSecretKey?: boolean;
  secretKeyLast4?: string;
  hasWorldlineApiSecret?: boolean;
  worldlineApiSecretLast4?: string;
  hasWorldlineWebhookSecret?: boolean;
  worldlineWebhookSecretLast4?: string;
  worldlineReady?: boolean;
}

export type PaymentSettingsInput = Partial<PaymentSettings> & {
  secretKey?: string;
  worldlineApiSecret?: string;
  worldlineWebhookSecret?: string;
};

// ─── Paginated GET (keeps `meta`, which the shared client drops) ─────────

async function getPage<T, M = PageMeta>(path: string): Promise<Page<T, M>> {
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
    // Non-JSON — handled below.
  }
  if (!res.ok || !json || json.success === false) {
    throw new ApiError(json?.message || `Request failed (${res.status})`, res.status);
  }
  return { items: json.data ?? [], meta: (json.meta ?? {}) as M };
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ─── Calls ────────────────────────────────────────────────

export const billingApi = {
  list: (p: { page: number; pageSize?: number; search?: string; filter?: InvoiceTab; clientId?: string }) =>
    getPage<AdminInvoice>(`/invoices${qs({ pageSize: 25, sort: 'client', ...p })}`),
  get: (id: string) => api.get<AdminInvoice>(`/invoices/${id}`),
  nextReference: async () => (await api.get<{ reference: string }>('/invoices/next-reference')).reference,
  create: (body: InvoiceInput & { clientId: string }) => api.post<AdminInvoice>('/invoices', body),
  update: (id: string, body: InvoiceInput) => request<AdminInvoice>(`/invoices/${id}`, { method: 'PUT', body }),
  updateStatus: (id: string, status: InvoiceStatus) =>
    request<AdminInvoice>(`/invoices/${id}/status`, { method: 'PUT', body: { status } }),
  send: (id: string) => api.post<{ recipients: string[] }>(`/invoices/${id}/send`),
  remove: (id: string) => api.del<{ id: string }>(`/invoices/${id}`),
  summary: () => api.get<DashboardSummary>('/dashboard/summary'),
  /** Customers for the pickers (`status` = ACTIVE on the invoice form, as on the web). */
  customers: async (search?: string, status?: 'ACTIVE') =>
    (
      await getPage<BillingCustomer>(
        `/customers${qs({ page: 1, pageSize: 100, search, status, sortBy: 'companyName', sortDir: 'asc' })}`
      )
    ).items,
  /** One customer with their product assignments (licence groups for line items). */
  customer: (clientId: string) => api.get<BillingCustomer>(`/customers/${encodeURIComponent(clientId)}`),
  /** Same sources the web's printable invoice reads. */
  organisation: () => api.get<OrganisationSettings>('/payments/public/organisation'),
  publicPayment: () => api.get<PublicPaymentSettings>('/payments/public/settings'),
};

export const paymentsApi = {
  list: (p: { page: number; pageSize?: number; search?: string; status?: string; method?: string }) =>
    getPage<PaymentRow, PageMeta & { collected?: number }>(`/payments${qs({ pageSize: 20, ...p })}`),
  methods: () => api.get<string[]>('/payments/methods'),
  /** Record a manual payment (the web's "Mark as paid" records the balance with method "manual"). */
  record: (invoiceId: string, amount: number, method?: string) =>
    api.post('/payments/record', { invoiceId, amount, method }),
  settings: () => api.get<PaymentSettings>('/admin/payment-settings'),
  updateSettings: (body: PaymentSettingsInput) =>
    request<PaymentSettings>('/admin/payment-settings', { method: 'PUT', body }),
  testWorldline: () =>
    api.post<{ ok: boolean; result?: string; environment: string; merchantId: string }>(
      '/admin/payment-settings/worldline/test'
    ),
};

/** Where Worldline must send webhooks — pasted into the Merchant Portal. */
export const WORLDLINE_WEBHOOK_URL = `${API_URL.replace(/\/$/, '')}/payments/webhook/worldline`;
