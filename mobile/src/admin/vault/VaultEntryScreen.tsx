import React, { useEffect, useState } from 'react';
import { View, Alert, Linking, Pressable } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { vaultApi } from '../../api/admin/vault';
import { Btn, Card, Eyebrow, Loading, Muted, Pill, Screen, T } from '../../ui';
import { colors } from '../../theme';
import { SmallBtn } from '../customers/form/fields';
import { setRevealed, useVaultError, useVaultState, VAULT_QK } from './store';
import {
  ACCESS_TEXT,
  IconBtn,
  LogLine,
  MASK,
  Monogram,
  VaultShell,
  fmtDate,
  initialsOf,
  isFair,
  isGood,
  strengthLabel,
  useQueryLockGuard,
  useSecretActions,
  useVaultList,
  useVaultLogs,
  useVaultMeta,
} from './common';

/** One login: username, password reveal/copy, details, who can access, recent activity. */
export default function VaultEntryScreen() {
  return (
    <VaultShell>
      <EntryDetail />
    </VaultShell>
  );
}

function EntryDetail() {
  const nav = useNavigation<any>();
  const { id } = useRoute<any>().params as { id: string };
  const qc = useQueryClient();
  const onErr = useVaultError();
  const { check } = useVaultState();
  const listQ = useVaultList();
  const metaQ = useVaultMeta();
  const logsQ = useVaultLogs(id);
  useQueryLockGuard(listQ.error, metaQ.error, logsQ.error);
  const secrets = useSecretActions();
  const [deleting, setDeleting] = useState(false);

  const entry = listQ.data?.items.find((e) => e.id === id);

  // Gone (deleted elsewhere): back to the list.
  useEffect(() => {
    if (listQ.isSuccess && !entry && !deleting) nav.goBack();
  }, [listQ.isSuccess, entry, deleting, nav]);

  if (!entry) {
    return (
      <Screen title="Login" back>
        <Loading />
      </Screen>
    );
  }

  const meta = metaQ.data;
  const secret = secrets.revealed[entry.id];
  const pwnedCount = check?.passwords.find((p) => p.entryId === entry.id)?.pwnedCount ?? 0;
  const href = entry.url ? (/^https?:\/\//i.test(entry.url) ? entry.url : `https://${entry.url}`) : null;
  const good = isGood(entry);
  const fair = isFair(entry);

  const who: string[] = entry.customerId
    ? [entry.customer?.name ?? 'Client', 'Eloma Group admins', 'Assigned team']
    : entry.access === 'PICK'
      ? [
          'Admins',
          ...entry.accessRoleIds.map((rid) => meta?.roles.find((r) => r.id === rid)?.name).filter((x): x is string => !!x),
          ...entry.accessEmployeeIds.map((pid) => meta?.employees.find((p) => p.id === pid)?.name).filter((x): x is string => !!x),
        ]
      : entry.access === 'TEAM'
        ? ['Admins', 'Whole team']
        : ['Admins only'];

  const confirmDelete = () =>
    Alert.alert('Delete this login?', `${entry.name} will be removed from the vault.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await vaultApi.remove(entry.id);
            setRevealed(entry.id, null);
            nav.goBack();
            void qc.invalidateQueries({ queryKey: VAULT_QK });
            Alert.alert('Login deleted');
          } catch (e) {
            setDeleting(false);
            onErr(e, 'Could not delete the login');
          }
        },
      },
    ]);

  const copyUsername = async () => {
    await Clipboard.setStringAsync(entry.username ?? '');
    Alert.alert('Copied');
  };

  const details: [string, string][] = [
    ['Folder', entry.folder],
    ['Two-factor', entry.twoFactor],
    ['Last changed', fmtDate(entry.passwordChangedAt)],
    ['Owner', entry.ownerName],
    ['Belongs to', entry.customer?.name ?? 'Eloma Group'],
    ...(!entry.customerId ? ([['Access', ACCESS_TEXT[entry.access]]] as [string, string][]) : []),
  ];

  return (
    <Screen title={entry.name} back refreshing={listQ.isRefetching} onRefresh={() => void Promise.all([listQ.refetch(), logsQ.refetch()])}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Monogram text={initialsOf(entry.name)} big />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w="s" size={20}>
            {entry.name}
          </T>
          {href ? (
            <Pressable onPress={() => void Linking.openURL(href)} hitSlop={6}>
              <T w="s" size={13} color={colors.green} numberOfLines={2}>
                {entry.url}
              </T>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Username + password */}
      <Card style={{ padding: 14, marginTop: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Muted size={12}>Username</Muted>
            <T size={14.5} selectable style={{ marginTop: 2 }}>
              {entry.username || '—'}
            </T>
          </View>
          {entry.username ? <SmallBtn title="Copy" icon="copy-outline" onPress={() => void copyUsername()} /> : null}
        </View>
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Muted size={12}>Password</Muted>
            <T mono size={14} selectable={!!secret} style={{ marginTop: 2 }}>
              {secret?.password ?? MASK}
            </T>
          </View>
          <IconBtn
            icon={secret ? 'eye-off-outline' : 'eye-outline'}
            label={secret ? 'Hide password' : 'Reveal password'}
            onPress={() => void secrets.toggleReveal(entry.id)}
            loading={secrets.busy === entry.id}
          />
          <IconBtn
            icon={secrets.copied === entry.id ? 'checkmark' : 'copy-outline'}
            label="Copy password"
            color={secrets.copied === entry.id ? colors.okFg : colors.muted}
            onPress={() => void secrets.copyPassword(entry.id)}
            disabled={secrets.busy === entry.id}
          />
        </View>
        {secret?.notes ? (
          <>
            <View style={{ height: 1, backgroundColor: colors.line }} />
            <View>
              <Muted size={12}>Notes</Muted>
              <T size={13.5} selectable style={{ marginTop: 2, lineHeight: 19 }}>
                {secret.notes}
              </T>
            </View>
          </>
        ) : null}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Muted size={12}>Strength</Muted>
            <Muted size={12}>{strengthLabel(entry)}</Muted>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden', marginTop: 6 }}>
            <View
              style={{
                height: '100%',
                width: good ? '92%' : fair ? '58%' : '28%',
                backgroundColor: good ? colors.green2 : fair ? colors.amber : colors.red,
              }}
            />
          </View>
        </View>
        {pwnedCount > 0 || entry.rotationDue ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {pwnedCount > 0 ? <Pill kind="red" label={`Breached · seen ${pwnedCount.toLocaleString('en-AU')} times`} /> : null}
            {entry.rotationDue ? <Pill kind="warn" label="Rotation due" /> : null}
          </View>
        ) : null}
      </Card>

      {/* Details */}
      <Card style={{ marginTop: 12 }}>
        {details.map(([k, v], i) => (
          <View
            key={k}
            style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}
          >
            <Muted size={14}>{k}</Muted>
            <T w="s" size={14} style={{ flexShrink: 1, textAlign: 'right' }}>
              {v}
            </T>
          </View>
        ))}
      </Card>

      <Eyebrow style={{ marginTop: 20, marginBottom: 8 }}>Who can access</Eyebrow>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {who.map((p) => (
          <Pill key={p} kind="ns" label={p} />
        ))}
      </View>

      <Eyebrow style={{ marginTop: 20, marginBottom: 4 }}>Recent activity</Eyebrow>
      <Card style={{ paddingHorizontal: 14, paddingVertical: 2 }}>
        {logsQ.isLoading ? (
          <Loading />
        ) : (logsQ.data ?? []).length === 0 ? (
          <Muted size={13} style={{ paddingVertical: 12 }}>
            No activity yet.
          </Muted>
        ) : (
          (logsQ.data ?? []).slice(0, 5).map((l, i) => <LogLine key={l.id} l={l} first={i === 0} />)
        )}
      </Card>

      {entry.canEdit || entry.canDelete ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          {entry.canDelete ? (
            <Btn title="" icon="trash-outline" variant="ghost" onPress={confirmDelete} loading={deleting} style={{ paddingHorizontal: 16 }} />
          ) : null}
          {entry.canEdit ? (
            <>
              <Btn title="Edit" variant="ghost" onPress={() => nav.navigate('VaultForm', { id: entry.id })} style={{ flex: 1 }} />
              <Btn title="Rotate password" onPress={() => nav.navigate('VaultForm', { id: entry.id, rotate: true })} style={{ flex: 1 }} />
            </>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
