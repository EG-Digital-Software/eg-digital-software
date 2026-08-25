import { api } from './client';
import type {
  ApiEnvelope,
  Customer,
  DashboardSummary,
  Invoice,
  LicenceRow,
  LowStockRow,
  PageMeta,
  Product,
  SeriesPoint,
} from '@/types';

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

interface ListEnvelope<T> extends ApiEnvelope<T[]> {
  meta: PageMeta;
}

// ── Dashboard ────────────────────────────────────────────
export const dashboardApi = {
  summary: async () => (await api.get<ApiEnvelope<DashboardSummary>>('/dashboard/summary')).data.data,
  series: async (metric: string, range: string) =>
    (await api.get<ApiEnvelope<SeriesPoint[]>>(`/dashboard/series${qs({ metric, range })}`)).data.data,
  licences: async () => (await api.get<ApiEnvelope<LicenceRow[]>>('/dashboard/licences')).data.data,
  lowStock: async () => (await api.get<ApiEnvelope<LowStockRow[]>>('/dashboard/low-stock')).data.data,
  recent: async () =>
    (await api.get<ApiEnvelope<Record<string, unknown>>>('/dashboard/recent-activity')).data.data,
};

// ── Customers ────────────────────────────────────────────
export const customerApi = {
  list: async (params: Record<string, unknown>) => {
    const { data } = await api.get<ListEnvelope<Customer>>(`/customers${qs(params)}`);
    return { items: data.data, meta: data.meta };
  },
  get: async (clientId: string) =>
    (await api.get<ApiEnvelope<Customer>>(`/customers/${clientId}`)).data.data,
  nextClientId: async () =>
    (await api.get<ApiEnvelope<{ clientId: string }>>('/customers/next-client-id')).data.data
      .clientId,
  create: async (body: unknown) =>
    (await api.post<ApiEnvelope<Customer>>('/customers', body)).data.data,
  update: async (clientId: string, body: unknown) =>
    (await api.put<ApiEnvelope<Customer>>(`/customers/${clientId}`, body)).data.data,
  archive: async (clientId: string) => (await api.delete(`/customers/${clientId}`)).data,
};

// ── Products ─────────────────────────────────────────────
export const productApi = {
  list: async (params: Record<string, unknown>) => {
    const { data } = await api.get<ListEnvelope<Product>>(`/products${qs(params)}`);
    return { items: data.data, meta: data.meta };
  },
  get: async (id: string) => (await api.get<ApiEnvelope<Product>>(`/products/${id}`)).data.data,
  categories: async () =>
    (await api.get<ApiEnvelope<string[]>>('/products/categories')).data.data,
  create: async (body: unknown) =>
    (await api.post<ApiEnvelope<Product>>('/products', body)).data.data,
  update: async (id: string, body: unknown) =>
    (await api.put<ApiEnvelope<Product>>(`/products/${id}`, body)).data.data,
  remove: async (id: string) => (await api.delete(`/products/${id}`)).data,
  bulkImport: async (file: File, dryRun = false) => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post<ApiEnvelope<ImportResult>>(
      `/products/bulk-import${dryRun ? '?dryRun=true' : ''}`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data.data;
  },
};

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; field: string; error: string }>;
  /** True when nothing was written — the run was a preview. */
  dryRun: boolean;
}

// ── Invoices ─────────────────────────────────────────────
export const invoiceApi = {
  list: async (params: Record<string, unknown>) => {
    const { data } = await api.get<ListEnvelope<Invoice>>(`/invoices${qs(params)}`);
    return { items: data.data, meta: data.meta };
  },
  get: async (id: string) => (await api.get<ApiEnvelope<Invoice>>(`/invoices/${id}`)).data.data,
  create: async (body: unknown) =>
    (await api.post<ApiEnvelope<Invoice>>('/invoices', body)).data.data,
  updateStatus: async (id: string, status: string) =>
    (await api.put<ApiEnvelope<Invoice>>(`/invoices/${id}/status`, { status })).data.data,
};

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PendingUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE';
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  avatarUrl?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { clientId: string; companyName?: string | null } | null;
}

export const adminApi = {
  registrations: async (params: Record<string, unknown> = {}) => {
    const { data } = await api.get<
      ListEnvelope<PendingUser> & { meta: { counts: Record<ApprovalStatus, number>; count: number } }
    >(`/admin/registrations${qs(params)}`);
    return { items: data.data, meta: data.meta };
  },
  pendingCount: async () =>
    (await api.get<ApiEnvelope<{ count: number }>>('/admin/registrations/count')).data.data.count,
  approve: async (id: string) => (await api.post(`/admin/registrations/${id}/approve`)).data,
  reject: async (id: string) => (await api.post(`/admin/registrations/${id}/reject`)).data,
};

export interface PaymentRow {
  id: string;
  provider: string;
  transactionId?: string | null;
  amount: string;
  currency: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
  paymentMethod?: string | null;
  paidAt?: string | null;
  createdAt: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: string;
    customer?: {
      clientId: string;
      companyName?: string | null;
      contactPerson?: string | null;
    };
  };
}

