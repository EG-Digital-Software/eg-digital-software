import { api, request } from '../client';
import type { User } from '../types';

/**
 * Organisation settings, Access PINs and the signed-in user's own account —
 * the same endpoints as the web settingsApi and api/auth.
 */

export interface OrganisationSettings {
  companyName: string;
  legalName: string;
  abn: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postcode: string;
  /** Country display name (e.g. "Australia"). */
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

export type PinUserType = 'SUPER_ADMIN' | 'EMPLOYEE' | 'CLIENT';

/** One login's Access Point PIN, as the admin sees it. */
export interface PinHolder {
  userId: string;
  userType: PinUserType;
  name: string;
  email: string;
  /** Customer's company, for customer logins. */
  company: string | null;
  active: boolean;
  pin: string;
}

/** The /auth user record carries a few more fields than the mobile User type. */
export type AccountUser = User & { isActive?: boolean; createdAt?: string };

export interface ChangePasswordResult {
  user: AccountUser;
  accessToken: string;
  /** Only if the API ever returns it to native clients (it sets a cookie today). */
  refreshToken?: string;
  /** Other devices signed out by this change. */
  sessionsRevoked: number;
}

export interface PickedImage {
  uri: string;
  name: string;
  mimeType?: string | null;
}

export const settingsApi = {
  getOrganisation: () => api.get<OrganisationSettings>('/admin/organisation'),
  updateOrganisation: (body: Partial<OrganisationSettings>) =>
    request<OrganisationSettings>('/admin/organisation', { method: 'PUT', body }),
  accessPins: () => api.get<PinHolder[]>('/admin/access-pins'),
  regenerateAccessPin: (userType: PinUserType, userId: string) =>
    api.post<{ pin: string }>(`/admin/access-pins/${userType}/${encodeURIComponent(userId)}/regenerate`),
};

export const accountApi = {
  me: () => api.get<AccountUser>('/auth/me'),
  updateProfile: (body: { firstName?: string; lastName?: string; email?: string; phone?: string }) =>
    request<AccountUser>('/auth/me', { method: 'PUT', body }),
  uploadAvatar: (file: PickedImage) => {
    const form = new FormData();
    // React Native's FormData streams a local file from { uri, name, type }.
    form.append('avatar', { uri: file.uri, name: file.name, type: file.mimeType || 'image/jpeg' } as never);
    return request<AccountUser>('/auth/avatar', { method: 'POST', body: form });
  },
  removeAvatar: () => api.del<AccountUser>('/auth/avatar'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<ChangePasswordResult>('/auth/change-password', { currentPassword, newPassword }),
  accessPin: () => api.get<{ pin: string }>('/auth/access-pin'),
  regenerateAccessPin: () => api.post<{ pin: string }>('/auth/access-pin/regenerate'),
};
