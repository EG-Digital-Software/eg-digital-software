import { api } from './client';
import type { ApiEnvelope, User } from '@/types';

interface LoginResponse {
  user: User;
  accessToken: string;
}

export type Portal = 'SUPER_ADMIN' | 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE';

export async function loginRequest(
  email: string,
  password: string,
  rememberMe?: boolean,
  portal?: Portal
) {
  const { data } = await api.post<ApiEnvelope<LoginResponse>>('/auth/login', {
    email,
    password,
    rememberMe,
    portal,
  });
  return data.data;
}

export interface RegisterPayload {
  role: 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE';
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  clientId?: string;
}

/** Self-registration. Creates a PENDING account that awaits Super Admin approval. */
export async function registerRequest(payload: RegisterPayload, avatar?: File | null) {
  const form = new FormData();
  Object.entries(payload).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
  });
  if (avatar) form.append('avatar', avatar);
  const { data } = await api.post<ApiEnvelope<{ pending: boolean; email: string }>>(
    '/auth/register',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data.data;
}

export async function logoutRequest() {
  await api.post('/auth/logout');
}

export async function meRequest() {
  const { data } = await api.get<ApiEnvelope<User>>('/auth/me');
  return data.data;
}

export interface ChangePasswordResult {
  user: User;
  accessToken: string;
  /** Other devices signed out by this change. */
  sessionsRevoked: number;
}

/**
 * Changing the password revokes every refresh token, so the API hands back a
 * fresh pair for this device — without it the user would be silently signed out
 * of the session they just used.
 */
export async function changePasswordRequest(currentPassword: string, newPassword: string) {
  const { data } = await api.post<ApiEnvelope<ChangePasswordResult>>('/auth/change-password', {
    currentPassword,
    newPassword,
  });
  return data.data;
}

export async function updateProfileRequest(input: {
  firstName?: string;
  lastName?: string;
  email?: string;
}) {
  const { data } = await api.put<ApiEnvelope<User>>('/auth/me', input);
  return data.data;
}

export async function uploadAvatarRequest(file: File) {
  const form = new FormData();
  form.append('avatar', file);
  const { data } = await api.post<ApiEnvelope<User>>('/auth/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function removeAvatarRequest() {
  const { data } = await api.delete<ApiEnvelope<User>>('/auth/avatar');
  return data.data;
}

export async function forgotPasswordRequest(email: string, portal?: Portal) {
  await api.post('/auth/forgot-password', { email, portal });
}

export async function resetPasswordRequest(token: string, password: string) {
  await api.post('/auth/reset-password', { token, password });
}
