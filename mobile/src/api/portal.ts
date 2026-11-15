import { api, request } from './client';
import type {
  AppNotification,
  AvailableProduct,
  ClientDashboard,
  ClientProduct,
  ClientProfile,
  CustomerDocument,
  CustomerSummary,
  Invoice,
} from './types';

export type InvoiceFilter = 'all' | 'outstanding' | 'paid' | 'overdue';

/** The client portal API — the same endpoints the web client portal uses. */
export const portalApi = {
  profile: () => api.get<ClientProfile>('/client/profile'),
  dashboard: () => api.get<ClientDashboard>('/client/dashboard'),
  invoices: (filter: InvoiceFilter) => api.get<Invoice[]>(`/client/invoices?page=1&pageSize=50&filter=${filter}`),
  products: () => api.get<ClientProduct[]>('/client/products'),
  availableProducts: () => api.get<AvailableProduct[]>('/client/available-products'),
  addProduct: (productId: string) => api.post<{ id: string }>('/client/products', { productId }),
  signer: () => api.get<{ name: string; ip: string }>('/client/signer'),
  /** Submit a filled + signed agreement PDF (a local file) for admin approval. */
  signDocument: (documentId: string, fileUri: string, fileName: string, filledFieldIds: string[]) => {
    const form = new FormData();
    form.append('file', { uri: fileUri, name: fileName, type: 'application/pdf' } as never);
    form.append('filledFieldIds', JSON.stringify(filledFieldIds));
    return request<CustomerDocument>(`/client/documents/${documentId}/sign`, { method: 'POST', body: form });
  },
  notifications: () => api.get<{ items: AppNotification[]; unread: number }>('/notifications'),
  notificationCount: () => api.get<{ unread: number }>('/notifications/count'),
  markRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

/** Admin only: customers to open. */
export async function listCustomers(search?: string): Promise<CustomerSummary[]> {
  const q = new URLSearchParams({ pageSize: '100', sortBy: 'companyName', sortDir: 'asc' });
  if (search) q.set('search', search);
  return api.get<CustomerSummary[]>(`/customers?${q.toString()}`);
}
