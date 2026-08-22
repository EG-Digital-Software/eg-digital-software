import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { authStore } from '@/store/auth';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export const api = axios.create({
  baseURL,
  withCredentials: true, // send the refresh cookie
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Silent refresh (single-flight, shared) ───────────────
// The refresh token is rotated on every /auth/refresh (the used one is revoked).
// So two concurrent refreshes with the same cookie would make the loser fail and
// wipe the session. We therefore funnel ALL refreshes — the 401 interceptor AND
// the app-load silent refresh (useSessionInit) — through one in-flight promise,
// guaranteeing a single network call and no rotation race.
let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  try {
    const { data } = await axios.post(`${baseURL}/auth/refresh`, {}, { withCredentials: true });
    const token = data?.data?.accessToken as string;
    const user = data?.data?.user;
    if (token) {
      authStore.getState().setSession(user, token);
      return token;
    }
    authStore.getState().clear();
    return null;
  } catch {
    authStore.getState().clear();
    return null;
  }
}

/** Refresh the session, reusing any in-flight refresh. */
export function silentRefresh(): Promise<string | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    const isAuthCall = original?.url?.includes('/auth/');
    if (error.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      const token = await silentRefresh();
      if (token) {
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { message?: string })?.message ?? fallback;
  }
  return fallback;
}
