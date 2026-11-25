import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  ApiError,
  api,
  getSession,
  impersonate,
  refreshSession,
  refreshSettled,
  refreshWith,
  request,
  setSession,
  setSessionListener,
  type AdminView,
  type Session,
} from '../api/client';
import type { Role, User } from '../api/types';
import { API_URL } from '../config';
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
  /**
   * Biometric sign-in (this phone only), kept separately for the client and admin
   * sign-ins. `label` is what the phone calls it (Face ID, Touch ID, Fingerprint…);
   * `checked` turns true once the phone has been asked.
   */
  bio: Bio;
  setBioEnabled: (on: boolean, portal?: Portal) => Promise<void>;
  signInWithBio: (portal?: Portal) => Promise<void>;
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
const BIO_ADMIN_ON_KEY = 'eg.bio.admin.on';
const BIO_ADMIN_TOKEN_KEY = 'eg.bio.admin.token';
const bioKeys = (portal: Portal) =>
  portal === 'SUPER_ADMIN' ? { on: BIO_ADMIN_ON_KEY, token: BIO_ADMIN_TOKEN_KEY } : { on: BIO_ON_KEY, token: BIO_TOKEN_KEY };
export interface Bio {
  available: boolean;
  enabled: boolean;
  saved: boolean;
  adminEnabled: boolean;
  adminSaved: boolean;
  label: string;
  face: boolean;
  checked: boolean;
}

const NO_BIO: Bio = {
  available: false,
  enabled: false,
  saved: false,
  adminEnabled: false,
  adminSaved: false,
  label: Platform.OS === 'ios' ? 'Face ID' : 'Fingerprint',
  face: Platform.OS === 'ios',
  checked: false,
};

/**
 * Face ID / fingerprint opens by itself only when the app starts signed out, once.
 * Any session (restored, or signed in) uses it up, so signing out never re-prompts.
 */
let launchPrompt = true;
export function takeBioLaunchPrompt() {
  const v = launchPrompt;
  launchPrompt = false;
  return v;
}

/** What this phone calls its biometric sign-in. */
function bioKind(types: LocalAuthentication.AuthenticationType[]): { label: string; face: boolean } {
  const T = LocalAuthentication.AuthenticationType;
  const ios = Platform.OS === 'ios';
  if (types.includes(T.FACIAL_RECOGNITION)) return { label: ios ? 'Face ID' : 'Face unlock', face: true };
  if (types.includes(T.FINGERPRINT)) return { label: ios ? 'Touch ID' : 'Fingerprint', face: false };
  if (types.includes(T.IRIS)) return { label: 'Iris unlock', face: true };
  return { label: NO_BIO.label, face: NO_BIO.face };
}

type AdminMeta = Omit<AdminView, 'accessToken' | 'refreshToken'>;

/**
 * Revoke a refresh token on the API. /auth/logout needs a live access token; when
 * the one we have has expired, trade the refresh token for a fresh pair and
 * revoke that instead (the trade already revoked the original). Best effort.
 */
