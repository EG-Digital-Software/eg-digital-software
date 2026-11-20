import { create } from 'zustand';

/**
 * Admin privacy mode state. Kept free of React components so plain helpers
 * (formatCurrency) can read it too. Purely visual — nothing reaches the server.
 */
const KEY = 'eg-admin-privacy';

function readSaved(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

interface PrivacyState {
  /** The admin's on/off choice (remembered in this browser). */
  on: boolean;
  /** True while a portal that offers privacy mode (the Admin portal) is mounted. */
  available: boolean;
  toggle: () => void;
  setAvailable: (available: boolean) => void;
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  on: readSaved(),
  available: false,
  toggle: () => {
    const on = !get().on;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* not persisted */
    }
    set({ on });
  },
  setAvailable: (available) => set({ available }),
}));

/** Non-hook read for helpers: privacy mode is on in the Admin portal right now. */
export function isPrivacyActive(): boolean {
  const s = usePrivacyStore.getState();
  return s.available && s.on;
}
