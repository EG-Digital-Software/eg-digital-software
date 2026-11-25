import { ApiError, request } from '../client';

/**
 * Password vault API — the same endpoints the web portal uses
 * (`frontend/src/api/vault.ts`). Every call except unlock needs the live unlock
 * key in the x-vault-key header; the server answers 423 once it has expired.
 */

/** Unlock key — kept in memory only, so restarting the app re-locks the vault. */
let vaultKey: string | null = null;
export const setVaultKey = (k: string | null) => {
  vaultKey = k;
};
const h = () => ({ 'x-vault-key': vaultKey ?? '' });

/** True when the server says the vault is locked (key expired or missing). */
export const isVaultLocked = (e: unknown) => e instanceof ApiError && e.status === 423;

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

export interface VaultPermissions {
  companyEdit: boolean;
  editableCustomers: string[] | null;
  canDelete: boolean;
}

export interface VaultList {
  items: VaultEntry[];
  permissions: VaultPermissions;
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

export interface VaultBreach {
  name: string;
  domain: string | null;
  logo: string | null;
  description: string | null;
  industry: string | null;
  date: string | null;
  records: number | null;
  dataClasses: string[];
  verified: boolean;
  passwordRisk: string | null;
  reference: string | null;
  added: string | null;
}

export interface VaultSecurityCheck {
  email: string;
  checkedAt: string;
  breaches: VaultBreach[];
  pastes: number;
  risk: { label: string; score: number } | null;
  /** pwnedCount null = could not be checked. */
  passwords: { entryId: string; name: string; pwnedCount: number | null }[];
}

type Unlock = { key: string; ttlSeconds: number };

export const vaultApi = {
  unlock: (pin: string) => request<Unlock>('/vault/unlock', { method: 'POST', body: { pin } }),
  touch: () => request<Unlock>('/vault/touch', { method: 'POST', body: {}, headers: h() }),
  list: () => request<VaultList>('/vault/entries', { headers: h() }),
  meta: () => request<VaultMeta>('/vault/meta', { headers: h() }),
  logs: (entryId?: string) =>
    request<VaultLogRow[]>(`/vault/logs${entryId ? `?entryId=${encodeURIComponent(entryId)}` : ''}`, { headers: h() }),
  create: (body: VaultInput) => request<{ id: string }>('/vault/entries', { method: 'POST', body, headers: h() }),
  update: (id: string, body: VaultInput) =>
    request<{ id: string }>(`/vault/entries/${encodeURIComponent(id)}`, { method: 'PATCH', body, headers: h() }),
  reveal: (id: string, kind: 'REVEALED' | 'COPIED') =>
    request<{ password: string; notes: string | null }>(`/vault/entries/${encodeURIComponent(id)}/reveal`, {
      method: 'POST',
      body: { kind },
      headers: h(),
    }),
  securityCheck: (email: string) =>
    request<VaultSecurityCheck>('/vault/security-check', { method: 'POST', body: { email }, headers: h() }),
  remove: (id: string) => request<{ id: string }>(`/vault/entries/${encodeURIComponent(id)}`, { method: 'DELETE', headers: h() }),
};
