import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, api, getSession, request, setSession, setSessionListener, type Session } from '../api/client';
import type { Role, User } from '../api/types';
import { loadSeen } from '../lib/seen';

/** Portals that have tasks. Suppliers have no task board. */
// Team (EMPLOYEE) accounts can't use the mobile app — they sign in on the web portal.
export type Portal = 'CLIENT' | 'SUPER_ADMIN';

/** A correct password emails a one-time code; the session waits for it. */
export interface LoginChallenge {
  otpRequired: true;
  challengeId: string;
  /** Masked address the code went to. */
  email: string;
  expiresInMinutes: number;
  resendInSeconds: number;
}

type SignedIn = { otpRequired?: false; user: User; accessToken: string; refreshToken?: string };

interface AuthState {
  ready: boolean;
  user: User | null;
  role: Role | null;
  /** Step one: resolves to the emailed-code challenge, or null when already signed in. */
  signIn: (email: string, password: string, portal: Portal) => Promise<LoginChallenge | null>;
  /** Step two: the emailed code starts the session. */
  verifyOtp: (challengeId: string, code: string) => Promise<void>;
  resendOtp: (challengeId: string) => Promise<LoginChallenge>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

// Tokens go to the device keychain/keystore; the (larger) user record to AsyncStorage.
const TOKENS_KEY = 'eg.tokens';
// Read the live token (it rotates on every refresh).
const getRefresh = () => getSession()?.refreshToken ?? null;
const USER_KEY = 'eg.user';

async function persist(s: Session | null) {
  try {
    if (!s) {
      await SecureStore.deleteItemAsync(TOKENS_KEY);
      await AsyncStorage.removeItem(USER_KEY);
      return;
    }
    await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify({ a: s.accessToken, r: s.refreshToken ?? null }));
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(s.user));
  } catch {
    // Storage failure only costs a re-login next launch.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Every session change (login, silent refresh, expiry) lands here.
    let seenFor: string | null | undefined;
    setSessionListener((s) => {
      setUser(s?.user ?? null);
      void persist(s);
      // Read markers are per user — reload only when the user changes.
      const id = s?.user.id ?? null;
      if (id !== seenFor) {
        seenFor = id;
        void loadSeen(id);
      }
    });

    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(TOKENS_KEY);
        const rawUser = await AsyncStorage.getItem(USER_KEY);
        if (raw && rawUser && (JSON.parse(rawUser) as User).role === 'EMPLOYEE') {
          // A team session saved before the app dropped team login.
          setSession(null);
        } else if (raw && rawUser) {
          const t = JSON.parse(raw) as { a: string; r: string | null };
          setSession({ user: JSON.parse(rawUser) as User, accessToken: t.a, refreshToken: t.r });
          // Validate (and refresh, if the access token expired while closed).
          try {
            const me = await api.get<User>('/auth/me');
            const live = getSession();
            if (live) setSession({ ...live, user: me });
          } catch (e) {
            // Offline: keep the cached session. Rejected: the client already cleared it.
            if (e instanceof ApiError && e.status === 401) setSession(null);
          }
        }
      } catch {
        setSession(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const startSession = (data: SignedIn) => {
    if (data.user.role === 'EMPLOYEE') {
      throw new Error('Team accounts can’t sign in on the app. Please use the web portal.');
    }
    setSession({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken ?? null });
  };

  const signIn = async (email: string, password: string, portal: Portal) => {
    const data = await request<SignedIn | LoginChallenge>('/auth/login', {
      method: 'POST',
      body: { email: email.trim(), password, portal },
      noRetry: true,
    });
    if (data.otpRequired) return data;
    startSession(data);
    return null;
  };

  const verifyOtp = async (challengeId: string, code: string) => {
    startSession(
      await request<SignedIn>('/auth/login/verify', { method: 'POST', body: { challengeId, code }, noRetry: true })
    );
  };

  const resendOtp = (challengeId: string) =>
    request<LoginChallenge>('/auth/login/resend', { method: 'POST', body: { challengeId }, noRetry: true });

  const signOut = async () => {
    // Revoke the refresh token server-side (best effort), then forget it locally.
    const refreshToken = getRefresh();
    try {
      await request('/auth/logout', { method: 'POST', body: refreshToken ? { refreshToken } : {}, noRetry: true });
    } catch {
      // Already expired / offline — the local sign-out still happens.
    }
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ ready, user, role: user?.role ?? null, signIn, verifyOtp, resendOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const displayName = (u: User | null) =>
  u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email : '';
