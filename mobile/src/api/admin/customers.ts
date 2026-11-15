import { API_URL } from '../../config';
import { ApiError, api, getSession, refreshSession, request } from '../client';

/**
 * Admin customer API (the web admin's `customerApi`). Paths and payloads match
 * backend/src/routes/customer.routes.ts.
 */

// ─── Types ────────────────────────────────────────────────

export type AccountStatus = 'ACTIVE' | 'ACTIVE_TRIAL' | 'DORMANT' | 'SUSPENDED';
export type LicenceStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'CRITICAL' | 'EXPIRED' | 'SUSPENDED';

export interface AdminAddress {
  id?: string;
  type: string;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
}

export interface AdminDirector {
  id: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
  contactNumber?: string | null;
  contactNumberCountry?: string | null;
}

export interface AdminItContact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneCountry?: string | null;
}

/** An editable region on an agreement PDF (page fractions, top-left origin). */
export interface AdminAgreementField {
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

export type DocumentStatus = 'AWAITING_CLIENT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PENDING';

export interface AdminDocument {
  id: string;
  customerId?: string;
  fileName: string;
  url: string;
  size: number;
  contentType?: string | null;
  status?: DocumentStatus;
  fields?: AdminAgreementField[] | null;
  signedUrl?: string | null;
  signedAt?: string | null;
  signLog?: { by: 'client' | 'admin'; name: string; ip: string; at: string }[] | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

export interface AdminProduct {
  id: string;
  productCode: string;
  sku?: string | null;
  type?: string | null;
  name: string;
  category?: string | null;
  pricePerQty: string;
  taxRate?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  billingPeriod?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUALLY' | 'ONE_TIME' | null;
  gstType?: 'INCLUSIVE' | 'EXCLUSIVE' | null;
}

export type PriceBasis = 'DAILY' | 'MONTHLY';

export interface AdminCustomerProduct {
  id: string;
  price: string;
  discountPercent?: string | null;
  priceBasis?: PriceBasis | null;
  unit?: string | null;
  unitHoursEnabled?: boolean;
  unitHours?: string | null;
  advancePayment?: boolean;
  taxRate?: string | null;
  contractType?: string | null;
  gstType?: string | null;
  invoicingTerm?: string | null;
  issueDate: string;
  expiryDate?: string | null;
  status: LicenceStatus;
  approvalStatus?: string;
  notes?: string | null;
  product: AdminProduct;
  licence?: { licenceKey: string } | null;
}

export interface AdminCustomerInvoice {
  id: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string | null;
  total: string | number;
  amountPaid: string | number;
  status: string;
  currency?: string | null;
}

export interface AdminCustomer {
  id: string;
  clientId: string;
  registrationCountry?: string | null;
  companyIdentifiers?: Record<string, string> | null;
  abn?: string | null;
  acn?: string | null;
  companyName?: string | null;
  tradingAs?: string | null;
  tradingNames?: string[] | null;
  businessType?: string | null;
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
  billingEmail?: string | null;
  billingContactPerson?: string | null;
  billingContactNumber?: string | null;
  billingContactNumberCountry?: string | null;
  creditScore?: number | null;
  reference?: string | null;
  credentialEmail?: string | null;
  hasCredential?: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
  accountStatus: AccountStatus;
  accountStatusEffective?: AccountStatus;
  accountRenewedUntil?: string | null;
  createdAt: string;
  addresses?: AdminAddress[];
  directors?: AdminDirector[];
  itContacts?: AdminItContact[];
  documents?: AdminDocument[];
  customerProducts?: AdminCustomerProduct[];
  invoices?: AdminCustomerInvoice[];
  accountManagerId?: string | null;
  accountManager?: {
    id?: string;
    firstName: string;
    lastName: string;
    email: string;
    designation?: string | null;
  } | null;
}

export interface AdminCredential {
  id: string;
  email: string;
  isActive: boolean;
  approvalStatus: string;
  createdAt: string;
}

export interface HistoryEvent {
  id: string;
  at: string;
  kind: 'account';
  title: string;
  detail?: string | null;
  link?: string | null;
}

export interface HistorySummary {
  status: AccountStatus;
  activeUntil: string | null;
  daysLeft: number | null;
  trialSince: string | null;
  trialDays: number | null;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName?: string | null;
  email?: string;
  designation?: string | null;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type CustomerStatusFilter = 'ACTIVE' | 'ACTIVE_TRIAL' | 'DORMANT' | 'SUSPENDED' | 'ARCHIVED';

export interface CustomerListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: CustomerStatusFilter;
  businessType?: string;
  sortBy?: 'createdAt' | 'companyName' | 'firstName' | 'clientId' | 'creditScore';
  sortDir?: 'asc' | 'desc';
}

/** One product line sent when assigning (POST products/bulk). */
export interface AssignLine {
  productId: string;
  price?: number;
  discountPercent?: number;
  priceBasis?: PriceBasis | null;
  unitHoursEnabled?: boolean;
  unitHours?: number;
  advancePayment?: boolean;
  taxRate?: number;
  contractType?: 'LOCKED' | 'TRIAL';
  gstType?: 'INCLUSIVE' | 'EXCLUSIVE';
  invoicingTerm?: string;
  licence?: string;
  issueDate?: string;
  expiryDate?: string;
}

/** Body for editing a whole licence group (PUT product-groups/:key). */
export interface GroupUpdate {
  products: {
    productId: string;
    price?: number;
    discountPercent?: number;
    priceBasis?: PriceBasis | null;
    unitHoursEnabled?: boolean;
    unitHours?: number;
  }[];
  licenceKey?: string;
  contractType?: 'LOCKED' | 'TRIAL';
  gstType?: 'INCLUSIVE' | 'EXCLUSIVE';
  invoicingTerm?: string;
  advancePayment?: boolean;
  issueDate?: string;
  expiryDate?: string;
}

// ─── Helpers ──────────────────────────────────────────────

const enc = encodeURIComponent;

function qs(params: Record<string, unknown>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * GET a paginated list keeping its `meta` (the shared `request` returns only
 * `data`). Same auth + one-shot refresh on 401.
 */
async function getPage<T>(path: string): Promise<{ items: T[]; meta: PageMeta }> {
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
  if (res.status === 401 && getSession() && (await refreshSession())) res = await send();
  const text = await res.text();
  let json: { success?: boolean; message?: string; data?: T[]; meta?: PageMeta } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body — handled below.
  }
  if (!res.ok || !json || json.success === false) {
    throw new ApiError(json?.message || `Request failed (${res.status})`, res.status);
  }
  const items = json.data ?? [];
  return {
    items,
    meta: json.meta ?? { page: 1, pageSize: items.length, total: items.length, totalPages: 1 },
  };
}

// ─── Calls ────────────────────────────────────────────────

export const adminCustomersApi = {
  list: (p: CustomerListParams) => getPage<AdminCustomer>(`/customers${qs({ ...p })}`),
  get: (clientId: string) => api.get<AdminCustomer>(`/customers/${enc(clientId)}`),
  nextClientId: () => api.get<{ clientId: string }>('/customers/next-client-id').then((r) => r.clientId),
  create: (body: unknown) => api.post<AdminCustomer>('/customers', body),
  update: (clientId: string, body: unknown) => request<AdminCustomer>(`/customers/${enc(clientId)}`, { method: 'PUT', body }),
  /** Soft archive (records kept). */
  archive: (clientId: string) => api.del<unknown>(`/customers/${enc(clientId)}`),
  /** Permanent, irreversible delete (refused when the customer has invoices). */
  remove: (clientId: string) => api.del<unknown>(`/customers/${enc(clientId)}/permanent`),
  /** Renew the account: ACTIVE for `months` (1–60). */
  renew: (clientId: string, months: number) =>
    api.post<{ id: string; clientId: string; accountStatus: AccountStatus; accountRenewedUntil: string }>(
      `/customers/${enc(clientId)}/renew`,
      { months }
    ),
  history: (clientId: string) => api.get<{ summary: HistorySummary; events: HistoryEvent[] }>(`/customers/${enc(clientId)}/history`),

  // Agreement documents
  uploadDocument: (clientId: string, file: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append('file', file as never);
    return request<AdminDocument>(`/customers/${enc(clientId)}/documents`, { method: 'POST', body: form });
  },
  updateDocument: (
    clientId: string,
    documentId: string,
    body: { fileName?: string; status?: 'SUBMITTED' | 'APPROVED' | 'REJECTED'; fields?: AdminAgreementField[] }
  ) => api.patch<AdminDocument>(`/customers/${enc(clientId)}/documents/${enc(documentId)}`, body),
  /** Admin fills the fields the client left empty on the submitted copy (a local PDF file). */
  fillDocument: (clientId: string, documentId: string, fileUri: string, fileName: string, filledFieldIds: string[]) => {
    const form = new FormData();
    form.append('file', { uri: fileUri, name: fileName, type: 'application/pdf' } as never);
    form.append('filledFieldIds', JSON.stringify(filledFieldIds));
    return request<AdminDocument>(`/customers/${enc(clientId)}/documents/${enc(documentId)}/fill`, { method: 'POST', body: form });
  },
  deleteDocument: (clientId: string, documentId: string) =>
    api.del<{ id: string }>(`/customers/${enc(clientId)}/documents/${enc(documentId)}`),
  /** The signed-in admin's name + IP for the "Signed By" footer. */
  signer: () => api.get<{ name: string; ip: string }>('/customers/signer'),

  // Products & licences
  assignProducts: (clientId: string, products: AssignLine[]) =>
    api.post<AdminCustomer>(`/customers/${enc(clientId)}/products/bulk`, { products }),
  updateProduct: (clientId: string, customerProductId: string, body: Record<string, unknown>) =>
    api.patch<AdminCustomer>(`/customers/${enc(clientId)}/products/${enc(customerProductId)}`, body),
  updateProductGroup: (clientId: string, licenceKey: string, body: GroupUpdate) =>
    request<AdminCustomer>(`/customers/${enc(clientId)}/product-groups/${enc(licenceKey)}`, { method: 'PUT', body }),
  removeProductGroup: (clientId: string, licenceKey: string) =>
    api.del<AdminCustomer>(`/customers/${enc(clientId)}/product-groups/${enc(licenceKey)}`),
  removeProduct: (clientId: string, customerProductId: string) =>
    api.del<AdminCustomer>(`/customers/${enc(clientId)}/products/${enc(customerProductId)}`),
  /** Active products to pick from when assigning. */
  activeProducts: () => api.get<AdminProduct[]>('/products?pageSize=100&status=ACTIVE'),

  // Portal logins
  listCredentials: (clientId: string) => api.get<AdminCredential[]>(`/customers/${enc(clientId)}/credentials`),
  addCredential: (clientId: string, body: { email: string; password: string }) =>
    api.post<AdminCredential>(`/customers/${enc(clientId)}/credentials`, body),
  revealCredential: (clientId: string, userId: string) =>
    api.get<{ email: string; password: string | null; available: boolean }>(
      `/customers/${enc(clientId)}/credentials/${enc(userId)}/reveal`
    ),
  changeCredentialPassword: (clientId: string, userId: string, password: string) =>
    api.patch<{ id: string }>(`/customers/${enc(clientId)}/credentials/${enc(userId)}/password`, { password }),
  removeCredential: (clientId: string, userId: string) =>
    api.del<unknown>(`/customers/${enc(clientId)}/credentials/${enc(userId)}`),

  /** Approved team members (account manager picker). */
  employees: () =>
    api.get<Employee[]>('/admin/registrations?role=EMPLOYEE&status=APPROVED&pageSize=100'),
};

/** Business types offered on the customer form (stored comma-separated). */
export const BUSINESS_TYPES: { value: string; label: string }[] = [
  { value: 'HOSPITALITY_AND_TOURISM', label: 'Hospitality and Tourism' },
  { value: 'FARMING_AND_AGRICULTURE', label: 'Farming and Agriculture' },
  { value: 'MINING', label: 'Mining' },
  { value: 'FISHING_AND_FORESTRY', label: 'Fishing and Forestry' },
  { value: 'MANUFACTURING', label: 'Manufacturing' },
  { value: 'CONSTRUCTION', label: 'Construction' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'RETAIL_AND_WHOLESALE', label: 'Retail and Wholesale' },
  { value: 'HEALTHCARE_AND_TRANSPORT', label: 'Healthcare and Transport' },
  { value: 'INFORMATION_TECHNOLOGY', label: 'Information Technology' },
  { value: 'EDUCATION_AND_RESEARCH', label: 'Education and Research' },
  { value: 'FINANCE_AND_MEDIA', label: 'Finance and Media' },
];

export function businessTypesLabel(value?: string | null): string {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((v) => BUSINESS_TYPES.find((t) => t.value === v)?.label ?? v)
    .join(', ');
}

/** Display name: business name, else contact person, else the Client ID. */
export const customerName = (c: Pick<AdminCustomer, 'companyName' | 'contactPerson' | 'clientId'>) =>
  c.companyName || c.contactPerson || c.clientId;
