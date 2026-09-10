import { api } from './client';
import type { ApiEnvelope, Customer, Invoice, LicenceStatus, PageMeta } from '@/types';

export interface ClientDashboard {
  outstanding: { amount: number; count: number };
  /** Owed and already past the due date. */
  overdue: { amount: number; count: number };
  totalPaid: number;
  invoices: number;
  products: number;
  licences: { active: number; expiringSoon: number; expired: number };
}

export interface ClientProduct {
  id: string;
  product: string;
  sku: string;
  quantity: number;
  licence: string;
  price: string;
  issueDate: string;
  expiryDate?: string | null;
  daysRemaining: number | null;
  /** Client-added product awaiting admin approval. */
  pending: boolean;
  status: LicenceStatus;
}

export interface AvailableProduct {
  id: string;
  name: string;
  productCode: string;
  sku?: string | null;
}

interface ListEnvelope<T> extends ApiEnvelope<T[]> {
  meta: PageMeta;
}

export const clientApi = {
  profile: async () => (await api.get<ApiEnvelope<Customer>>('/client/profile')).data.data,
  dashboard: async () =>
    (await api.get<ApiEnvelope<ClientDashboard>>('/client/dashboard')).data.data,
  invoices: async (params: Record<string, unknown>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
    }
    const { data } = await api.get<ListEnvelope<Invoice> & { meta: { balance: number } }>(
      `/client/invoices?${sp.toString()}`
    );
    return { items: data.data, meta: data.meta };
  },
  invoice: async (id: string) =>
    (await api.get<ApiEnvelope<Invoice>>(`/client/invoices/${id}`)).data.data,
  products: async (params: Record<string, unknown> = {}) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
    }
    const q = sp.toString();
    return (await api.get<ApiEnvelope<ClientProduct[]>>(`/client/products${q ? `?${q}` : ''}`)).data
      .data;
  },
  availableProducts: async () =>
    (await api.get<ApiEnvelope<AvailableProduct[]>>('/client/available-products')).data.data,
  addProduct: async (productId: string) =>
    (await api.post<ApiEnvelope<{ id: string }>>('/client/products', { productId })).data.data,
};
