import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ApiError,
  api,
  getSession,
  impersonate,
  refreshWith,
  request,
  setSession,
  setSessionListener,
  type AdminView,
  type Session,
} from '../api/client';
import type { Role, User } from '../api/types';
import { loadSeen } from '../lib/seen';
import { unregisterPush } from '../lib/push';

/** The app is the client portal; admins reach it from the hidden admin sign-in. */
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
  /** Set while an admin is looking at a customer's portal. */
  admin: AdminView | null;
  /** Step one: resolves to the emailed-code challenge, or null when already signed in. */
  signIn: (email: string, password: string, portal: Portal) => Promise<LoginChallenge | null>;
  /** Step two: the emailed code starts the session. */
  verifyOtp: (challengeId: string, code: string) => Promise<void>;
  resendOtp: (challengeId: string) => Promise<LoginChallenge>;
  signOut: () => Promise<void>;
  /** Admin: open a customer's portal. */
  openCustomer: (clientId: string, companyName: string, edit: boolean) => Promise<void>;
  /** Admin: leave the customer's portal and pick another. */
  exitCustomer: () => void;
  /** Fingerprint sign-in (this phone only). */
  bio: { available: boolean; enabled: boolean; saved: boolean };
  setBioEnabled: (on: boolean) => Promise<void>;
  signInWithBio: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

// Tokens go to the device keychain/keystore; the (larger) user records to AsyncStorage.
const TOKENS_KEY = 'eg.tokens';
const ADMIN_TOKENS_KEY = 'eg.admin.tokens';
const USER_KEY = 'eg.user';
const ADMIN_KEY = 'eg.admin.view';
/** Fingerprint sign-in: the switch, and the refresh token kept at sign-out. */
const BIO_ON_KEY = 'eg.bio.on';
const BIO_TOKEN_KEY = 'eg.bio.token';

type AdminMeta = Omit<AdminView, 'accessToken' | 'refreshToken'>;

async function persist(s: Session | null) {
  try {
    if (!s) {
      await SecureStore.deleteItemAsync(TOKENS_KEY);
      await SecureStore.deleteItemAsync(ADMIN_TOKENS_KEY);
      await AsyncStorage.multiRemove([USER_KEY, ADMIN_KEY]);
      return;
    }
    await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify({ a: s.accessToken, r: s.refreshToken ?? null }));
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(s.user));
    if (s.admin) {
      const { accessToken, refreshToken, ...meta } = s.admin;
      await SecureStore.setItemAsync(ADMIN_TOKENS_KEY, JSON.stringify({ a: accessToken, r: refreshToken ?? null }));
      await AsyncStorage.setItem(ADMIN_KEY, JSON.stringify(meta satisfies AdminMeta));
    } else {
      await SecureStore.deleteItemAsync(ADMIN_TOKENS_KEY);
      await AsyncStorage.removeItem(ADMIN_KEY);
    }
  } catch {
    // Storage failure only costs a re-login next launch.
  }
}

