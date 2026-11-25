import React, { useEffect, useMemo, useState } from 'react';
import { View, AppState } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import { vaultApi, type VaultEntry } from '../../api/admin/vault';
import { displayName, useAuth } from '../../context/AuthContext';
import { Btn, Card, Chips, EmptyCard, ErrorBox, Eyebrow, Loading, Muted, Pill, Screen, SearchField, T } from '../../ui';
import { colors } from '../../theme';
import { Input, PickerSheet, SelectBox, SmallBtn, type PickOption } from '../customers/form/fields';
import { clearNotice, lockVault, unlockVault, useVaultState, vaultActivity, vaultResumed } from './store';
import {
  IconBtn,
  MASK,
  Monogram,
  fmtDate,
  initialsOf,
  isGood,
  strengthKind,
  strengthLabel,
  useQueryLockGuard,
  useSecretActions,
  useVaultList,
  useVaultMeta,
} from './common';

const ALL = '__all__';
const COMPANY = '__company__';

/** Admin password vault: PIN gate, then logins with reveal/copy (web VaultPage, admin portal). */
export default function VaultScreen() {
  const { unlocked } = useVaultState();

  // Leaving the Vault locks it; so does coming back after the idle time.
  useEffect(
    () => () => {
      lockVault();
      clearNotice();
    },
    []
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && vaultResumed());
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1 }} onTouchStart={vaultActivity}>
      {unlocked ? <UnlockedVault /> : <LockedVault />}
    </View>
  );
}

// ─── Locked ───────────────────────────────────────────────

function LockedVault() {
  const qc = useQueryClient();
  const { notice } = useVaultState();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const unlock = useMutation({
    mutationFn: () => vaultApi.unlock(pin.trim()),
    onSuccess: (r) => {
      setPin('');
      unlockVault(r.key, qc);
    },
    onError: (e) => {
      setPin('');
      setError(errorMessage(e, 'Could not unlock the vault'));
    },
  });

  const submit = () => {
    if (!pin.trim() || unlock.isPending) return;
    setError(null);
    clearNotice();
    unlock.mutate();
  };

  return (
    <Screen title="Password vault" back>
      <Eyebrow>EG Eloma · Admin</Eyebrow>
      <Muted size={13} style={{ marginTop: 6, lineHeight: 19 }}>
        Shared team logins for the tools Eloma Group runs on, and every client’s logins. Passwords stay hidden until you
        reveal or copy them, and every reveal is logged.
      </Muted>
      <Card style={{ padding: 18, marginTop: 16, borderLeftWidth: 4, borderLeftColor: colors.green2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="lock-closed" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Eyebrow>Vault locked</Eyebrow>
            <T w="s" size={15.5} style={{ marginTop: 2 }}>
              Enter your Access Point PIN to open it
            </T>
          </View>
        </View>
        {notice ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: colors.warnBg }}>
            <Ionicons name="time-outline" size={15} color={colors.warnFg} />
            <T w="s" size={12.5} color={colors.warnFg} style={{ flex: 1 }}>
              {notice}
            </T>
          </View>
        ) : null}
        <Input
          value={pin}
          onChangeText={(t) => setPin(t.replace(/\s/g, ''))}
          placeholder="6-digit PIN"
          secureTextEntry
          keyboardType="number-pad"
          autoComplete="off"
          maxLength={12}
          onSubmitEditing={submit}
          style={{ marginTop: 16, textAlign: 'center', letterSpacing: 6 }}
        />
        {error ? (
          <T size={13} color={colors.redFg} style={{ marginTop: 8 }}>
            {error}
          </T>
        ) : null}
        <Btn title="Unlock vault" icon="key-outline" loading={unlock.isPending} disabled={!pin.trim()} onPress={submit} style={{ marginTop: 14 }} />
        <Muted size={12} style={{ marginTop: 12, lineHeight: 17 }}>
          Your PIN is shown in My Account on the web portal. The vault locks itself after 10 minutes idle, and every unlock is logged.
        </Muted>
      </Card>
    </Screen>
  );
}

// ─── Unlocked ─────────────────────────────────────────────

