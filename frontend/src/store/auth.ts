import { create } from 'zustand';
import type { User } from '@/types';

/**
 * Auth UI state. The access token lives in memory only (never localStorage) to
 * limit XSS exposure; the refresh token is an httpOnly cookie managed by the API.
 * A silent refresh on app load rehydrates the session.
 */
/** Set while an admin is viewing another account's portal (client or team member). */
export interface Impersonation {
  /** Which portal is being viewed — drives the banner wording and access mode.
   *  'demo' is the admin Demo portal (sample data on a separate database). */
  kind: 'client' | 'employee' | 'demo';
  /** Display name shown in the banner. */
  label: string | null;
  /** Admin route to return to when the admin exits the view. */
  returnTo: string;
  /** Client portal only: 'edit' lets the admin make changes; otherwise read-only. */
  mode?: 'view' | 'edit';
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  initialized: boolean;
  /** Active impersonation, or null when the admin is in their own session. */
  impersonation: Impersonation | null;
  /** Snapshot of the admin session, kept so exiting impersonation is instant. */
  adminBackup: { user: User | null; accessToken: string | null } | null;
  /** Outer views when one is opened inside another (a client's portal opened
   *  from the Demo portal). Exiting returns to the view underneath. */
  parents: { user: User | null; accessToken: string | null; impersonation: Impersonation }[];
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
  parents: [],
  setSession: (user, accessToken) => set({ user, accessToken }),
  setUser: (user) => set({ user }),
  setToken: (accessToken) => set({ accessToken }),
  setInitialized: (initialized) => set({ initialized }),
  clear: () => set({ user: null, accessToken: null, impersonation: null, adminBackup: null, parents: [] }),
  startImpersonation: ({ user, accessToken, meta }) => {
    const { user: curUser, accessToken: curToken, impersonation, parents } = get();
    if (impersonation) {
      // Opening a view from inside another (e.g. a client's portal from the Demo
      // portal): remember the outer view so Exit steps back to it. The original
      // admin snapshot is kept as is.
      set({
        user,
        accessToken,
        impersonation: meta,
        parents: [...parents, { user: curUser, accessToken: curToken, impersonation }],
      });
      return;
    }
    set({ user, accessToken, impersonation: meta, adminBackup: { user: curUser, accessToken: curToken }, parents: [] });
  },
  stopImpersonation: () => {
    const { parents, adminBackup: backup } = get();
    const outer = parents[parents.length - 1];
    if (outer) {
      set({ user: outer.user, accessToken: outer.accessToken, impersonation: outer.impersonation, parents: parents.slice(0, -1) });
      return;
    }
    set({
      user: backup?.user ?? null,
      accessToken: backup?.accessToken ?? null,
      impersonation: null,
      adminBackup: null,
      parents: [],
    });
  },
}));

// Non-hook accessor for the axios interceptor.
export const authStore = useAuth;