async function restore(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(TOKENS_KEY);
  const rawUser = await AsyncStorage.getItem(USER_KEY);
  if (!raw || !rawUser) return null;
  const t = JSON.parse(raw) as { a: string; r: string | null };
  const user = JSON.parse(rawUser) as User;
  let admin: AdminView | null = null;
  const rawMeta = await AsyncStorage.getItem(ADMIN_KEY);
  const rawAdmin = await SecureStore.getItemAsync(ADMIN_TOKENS_KEY);
  if (rawMeta && rawAdmin) {
    const at = JSON.parse(rawAdmin) as { a: string; r: string | null };
    admin = { ...(JSON.parse(rawMeta) as AdminMeta), accessToken: at.a, refreshToken: at.r };
  }
  return { user, accessToken: t.a, refreshToken: t.r, admin };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<Session | null>(null);
  const [bio, setBio] = useState({ available: false, enabled: false, saved: false });

  const loadBio = async () => {
    try {
      const [hw, enrolled, on, token] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        SecureStore.getItemAsync(BIO_ON_KEY),
        SecureStore.getItemAsync(BIO_TOKEN_KEY),
      ]);
      setBio({ available: hw && enrolled, enabled: on === '1', saved: !!token });
    } catch {
      setBio({ available: false, enabled: false, saved: false });
    }
  };

  useEffect(() => {
    // Every session change (login, silent refresh, expiry) lands here.
    let seenFor: string | null | undefined;
    setSessionListener((s) => {
      setCurrent(s);
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
        void loadBio();
        const saved = await restore();
        if (saved && saved.user.role === 'EMPLOYEE') {
          // A team session saved before the app dropped team login.
          setSession(null);
        } else if (saved) {
          setSession(saved);
          if (!saved.admin) {
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
    if (data.user.role === 'SUPPLIER') {
      throw new Error('Supplier accounts can’t sign in on the app. Please use the web portal.');
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

  const revoke = async (refreshToken: string | null | undefined) => {
    try {
      await request('/auth/logout', { method: 'POST', body: refreshToken ? { refreshToken } : {}, noRetry: true });
    } catch {
      // Already expired / offline — the local sign-out still happens.
    }
  };

  const signOut = async () => {
    // Stop phone notifications for this account first (needs the session).
    await unregisterPush();
    const s = getSession();
    if (s?.admin) {
      await revoke(s.admin.refreshToken);
    } else if (s?.user.role === 'CLIENT' && bio.enabled && s.refreshToken) {
      // Fingerprint sign-in is on: keep this phone's session to unlock next time.
      try {
        await SecureStore.setItemAsync(BIO_TOKEN_KEY, s.refreshToken);
      } catch {
        await revoke(s.refreshToken);
      }
    } else {
      await revoke(s?.refreshToken);
    }
    setSession(null);
    void loadBio();
  };

  const openCustomer = async (clientId: string, companyName: string, edit: boolean) => {
    const s = getSession();
    if (!s || s.user.role !== 'SUPER_ADMIN') throw new Error('Sign in as an admin first');
    let token = s.accessToken;
    let imp;
    try {
      imp = await impersonate(token, clientId, edit);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      // Admin access token expired: refresh once and retry.
      const fresh = await refreshWith(s.refreshToken);
      setSession({ user: fresh.user, accessToken: fresh.accessToken, refreshToken: fresh.refreshToken ?? s.refreshToken });
      token = fresh.accessToken;
      imp = await impersonate(token, clientId, edit);
    }
    const adminNow = getSession()!;
    setSession({
      user: imp.user,
      accessToken: imp.accessToken,
      refreshToken: null,
      admin: {
        user: adminNow.user,
        accessToken: adminNow.accessToken,
        refreshToken: adminNow.refreshToken ?? null,
        clientId,
        companyName: imp.company.companyName || companyName,
        edit,
      },
    });
  };

  const exitCustomer = () => {
    const a = getSession()?.admin;
    if (!a) return;
    setSession({ user: a.user, accessToken: a.accessToken, refreshToken: a.refreshToken ?? null });
  };

  const setBioEnabled = async (on: boolean) => {
    if (on) {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Turn on fingerprint sign-in' });
      if (!r.success) throw new Error('Fingerprint was not confirmed.');
      await SecureStore.setItemAsync(BIO_ON_KEY, '1');
    } else {
      await SecureStore.deleteItemAsync(BIO_ON_KEY);
      const kept = await SecureStore.getItemAsync(BIO_TOKEN_KEY);
      await SecureStore.deleteItemAsync(BIO_TOKEN_KEY);
      if (kept) void revoke(kept);
    }
    await loadBio();
  };

  const signInWithBio = async () => {
    const kept = await SecureStore.getItemAsync(BIO_TOKEN_KEY);
    if (!kept) {
      throw new Error('Sign in with your password once, then turn on Fingerprint sign-in in your Profile.');
    }
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Sign in to EG Eloma' });
    if (!r.success) return;
    try {
      const data = await refreshWith(kept);
      await SecureStore.deleteItemAsync(BIO_TOKEN_KEY);
      startSession({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken ?? kept });
    } catch {
      await SecureStore.deleteItemAsync(BIO_TOKEN_KEY);
      throw new Error('Fingerprint sign-in has expired on this phone. Please sign in with your password.');
    } finally {
      void loadBio();
    }
  };

  const user = current?.user ?? null;
  return (
    <AuthContext.Provider
      value={{
        ready,
        user,
        role: user?.role ?? null,
        admin: current?.admin ?? null,
        signIn,
        verifyOtp,
        resendOtp,
        signOut,
        openCustomer,
        exitCustomer,
        bio,
        setBioEnabled,
        signInWithBio,
      }}
    >
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
