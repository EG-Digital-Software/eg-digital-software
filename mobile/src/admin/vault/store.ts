import { useCallback, useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { QueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { isVaultLocked, setVaultKey, vaultApi, type VaultSecurityCheck } from '../../api/admin/vault';

/**
 * Vault session shared by every Vault screen: unlocked flag, revealed secrets
 * (memory only) and the last security check. Locks after 10 minutes idle, like
 * the web page, and whenever the Vault screen is left.
 */

export const IDLE_MS = 10 * 60_000;
/** Refresh the server key at most this often while the user is active. */
const TOUCH_EVERY_MS = 2 * 60_000;
export const VAULT_QK = ['admin-vault'] as const;

export interface Revealed {
  password: string;
  notes: string | null;
}

interface VaultState {
  unlocked: boolean;
  revealed: Record<string, Revealed>;
  check: VaultSecurityCheck | null;
  /** Why the vault last locked itself (shown on the locked card). */
  notice: string | null;
}

let state: VaultState = { unlocked: false, revealed: {}, check: null, notice: null };
const subs = new Set<() => void>();
const set = (patch: Partial<VaultState>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
};
export const useVaultState = () => useSyncExternalStore(subscribe, () => state);

let qc: QueryClient | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let lastTouch = 0;
let lastActive = 0;

const armIdle = () => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => lockVault('Vault locked after 10 minutes idle'), IDLE_MS);
};

export function unlockVault(key: string, client: QueryClient) {
  qc = client;
  setVaultKey(key);
  lastTouch = Date.now();
  lastActive = Date.now();
  armIdle();
  set({ unlocked: true, notice: null });
}

export function lockVault(notice?: string) {
  setVaultKey(null);
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  qc?.removeQueries({ queryKey: VAULT_QK });
  if (!state.unlocked && !notice) return;
  set({ unlocked: false, revealed: {}, check: null, notice: notice ?? null });
}

/** Any touch inside a Vault screen: reset the idle timer, keep the key fresh. */
export function vaultActivity() {
  if (!state.unlocked) return;
  lastActive = Date.now();
  armIdle();
  if (Date.now() - lastTouch > TOUCH_EVERY_MS) {
    lastTouch = Date.now();
    vaultApi
      .touch()
      .then((r) => state.unlocked && setVaultKey(r.key))
      .catch((e) => isVaultLocked(e) && lockVault('Vault locked — enter your PIN again'));
  }
}

/** Back from the background: lock if the idle time ran out meanwhile (timers pause there). */
export function vaultResumed() {
  if (state.unlocked && Date.now() - lastActive > IDLE_MS) lockVault('Vault locked after 10 minutes idle');
}

export const clearNotice = () => state.notice && set({ notice: null });

export function setRevealed(id: string, r: Revealed | null) {
  const next = { ...state.revealed };
  if (r) next[id] = r;
  else delete next[id];
  set({ revealed: next });
}

export const setCheck = (check: VaultSecurityCheck | null) => set({ check });

/** Error handler for Vault screens: 423 locks and returns to the Vault screen. */
export function useVaultError() {
  const nav = useNavigation<any>();
  return useCallback(
    (e: unknown, title = 'Something went wrong') => {
      if (isVaultLocked(e)) {
        lockVault('Vault locked — enter your PIN again');
        nav.navigate('Vault');
      } else {
        Alert.alert(title, errorMessage(e));
      }
    },
    [nav]
  );
}
