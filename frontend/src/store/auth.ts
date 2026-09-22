import { create } from 'zustand';
import type { User } from '@/types';

/**
 * Auth UI state. The access token lives in memory only (never localStorage) to
 * limit XSS exposure; the refresh token is an httpOnly cookie managed by the API.
 * A silent refresh on app load rehydrates the session.
 */
/** Set while an admin is viewing another account's portal (client or team member). */
export interface Impersonation {
  /** Which portal is being viewed — drives the banner wording and access mode. */
  kind: 'client' | 'employee';
  /** Display name shown in the banner. */
  label: string | null;
  /** Admin route to return to when the admin exits the view. */
  returnTo: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  initialized: boolean;
  /** Active impersonation, or null when the admin is in their own session. */
  impersonation: Impersonation | null;
  /** Snapshot of the admin session, kept so exiting impersonation is instant. */
  adminBackup: { user: User | null; accessToken: string | null } | null;
  setSession: (user: User, accessToken: string) => void;
  setUser: (user: User) => void;
  setToken: (token: string | null) => void;
  setInitialized: (v: boolean) => void;
  clear: () => void;
  /** Enter a read-only client view; the current admin session is stashed. */
  startImpersonation: (args: { user: User; accessToken: string; meta: Impersonation }) => void;
  /** Leave the client view and restore the admin session. */
  stopImpersonation: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  initialized: false,
  impersonation: null,
  adminBackup: null,
  setSession: (user, accessToken) => set({ user, accessToken }),
  setUser: (user) => set({ user }),
  setToken: (accessToken) => set({ accessToken }),
  setInitialized: (initialized) => set({ initialized }),
  clear: () => set({ user: null, accessToken: null, impersonation: null, adminBackup: null }),
  startImpersonation: ({ user, accessToken, meta }) => {
    const { user: adminUser, accessToken: adminToken, impersonation } = get();
    // Keep the original admin snapshot even if start is somehow called twice.
    const adminBackup = impersonation
      ? get().adminBackup
      : { user: adminUser, accessToken: adminToken };
    set({ user, accessToken, impersonation: meta, adminBackup });
  },
  stopImpersonation: () => {
    const backup = get().adminBackup;
    set({
      user: backup?.user ?? null,
      accessToken: backup?.accessToken ?? null,
      impersonation: null,
      adminBackup: null,
    });
  },
}));

// Non-hook accessor for the axios interceptor.
export const authStore = useAuth;
