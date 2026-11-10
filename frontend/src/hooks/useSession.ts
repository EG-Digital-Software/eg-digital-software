import { useEffect } from 'react';
import { useAuth } from '@/store/auth';
import type { User } from '@/types';
import { silentRefresh } from '@/api/client';
import { loginRequest, logoutRequest, verifyLoginOtpRequest, type LoginChallenge, type Portal } from '@/api/auth';

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

/**
 * Step one of sign-in. Resolves to the signed-in user, or — the usual case — to
 * the emailed-code challenge that `useVerifyLoginOtp` completes.
 */
export function useLogin() {
  const setSession = useAuth((s) => s.setSession);
  return async (email: string, password: string, rememberMe?: boolean, portal?: Portal): Promise<User | LoginChallenge> => {
    const result = await loginRequest(email, password, rememberMe, portal);
    if (result.otpRequired) return result;
    setSession(result.user, result.accessToken);
    return result.user;
  };
}

/** Step two: the emailed code starts the session. */
export function useVerifyLoginOtp() {
  const setSession = useAuth((s) => s.setSession);
  return async (challengeId: string, code: string) => {
    const { user, accessToken } = await verifyLoginOtpRequest(challengeId, code);
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
