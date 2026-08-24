import { api } from './client';
import type { ApiEnvelope, LicenceRow, PageMeta, Product } from '@/types';

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

export interface SupplierDashboard {
  products: number;
  active: number;
  totalStock: number;
  lowStock: number;
  outOfStock: number;
}

export const supplierApi = {
  dashboard: async () =>
    (await api.get<ApiEnvelope<SupplierDashboard>>('/supplier/dashboard')).data.data,
  products: async (params: Record<string, unknown>) => {
    const { data } = await api.get<ListEnvelope<Product>>(`/supplier/products${qs(params)}`);
    return { items: data.data, meta: data.meta };
  },
};

export interface EmployeeDashboard {
  customers: number;
  activeCustomers: number;
  expiringLicences: number;
  expiredLicences: number;
  lowStock: number;
}

export interface EmployeeCustomer {
  id: string;
  clientId: string;
  companyName?: string | null;
  tradingAs?: string | null;
  businessType?: import('@/types').BusinessType | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactMobile?: string | null;
  contactMobileCountry?: string | null;
  addresses?: Array<{ type: string; city?: string | null; country?: string | null }>;
  createdAt: string;
}

export const employeeApi = {
  dashboard: async () =>
    (await api.get<ApiEnvelope<EmployeeDashboard>>('/employee/dashboard')).data.data,
  customers: async (params: Record<string, unknown>) => {
    const { data } = await api.get<ListEnvelope<EmployeeCustomer>>(`/employee/customers${qs(params)}`);
    return { items: data.data, meta: data.meta };
  },
  licences: async () =>
    (await api.get<ApiEnvelope<LicenceRow[]>>('/employee/licences')).data.data,
};