async function revokeToken(refreshToken: string | null | undefined, accessToken?: string | null) {
  const logout = (access: string | null | undefined, rt: string | null | undefined) =>
    fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'X-Client': 'mobile', 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}) },
      body: JSON.stringify(rt ? { refreshToken: rt } : {}),
    });
  try {
    const res = await logout(accessToken, refreshToken);
    if (res.ok || !refreshToken || (res.status !== 401 && res.status !== 403)) return;
    const fresh = await refreshWith(refreshToken);
    await logout(fresh.accessToken, fresh.refreshToken ?? null);
  } catch {
    // Already expired / offline — the local sign-out still happens.
  }
}

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
  const [bio, setBio] = useState(NO_BIO);

  const loadBio = async () => {
    try {
      const [hw, enrolled, types, on, token, adminOn, adminToken] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
        SecureStore.getItemAsync(BIO_ON_KEY),
        SecureStore.getItemAsync(BIO_TOKEN_KEY),
        SecureStore.getItemAsync(BIO_ADMIN_ON_KEY),
        SecureStore.getItemAsync(BIO_ADMIN_TOKEN_KEY),
      ]);
      setBio({
        available: hw && enrolled,
        enabled: on === '1',
        saved: !!token,
        adminEnabled: adminOn === '1',
        adminSaved: !!adminToken,
        ...bioKind(types),
        checked: true,
      });
    } catch {
      setBio({ ...NO_BIO, checked: true });
    }
  };

  useEffect(() => {
    // Every session change (login, silent refresh, expiry) lands here.
    let seenFor: string | null | undefined;
    setSessionListener((s) => {
      if (s) launchPrompt = false;
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

  const revoke = (refreshToken: string | null | undefined, accessToken?: string | null) =>
    revokeToken(refreshToken, accessToken === undefined ? getSession()?.accessToken : accessToken);

  const signOut = async () => {
    // Stop phone notifications for this account first (needs the session).
    await unregisterPush();
    // A refresh still running would rotate the token we're about to keep or revoke.
    await refreshSettled();
    const s = getSession();
    // While an admin views a customer, the admin's own session is the one to keep or revoke.
    const adminSide = s?.admin ? { role: s.admin.user.role, refreshToken: s.admin.refreshToken } : null;
    const role = adminSide?.role ?? s?.user.role;
    const refreshToken = adminSide ? adminSide.refreshToken : s?.refreshToken;
    const accessToken = s?.admin ? s.admin.accessToken : s?.accessToken;
    const keepFor: Portal | null =
      role === 'CLIENT' && bio.enabled ? 'CLIENT' : role === 'SUPER_ADMIN' && bio.adminEnabled ? 'SUPER_ADMIN' : null;
    if (keepFor && refreshToken) {
      // Biometric sign-in is on: keep this phone's session to unlock next time.
      try {
        const older = await SecureStore.getItemAsync(bioKeys(keepFor).token);
        await SecureStore.setItemAsync(bioKeys(keepFor).token, refreshToken);
        // The one kept at an earlier sign-out is replaced: don't leave it valid on the server.
        if (older && older !== refreshToken) void revoke(older, null);
      } catch {
        await revoke(refreshToken, accessToken);
      }
    } else {
      await revoke(refreshToken, accessToken);
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
      // Admin access token expired: refresh once (shared with any refresh in flight) and retry.
      if (!(await refreshSession())) throw new Error('Your session has expired. Please sign in again.');
      token = getSession()?.accessToken ?? token;
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

  const setBioEnabled = async (on: boolean, portal: Portal = 'CLIENT') => {
    const keys = bioKeys(portal);
    if (on) {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: `Turn on ${bio.label} sign-in` });
      if (!r.success) throw new Error(`${bio.label} was not confirmed.`);
      await SecureStore.setItemAsync(keys.on, '1');
    } else {
      await SecureStore.deleteItemAsync(keys.on);
      const kept = await SecureStore.getItemAsync(keys.token);
      await SecureStore.deleteItemAsync(keys.token);
      if (kept) void revoke(kept);
    }
    await loadBio();
  };

  const signInWithBio = async (portal: Portal = 'CLIENT') => {
    const keys = bioKeys(portal);
    const kept = await SecureStore.getItemAsync(keys.token);
    if (!kept) {
      throw new Error(`Sign in with your password once, then turn on ${bio.label} sign-in in your Profile.`);
    }
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: portal === 'SUPER_ADMIN' ? 'Admin sign-in to EG Eloma' : 'Sign in to EG Eloma',
    });
    if (!r.success) return;
    let data;
    try {
      data = await refreshWith(kept);
    } catch {
      await SecureStore.deleteItemAsync(keys.token);
      void loadBio();
      throw new Error(`${bio.label} sign-in has expired on this phone. Please sign in with your password.`);
    }
    await SecureStore.deleteItemAsync(keys.token);
    void loadBio();
    const wantAdmin = portal === 'SUPER_ADMIN';
    if ((data.user.role === 'SUPER_ADMIN') !== wantAdmin) {
      await revoke(data.refreshToken, data.accessToken);
      throw new Error(wantAdmin ? 'This is not an admin account.' : 'Admins sign in from the admin sign-in.');
    }
    startSession({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken ?? kept });
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
