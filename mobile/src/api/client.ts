import { API_URL } from '../config';
import type { User } from './types';

/**
 * Small fetch wrapper around the EG Eloma REST API.
 *
 * Every response is the backend's `{ success, message, data }` envelope; `data`
 * is returned. The access token rides in the Authorization header. When it
 * expires (401) we refresh once — single-flight, because the API rotates the
 * refresh token on every use and two parallel refreshes would revoke each other.
 */

/** An admin looking at one customer's portal through an impersonation token. */
export interface AdminView {
  user: User;
  accessToken: string;
  refreshToken?: string | null;
  clientId: string;
  companyName: string;
  /** Edit mode: the admin may act for the client (writes allowed). */
  edit: boolean;
}

export interface Session {
  user: User;
  accessToken: string;
  /** Present when the API hands the token to native clients; otherwise the
   *  refresh token lives in the native cookie jar (older API builds). */
  refreshToken?: string | null;
  /** Set while an admin views a customer's portal (the tokens above are then
   *  the 2-hour impersonation token, re-minted from the admin's own session). */
  admin?: AdminView | null;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type SessionListener = (s: Session | null) => void;

let session: Session | null = null;
let onSessionChange: SessionListener = () => {};

export function setSessionListener(fn: SessionListener) {
  onSessionChange = fn;
}

export function setSession(s: Session | null) {
  session = s;
  onSessionChange(s);
}

export function getSession() {
  return session;
}

const HEADERS = { 'X-Client': 'mobile' };

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: { success?: boolean; message?: string; data?: T } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON (e.g. a proxy error page) — handled below.
  }
  if (!res.ok || !json || json.success === false) {
    throw new ApiError(json?.message || `Request failed (${res.status})`, res.status);
  }
  return json.data as T;
}

let refreshing: Promise<boolean> | null = null;

type Refreshed = { user: User; accessToken: string; refreshToken?: string };

/** Trade a refresh token for a new session (the API rotates the refresh token). */
export async function refreshWith(refreshToken?: string | null): Promise<Refreshed> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  });
  return parse<Refreshed>(res);
}

type Impersonation = { accessToken: string; user: User; company: { clientId: string; companyName?: string | null } };

/** Admin: mint a token that opens one customer's client portal. */
export async function impersonate(adminToken: string, clientId: string, edit: boolean): Promise<Impersonation> {
  const res = await fetch(`${API_URL}/customers/${encodeURIComponent(clientId)}/impersonate`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ mode: edit ? 'edit' : 'view' }),
  });
  return parse<Impersonation>(res);
}

async function doRefresh(): Promise<boolean> {
  const current = session;
  if (!current) return false;
  try {
    if (current.admin) {
      // The impersonation token has no refresh of its own: refresh the admin's
      // session, then mint a fresh view of the same customer.
      const a = current.admin;
      const fresh = await refreshWith(a.refreshToken);
      const adminOwn = {
        user: fresh.user,
        accessToken: fresh.accessToken,
        refreshToken: fresh.refreshToken ?? a.refreshToken ?? null,
      };
      // The admin left the customer while this ran: keep their own (rotated) session.
      if (session && !session.admin && session.refreshToken === a.refreshToken) {
        setSession(adminOwn);
        return true;
      }
      if (session?.admin?.refreshToken !== a.refreshToken) return !!session;
      const imp = await impersonate(fresh.accessToken, a.clientId, a.edit);
      if (session?.admin?.refreshToken !== a.refreshToken) {
        if (session && !session.admin && session.refreshToken === a.refreshToken) setSession(adminOwn);
        return !!session;
      }
      setSession({ user: imp.user, accessToken: imp.accessToken, refreshToken: null, admin: { ...a, ...adminOwn } });
      return true;
    }
    const data = await refreshWith(current.refreshToken);
    // Signed out (or another account signed in) while this ran: don't bring the old one back.
    if (!session || session.admin || session.refreshToken !== current.refreshToken) return !!session;
    setSession({
      ...session,
      user: data.user,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? current.refreshToken ?? null,
    });
    return true;
  } catch {
    // Only sign out the session that failed, not one that replaced it meanwhile.
    if (session === current) setSession(null);
    return false;
  }
}

/** Resolves once any refresh in flight has finished (sign-out waits for it). */
export function refreshSettled(): Promise<unknown> {
  return refreshing ? refreshing.catch(() => false) : Promise.resolve(true);
}

/** Refresh the session, reusing any refresh already in flight. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skip the 401 → refresh → retry dance (auth calls). */
  noRetry?: boolean;
  /** Extra request headers (e.g. X-Access-Point-Key). */
  headers?: Record<string, string>;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const send = () => {
    const headers: Record<string, string> = { ...HEADERS, ...opts.headers };
    if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
    let body: BodyInit | undefined;
    if (opts.body instanceof FormData) {
      body = opts.body; // fetch sets the multipart boundary itself
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    return fetch(`${API_URL}${path}`, { method: opts.method ?? 'GET', headers, body, credentials: 'include' });
  };

  let res: Response;
  try {
    res = await send();
  } catch {
    throw new ApiError('Network error — check your connection and try again.', 0);
  }
  if (res.status === 401 && !opts.noRetry && session) {
    if (await refreshSession()) res = await send();
  }
  return parse<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body ?? {} }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
