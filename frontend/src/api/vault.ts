import { api } from './client';
import type { ApiEnvelope } from '@/types';

/** Unlock key for the vault — kept in memory only, so a reload re-locks it. */
let vaultKey: string | null = null;
export const setVaultKey = (k: string | null) => {
  vaultKey = k;
};
const h = () => ({ headers: { 'x-vault-key': vaultKey ?? '' } });

export type VaultStrength = 'STRONG' | 'FAIR' | 'WEAK';
export type VaultAccess = 'ADMINS' | 'TEAM' | 'PICK';

export interface VaultEntry {
  id: string;
  customerId: string | null;
  customer: { id: string; clientId: string; name: string } | null;
  name: string;
  url: string | null;
  username: string | null;
  folder: string;
  strength: VaultStrength;
  reused: boolean;
  rotationDue: boolean;
  twoFactor: string;
  access: VaultAccess;
  accessEmployeeIds: string[];
  accessRoleIds: string[];
  ownerName: string;
  passwordChangedAt: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface VaultList {
  items: VaultEntry[];
  permissions: { companyEdit: boolean; editableCustomers: string[] | null; canDelete: boolean };
}

export interface VaultMeta {
  folders: string[];
  twoFactor: string[];
  customers: { id: string; clientId: string; name: string }[];
  employees: { id: string; name: string }[];
  roles: { id: string; name: string }[];
}

export interface VaultLogRow {
  id: string;
  entryId: string | null;
  entryName: string | null;
  userName: string;
  userType: string;
  action: string;
  createdAt: string;
}

export interface VaultInput {
  customerId?: string | null;
  name?: string;
  url?: string | null;
  username?: string | null;
  password?: string;
  folder?: string;
  notes?: string | null;
  twoFactor?: string;
  access?: VaultAccess;
  accessEmployeeIds?: string[];
  accessRoleIds?: string[];
}

type Unlock = { key: string; ttlSeconds: number };

export const vaultApi = {
  unlock: async (pin: string) => (await api.post<ApiEnvelope<Unlock>>('/vault/unlock', { pin })).data.data,
  touch: async () => (await api.post<ApiEnvelope<Unlock>>('/vault/touch', {}, h())).data.data,
  list: async () => (await api.get<ApiEnvelope<VaultList>>('/vault/entries', h())).data.data,
  meta: async () => (await api.get<ApiEnvelope<VaultMeta>>('/vault/meta', h())).data.data,
  logs: async (entryId?: string) =>
    (await api.get<ApiEnvelope<VaultLogRow[]>>('/vault/logs', { ...h(), params: entryId ? { entryId } : {} })).data.data,
  create: async (body: VaultInput) => (await api.post<ApiEnvelope<{ id: string }>>('/vault/entries', body, h())).data.data,
  update: async (id: string, body: VaultInput) =>
    (await api.patch<ApiEnvelope<{ id: string }>>(`/vault/entries/${id}`, body, h())).data.data,
  reveal: async (id: string, kind: 'REVEALED' | 'COPIED') =>
    (await api.post<ApiEnvelope<{ password: string; notes: string | null }>>(`/vault/entries/${id}/reveal`, { kind }, h())).data
      .data,
  remove: async (id: string) => (await api.delete<ApiEnvelope<{ id: string }>>(`/vault/entries/${id}`, h())).data.data,
};
