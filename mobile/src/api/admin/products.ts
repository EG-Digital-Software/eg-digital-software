import { API_URL } from '../../config';
import { api, request, ApiError, getSession, refreshSession } from '../client';

/**
 * Admin Products API — the same endpoints the web admin portal uses
 * (`frontend/src/api/resources.ts`: productApi).
 */

export type ProductStatus = 'ACTIVE' | 'INACTIVE';
export type PriceMode = 'AUTOMATIC' | 'MANUAL';
export type BillingPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUALLY' | 'ONE_TIME';
export type ContractTerm = 'ONE_TIME' | 'TRIAL' | 'CONTRACT_1_YEAR' | 'CONTRACT_2_YEARS';
export type GstType = 'INCLUSIVE' | 'EXCLUSIVE';

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
  status: ProductStatus;
  priceMode?: PriceMode;
  /** ISO-3166 alpha-2; null on products created before the field existed. */
  country?: string | null;
  billingPeriod?: BillingPeriod | null;
  /** Older products may still carry a retired term (CONTRACTUAL / PERMANENT). */
  contractTerm?: ContractTerm | string | null;
  gstType?: GstType | null;
  /** Optional; **double asterisks** mark bold runs. */
  planInclusive?: string | null;
  createdAt: string;
}

/** Body for create / update (update accepts any subset). */
export interface ProductInput {
  country?: string;
  name?: string;
  type?: string;
  category?: string;
  description?: string;
  unit?: string;
  pricePerQty?: number;
  taxRate?: number;
  totalStock?: number;
  lowStockThreshold?: number;
  status?: ProductStatus;
  priceMode?: PriceMode;
  billingPeriod?: BillingPeriod | null;
  contractTerm?: ContractTerm | null;
  gstType?: GstType | null;
  planInclusive?: string | null;
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: { row: number; field: string; error: string }[];
  /** True when nothing was written — the run was a preview. */
  dryRun: boolean;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** A file picked with expo-document-picker. */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string | null;
}

const enc = encodeURIComponent;

function qs(params: Record<string, unknown>) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${enc(k)}=${enc(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Paginated GET that keeps `meta` (the shared client returns only `data`). */
async function getPaged<T>(path: string): Promise<{ items: T[]; meta: PageMeta }> {
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
  let json: { success?: boolean; message?: string; data?: T[]; meta?: PageMeta } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body — reported below.
  }
  if (!res.ok || !json || json.success === false) {
    throw new ApiError(json?.message || `Request failed (${res.status})`, res.status);
  }
  const meta = json.meta ?? { page: 1, pageSize: json.data?.length ?? 0, total: json.data?.length ?? 0, totalPages: 1 };
  return { items: json.data ?? [], meta };
}

export const productsApi = {
  list: (p: { page: number; pageSize: number; search?: string; status?: ProductStatus | ''; category?: string }) =>
    getPaged<Product>(`/products${qs(p)}`),
  get: (id: string) => api.get<Product>(`/products/${enc(id)}`),
  categories: () => api.get<string[]>('/products/categories'),
  nextSku: async () => (await api.get<{ sku: string }>('/products/next-sku')).sku,
  nextProductCode: async () => (await api.get<{ productCode: string }>('/products/next-product-code')).productCode,
  create: (body: ProductInput) => api.post<Product>('/products', body),
  update: (id: string, body: ProductInput) => request<Product>(`/products/${enc(id)}`, { method: 'PUT', body }),
  remove: (id: string) => api.del<{ unassigned: number; invoicesUpdated: number }>(`/products/${enc(id)}`),

  /** CSV / XLS / XLSX import — the server parses the raw file. dryRun = preview only. */
  bulkImport: (file: PickedFile, dryRun = false) => {
    const form = new FormData();
    // React Native's FormData streams a local file from { uri, name, type }.
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as never);
    return request<ImportResult>(`/products/bulk-import${dryRun ? '?dryRun=true' : ''}`, { method: 'POST', body: form });
  },
};
