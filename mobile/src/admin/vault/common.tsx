import React, { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { vaultApi, type VaultAccess, type VaultEntry, type VaultLogRow } from '../../api/admin/vault';
import { Muted, T, type IconName, type PillKind } from '../../ui';
import { colors } from '../../theme';
import { setRevealed, useVaultError, useVaultState, vaultActivity, VAULT_QK } from './store';

// ─── Query keys + queries ─────────────────────────────────

export const LIST_QK = [...VAULT_QK, 'entries'] as const;
export const META_QK = [...VAULT_QK, 'meta'] as const;
export const LOGS_QK = [...VAULT_QK, 'logs'] as const;
export const logsKey = (entryId?: string) => [...LOGS_QK, entryId ?? 'all'] as const;

export function useVaultList(enabled = true) {
  return useQuery({ queryKey: LIST_QK, queryFn: vaultApi.list, retry: false, enabled });
}
export function useVaultMeta(enabled = true) {
  return useQuery({ queryKey: META_QK, queryFn: vaultApi.meta, retry: false, enabled, staleTime: 5 * 60_000 });
}
export function useVaultLogs(entryId?: string, enabled = true) {
  return useQuery({ queryKey: logsKey(entryId), queryFn: () => vaultApi.logs(entryId), retry: false, enabled });
}

/** Route any query error through the lock-aware handler once. */
export function useQueryLockGuard(...errors: unknown[]) {
  const onErr = useVaultError();
  const locked = errors.find((e) => (e as { status?: number } | null)?.status === 423);
  useEffect(() => {
    if (locked) onErr(locked);
  }, [locked, onErr]);
}

// ─── Formatting ───────────────────────────────────────────

export const MASK = '••••••••••';

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `Today ${time}` : `${fmtDate(iso)} ${time}`;
};
export const initialsOf = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0]![0]! + w[1]![0]! : (w[0] ?? '?').slice(0, 2)).toUpperCase();
};
export const fmtNum = (n: number) => n.toLocaleString('en-AU');

/** Badge label: reuse outranks the stored score. */
export const strengthLabel = (e: VaultEntry) => (e.reused ? 'Reused' : e.strength[0] + e.strength.slice(1).toLowerCase());
export const isGood = (e: VaultEntry) => e.strength === 'STRONG' && !e.reused;
export const isFair = (e: VaultEntry) => e.strength === 'FAIR' && !e.reused;
export const strengthKind = (e: VaultEntry): PillKind => (isGood(e) ? 'ok' : isFair(e) ? 'warn' : 'red');

export const ACTION_TEXT: Record<string, string> = {
  UNLOCKED: 'Unlocked the vault',
  PIN_FAILED: 'Wrong PIN entered',
  REVEALED: 'Password revealed',
  COPIED: 'Password copied',
  ADDED: 'Login added',
  EDITED: 'Login edited',
  ROTATED: 'Password changed',
  DELETED: 'Login deleted',
  SECURITY_CHECK: 'Security check run',
};

export const ACCESS_TEXT: Record<VaultAccess, string> = {
  ADMINS: 'Admins only',
  TEAM: 'Whole team',
  PICK: 'Picked people',
};

/** Random index; crypto when the runtime has it. */
function rnd(n: number) {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0]! % n;
  }
  return Math.floor(Math.random() * n);
}

export function generatePassword(len = 20) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_=+?'];
  const all = sets.join('');
  const out = sets.map((s) => s[rnd(s.length)]!);
  while (out.length < len) out.push(all[rnd(all.length)]!);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out.join('');
}

// ─── Reveal / copy ────────────────────────────────────────

/** Reveal/hide and copy a saved password; each server call is logged. */
export function useSecretActions() {
  const qc = useQueryClient();
  const onErr = useVaultError();
  const { revealed } = useVaultState();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const toggleReveal = async (id: string) => {
    if (revealed[id]) return setRevealed(id, null);
    setBusy(id);
    try {
      const r = await vaultApi.reveal(id, 'REVEALED');
      setRevealed(id, r);
      void qc.invalidateQueries({ queryKey: LOGS_QK });
    } catch (e) {
      onErr(e, 'Could not reveal the password');
    } finally {
      setBusy(null);
    }
  };

  const copyPassword = async (id: string) => {
    setBusy(id);
    try {
      const r = await vaultApi.reveal(id, 'COPIED');
      await Clipboard.setStringAsync(r.password);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
      void qc.invalidateQueries({ queryKey: LOGS_QK });
    } catch (e) {
      onErr(e, 'Could not copy the password');
    } finally {
      setBusy(null);
    }
  };

  return { revealed, busy, copied, toggleReveal, copyPassword };
}

// ─── Shell ────────────────────────────────────────────────

/** Wraps a Vault sub-screen: counts touches as activity, returns to Vault when locked. */
export function VaultShell({ children }: { children: React.ReactNode }) {
  const nav = useNavigation<any>();
  const { unlocked } = useVaultState();
  useEffect(() => {
    if (!unlocked) nav.navigate('Vault');
  }, [unlocked, nav]);
  return (
    <View style={{ flex: 1 }} onTouchStart={vaultActivity}>
      {unlocked ? children : null}
    </View>
  );
}

// ─── Small pieces ─────────────────────────────────────────

export function Monogram({ text, big }: { text: string; big?: boolean }) {
  const s = big ? 48 : 38;
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: big ? 12 : 10,
        backgroundColor: colors.soft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <T w="b" size={big ? 15 : 13} color={big ? colors.green : colors.fg}>
        {text}
      </T>
    </View>
  );
}

export function IconBtn({
  icon,
  label,
  onPress,
  color = colors.muted,
  loading,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
        pressed && { backgroundColor: colors.soft },
        disabled && { opacity: 0.5 },
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={19} color={color} />}
    </Pressable>
  );
}

export function LogLine({ l, withEntry, first }: { l: VaultLogRow; withEntry?: boolean; first?: boolean }) {
  const bad = l.action === 'PIN_FAILED' || l.action === 'DELETED';
  return (
    <View style={{ paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <T size={13.5} style={{ lineHeight: 19 }}>
        <T w="s" size={13.5} color={bad ? colors.redFg : colors.fg}>
          {ACTION_TEXT[l.action] ?? l.action}
        </T>{' '}
        by {l.userName}
        {withEntry && l.entryName ? <Muted size={13.5}> · {l.entryName}</Muted> : null}
      </T>
      <Muted size={12} style={{ marginTop: 2 }}>
        {fmtWhen(l.createdAt)}
      </Muted>
    </View>
  );
}