function UnlockedVault() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { check } = useVaultState();
  const listQ = useVaultList();
  const metaQ = useVaultMeta();
  useQueryLockGuard(listQ.error, metaQ.error);
  const secrets = useSecretActions();

  const [folder, setFolder] = useState('All');
  const [scope, setScope] = useState(ALL);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [query, setQuery] = useState('');

  /** entryId → times the saved password was seen in leaks (from the last check). */
  const pwned = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of check?.passwords ?? []) if (p.pwnedCount) m.set(p.entryId, p.pwnedCount);
    return m;
  }, [check]);

  const items = useMemo(() => listQ.data?.items ?? [], [listQ.data]);
  const perms = listQ.data?.permissions;
  const canAdd = !!perms && (perms.companyEdit || perms.editableCustomers === null || perms.editableCustomers.length > 0);
  const folders = ['All', ...(metaQ.data?.folders ?? [])];

  // Scope: Eloma Group's own logins vs each client present in the list.
  const scopeOptions = useMemo<PickOption[]>(() => {
    const m = new Map<string, string>();
    for (const e of items) if (e.customer) m.set(e.customer.id, e.customer.name);
    const clients = [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
    return [
      { value: ALL, label: 'All logins' },
      ...(items.some((e) => !e.customerId) ? [{ value: COMPANY, label: 'Eloma Group' }] : []),
      ...clients,
    ];
  }, [items]);

  const inScope = useMemo(
    () => items.filter((e) => (scope === ALL ? true : scope === COMPANY ? !e.customerId : e.customerId === scope)),
    [items, scope]
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScope.filter(
      (e) =>
        (folder === 'All' || e.folder === folder) &&
        (!q || `${e.name} ${e.username ?? ''} ${e.url ?? ''} ${e.customer?.name ?? ''}`.toLowerCase().includes(q))
    );
  }, [inScope, folder, query]);

  const stats = useMemo(() => {
    const total = inScope.length;
    const weak = inScope.filter((e) => !isGood(e)).length;
    return {
      total,
      folders: new Set(inScope.map((e) => e.folder)).size,
      strong: total - weak,
      weak,
      rotation: inScope.filter((e) => e.rotationDue).length,
      twofa: inScope.filter((e) => e.twoFactor !== 'Off').length,
    };
  }, [inScope]);

  const health = stats.total
    ? `${stats.strong} of ${stats.total} login${stats.total === 1 ? ' is' : 's are'} strong`
    : 'No logins stored yet';
  const defaultCustomer = scope !== ALL && scope !== COMPANY ? scope : undefined;

  return (
    <Screen
      title="Password vault"
      back
      refreshing={listQ.isRefetching}
      onRefresh={() => {
        void listQ.refetch();
        void metaQ.refetch();
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="lock-open-outline" size={15} color={colors.okFg} />
        <Muted size={12.5} style={{ flex: 1 }}>
          Auto-locks after 10 min idle · Unlocked by <T w="s" size={12.5}>{displayName(user)}</T>
        </Muted>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <SmallBtn title="Access log" icon="time-outline" onPress={() => nav.navigate('VaultLog')} />
        <SmallBtn title="Lock" icon="lock-closed-outline" onPress={() => lockVault()} />
        {canAdd ? (
          <SmallBtn title="Add login" icon="add" tone="green" onPress={() => nav.navigate('VaultForm', defaultCustomer ? { customerId: defaultCustomer } : {})} />
        ) : null}
      </View>

      {/* Vault health */}
      <Card style={{ padding: 16, marginTop: 14, borderLeftWidth: 4, borderLeftColor: colors.green2 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="shield-checkmark" size={19} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Eyebrow>Vault health</Eyebrow>
            <T size={14} style={{ marginTop: 4, lineHeight: 20 }}>
              <T w="s" size={14} color={colors.okFg}>
                {health}
              </T>
              {stats.total > 0 ? (
                <>
                  ,{' '}
                  <T w="s" size={14} color={stats.weak ? colors.warnFg : colors.muted}>
                    {stats.weak} {stats.weak === 1 ? 'is' : 'are'} weak or reused
                  </T>{' '}
                  and {stats.rotation} {stats.rotation === 1 ? 'is' : 'are'} due for a 90-day rotation.
                </>
              ) : null}
            </T>
          </View>
        </View>
        <Btn
          title="Run security check"
          icon="refresh"
          variant="ghost"
          onPress={() => nav.navigate('VaultSecurityCheck')}
          style={{ marginTop: 12, minHeight: 44 }}
        />
      </Card>

      {/* Stats */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        <Stat label="Stored logins" value={String(stats.total)} sub={`Across ${stats.folders} folder${stats.folders === 1 ? '' : 's'}`} />
        <Stat
          label="Weak or reused"
          value={String(stats.weak)}
          tone={stats.weak ? colors.warnFg : undefined}
          sub={stats.weak ? 'Change these first' : 'Nothing to fix'}
        />
        <Stat label="Rotation due" value={String(stats.rotation)} sub="Older than 90 days" />
        <Stat
          label="2FA enabled"
          value={`${stats.twofa} / ${stats.total}`}
          tone={stats.total && stats.twofa === stats.total ? colors.okFg : undefined}
          sub={stats.total - stats.twofa ? `${stats.total - stats.twofa} without 2FA` : 'All covered'}
        />
      </View>

      {/* Filters */}
      <View style={{ marginTop: 18, gap: 10 }}>
        {scopeOptions.length > 1 ? (
          <SelectBox
            label={scopeOptions.find((o) => o.value === scope)?.label ?? 'All logins'}
            onPress={() => setScopeOpen(true)}
            left={<Ionicons name="business-outline" size={17} color={colors.muted} />}
          />
        ) : null}
        <SearchField value={query} onChangeText={setQuery} placeholder="Search service or username" />
        <Chips options={folders.map((f) => ({ value: f, label: f }))} value={folder} onChange={setFolder} />
      </View>
      <PickerSheet
        open={scopeOpen}
        onClose={() => setScopeOpen(false)}
        title="Whose logins"
        options={scopeOptions}
        value={scope}
        onPick={setScope}
        searchable={scopeOptions.length > 8}
        searchPlaceholder="Search client…"
      />

      <T w="s" size={17} style={{ marginTop: 18, marginBottom: 10 }}>
        {rows.length} login{rows.length === 1 ? '' : 's'}
        {folder !== 'All' ? ` in ${folder}` : ''}
      </T>

      {listQ.isLoading ? (
        <Loading />
      ) : listQ.isError ? (
        (listQ.error as { status?: number })?.status === 423 ? null : (
          <ErrorBox message={errorMessage(listQ.error, 'Could not load the vault')} onRetry={() => void listQ.refetch()} />
        )
      ) : rows.length === 0 ? (
        <EmptyCard
          icon="key-outline"
          title={items.length === 0 ? 'No logins yet' : 'No logins match'}
          body={
            items.length === 0
              ? canAdd
                ? 'Use “Add login” to store the first one.'
                : 'No logins have been shared with you yet.'
              : 'Try another folder or search.'
          }
        />
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map((e) => (
            <EntryRow
              key={e.id}
              e={e}
              pwnedCount={pwned.get(e.id)}
              password={secrets.revealed[e.id]?.password}
              busy={secrets.busy === e.id}
              copied={secrets.copied === e.id}
              onOpen={() => nav.navigate('VaultEntry', { id: e.id })}
              onToggle={() => void secrets.toggleReveal(e.id)}
              onCopy={() => void secrets.copyPassword(e.id)}
            />
          ))}
        </View>
      )}

      <Muted size={12} style={{ textAlign: 'center', marginTop: 18 }}>
        Encrypted at rest · every reveal and copy is logged
      </Muted>
    </Screen>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <Card style={{ padding: 14, flexGrow: 1, flexBasis: '45%' }}>
      <Eyebrow style={{ fontSize: 10 }}>{label}</Eyebrow>
      <T w="s" size={26} color={tone ?? colors.fg} style={{ marginTop: 6 }}>
        {value}
      </T>
      <Muted size={12} style={{ marginTop: 2 }}>
        {sub}
      </Muted>
    </Card>
  );
}

function EntryRow({
  e,
  pwnedCount,
  password,
  busy,
  copied,
  onOpen,
  onToggle,
  onCopy,
}: {
  e: VaultEntry;
  pwnedCount?: number;
  password?: string;
  busy: boolean;
  copied: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onCopy: () => void;
}) {
  return (
    <Card onPress={onOpen} style={{ padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Monogram text={initialsOf(e.name)} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w="s" size={15} numberOfLines={1}>
            {e.name}
          </T>
          <Muted size={12.5} numberOfLines={1}>
            {e.customer?.name ?? 'Eloma Group'} · {e.folder}
          </Muted>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.faint} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <Ionicons name="person-outline" size={14} color={colors.muted} />
        <T size={13} style={{ flex: 1 }} numberOfLines={1} color={e.username ? colors.fg : colors.faint}>
          {e.username || '—'}
        </T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6 }}>
        <View style={{ flex: 1, borderRadius: 8, backgroundColor: colors.soft2, paddingHorizontal: 10, paddingVertical: 7 }}>
          <T mono size={13} numberOfLines={1}>
            {password ?? MASK}
          </T>
        </View>
        <IconBtn icon={password !== undefined ? 'eye-off-outline' : 'eye-outline'} label={password !== undefined ? 'Hide password' : 'Show password'} onPress={onToggle} loading={busy} />
        <IconBtn icon={copied ? 'checkmark' : 'copy-outline'} label="Copy password" color={copied ? colors.okFg : colors.muted} onPress={onCopy} disabled={busy} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <Pill kind={strengthKind(e)} label={strengthLabel(e)} />
        {pwnedCount ? <Pill kind="red" label="Breached" /> : null}
        {e.rotationDue ? <Pill kind="warn" label="Rotation due" /> : null}
        <Muted size={12} style={{ marginLeft: 'auto' }}>
          Changed {fmtDate(e.passwordChangedAt)}
        </Muted>
      </View>
    </Card>
  );
}
