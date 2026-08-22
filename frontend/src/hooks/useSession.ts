import { useEffect } from 'react';
import { useAuth } from '@/store/auth';
import { silentRefresh } from '@/api/client';
import { loginRequest, logoutRequest, type Portal } from '@/api/auth';

/**
 * On mount, attempt a silent refresh to rehydrate the session from the httpOnly
 * refresh cookie. Uses the shared single-flight refresh so it never races the
 * 401 interceptor (which would otherwise trip refresh-token rotation and log the
 * user out on reload). Sets `initialized` once resolved so the router renders.
 */
export function useSessionInit() {
  const setInitialized = useAuth((s) => s.setInitialized);
  useEffect(() => {
    let active = true;
    silentRefresh().finally(() => {
      if (active) setInitialized(true);
    });
    return () => {
      active = false;
    };
  }, [setInitialized]);
}

export function useLogin() {
  const setSession = useAuth((s) => s.setSession);
  return async (email: string, password: string, rememberMe?: boolean, portal?: Portal) => {
    const { user, accessToken } = await loginRequest(email, password, rememberMe, portal);
    setSession(user, accessToken);
    return user;
  };
}

export function useLogout() {
  const clear = useAuth((s) => s.clear);
  return async () => {
    // Revoke on the server FIRST — the request needs the still-valid access
    // token so the backend can revoke the refresh token and clear the httpOnly
    // cookie. Only then wipe local state. (Clearing first would send an
    // unauthenticated logout → 401 → the refresh cookie survives → the user gets
    // silently re-authenticated when they press Back. That was the leak.)
    await logoutRequest().catch(() => undefined);
    clear();
  };
}