export const paymentApi = {
  list: async (params: Record<string, unknown>) => {
    const { data } = await api.get<ListEnvelope<PaymentRow> & { meta: { collected: number } }>(
      `/payments${qs(params)}`
    );
    return { items: data.data, meta: data.meta };
  },
  methods: async () => (await api.get<ApiEnvelope<string[]>>('/payments/methods')).data.data,
  record: async (invoiceId: string, amount: number, method?: string) =>
    (await api.post('/payments/record', { invoiceId, amount, method })).data,
  publicInvoice: async (id: string) =>
    (await api.get<ApiEnvelope<Invoice>>(`/payments/public/invoice/${id}`)).data.data,
  /** What the pay page will actually be charged, surcharge included. */
  quote: async (id: string, method = 'card') =>
    (
      await api.get<
        ApiEnvelope<{
          balance: number;
          surchargePct: number;
          surcharge: number;
          total: number;
          currency: string;
        }>
      >(`/payments/public/quote/${id}?method=${encodeURIComponent(method)}`)
    ).data.data,
  /** Client-initiated payment from the invoice QR / pay page (mock provider). */
  pay: async (id: string, method = 'card') =>
    (await api.post<ApiEnvelope<{ alreadyPaid: boolean }>>(`/payments/public/pay/${id}`, { method }))
      .data.data,
};

// ── Payment settings ─────────────────────────────────────
export interface PaymentSettings {
  provider: 'mock' | 'stripe' | 'razorpay';
  publishableKey: string;
  cardPaymentsEnabled: boolean;
  cardSurchargePct: number;
  upiEnabled: boolean;
  upiId: string;
  bankTransferEnabled: boolean;
  bankName: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
  payInstructions: string;
  // Admin read only — secret key is masked.
  hasSecretKey?: boolean;
  secretKeyLast4?: string;
}

export type PaymentSettingsInput = Partial<PaymentSettings> & { secretKey?: string };

/** Non-sensitive settings surfaced on the invoice / pay page. */
export type PublicPaymentSettings = Omit<PaymentSettings, 'hasSecretKey' | 'secretKeyLast4'>;

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
  phoneCountry: string;
  website: string;
  disputeWindowDays: number;
  locale: string;
  currency: string;
}

export const settingsApi = {
  getOrganisation: async () =>
    (await api.get<ApiEnvelope<OrganisationSettings>>('/admin/organisation')).data.data,
  updateOrganisation: async (body: Partial<OrganisationSettings>) =>
    (await api.put<ApiEnvelope<OrganisationSettings>>('/admin/organisation', body)).data.data,
  publicOrganisation: async () =>
    (await api.get<ApiEnvelope<OrganisationSettings>>('/payments/public/organisation')).data.data,
  getPayment: async () =>
    (await api.get<ApiEnvelope<PaymentSettings>>('/admin/payment-settings')).data.data,
  updatePayment: async (body: PaymentSettingsInput) =>
    (await api.put<ApiEnvelope<PaymentSettings>>('/admin/payment-settings', body)).data.data,
  publicPayment: async () =>
    (await api.get<ApiEnvelope<PublicPaymentSettings>>('/payments/public/settings')).data.data,
};

// ── ABN lookup ───────────────────────────────────────────
export interface AbnLookupResult {
  abn: string;
  abnStatus: string;
  abnStatusFrom: string;
  acn: string;
  entityName: string;
  businessNames: string[];
  entityTypeCode: string;
  entityTypeName: string;
  postcode: string;
  state: string;
  gstFrom: string;
}

export const abnApi = {
  /** Look an ABN up on the Australian Business Register to prefill the form. */
  lookup: async (abn: string) =>
    (await api.get<ApiEnvelope<AbnLookupResult>>(`/abn/lookup?abn=${encodeURIComponent(abn)}`)).data
      .data,
};

// ── Geocoding ────────────────────────────────────────────
export interface ReverseGeocodeResult {
  line1: string;
  city: string;
  postcode: string;
  country: string;
  countryCode: string;
  /** 'approximate' means the match was a town or larger — no usable postcode. */
  precision: 'exact' | 'approximate';
}

export interface AddressSuggestion {
  label: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  country: string;
  countryCode: string;
}

export const geoApi = {
  /** Turn browser coordinates into an address the form can prefill. */
  reverse: async (lat: number, lon: number) =>
    (
      await api.get<ApiEnvelope<ReverseGeocodeResult>>(
        `/geo/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`
      )
    ).data.data,

  /**
   * Suggest addresses for a few typed characters, optionally scoped to one
   * country (ISO-3166 alpha-2). Powers the address autocomplete.
   */
  search: async (query: string, country?: string) =>
    (
      await api.get<ApiEnvelope<AddressSuggestion[]>>(
        `/geo/search?q=${encodeURIComponent(query)}${
          country ? `&country=${encodeURIComponent(country)}` : ''
        }`
      )
    ).data.data,
};
