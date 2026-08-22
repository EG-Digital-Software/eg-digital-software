import { create } from 'zustand';
import type { User } from '@/types';

/**
 * Auth UI state. The access token lives in memory only (never localStorage) to
 * limit XSS exposure; the refresh token is an httpOnly cookie managed by the API.
 * A silent refresh on app load rehydrates the session.
 */
interface AuthState {
  user: User | null;
  accessToken: string | null;
  initialized: boolean;
  setSession: (user: User, accessToken: string) => void;
  setUser: (user: User) => void;
  setToken: (token: string | null) => void;
  setInitialized: (v: boolean) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  initialized: false,
  setSession: (user, accessToken) => set({ user, accessToken }),
  setUser: (user) => set({ user }),
  setToken: (accessToken) => set({ accessToken }),
  setInitialized: (initialized) => set({ initialized }),
  clear: () => set({ user: null, accessToken: null }),
}));

// Non-hook accessor for the axios interceptor.
export const authStore = useAuth;
