import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { errorMessage } from '../../api/client';
import { settingsApi, type PinHolder, type PinUserType } from '../../api/admin/settings';
import { Btn, Card, Chips, EmptyCard, ErrorBox, Loading, Muted, Pill, Screen, SearchField, T, type PillKind } from '../../ui';
import { colors } from '../../theme';

const TYPES: Record<PinUserType, { label: string; kind: PillKind }> = {
  SUPER_ADMIN: { label: 'Admin', kind: 'on' },
  EMPLOYEE: { label: 'Team', kind: 'ns' },
  CLIENT: { label: 'Customer', kind: 'ok' },
};
const FILTERS = ['all', 'SUPER_ADMIN', 'EMPLOYEE', 'CLIENT'] as const;
type Filter = (typeof FILTERS)[number];
const KEY = ['admin', 'access-pins'];
const rowKey = (p: PinHolder) => `${p.userType}:${p.userId}`;

/**
 * Every login's Access Point PIN — admins, team members and customer logins
 * (port of the web AccessPinsCard). PINs stay hidden until shown; a new PIN can
 * be issued for anyone (their old one stops working straight away).
 */
export default function AccessPinsScreen() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<Filter>('all');
  const [showAll, setShowAll] = useState(false);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const q = useQuery({ queryKey: KEY, queryFn: settingsApi.accessPins });

  const regenerate = useMutation({
    mutationFn: (p: PinHolder) => settingsApi.regenerateAccessPin(p.userType, p.userId),
    onSuccess: (res, p) => {
      qc.setQueryData<PinHolder[]>(KEY, (rows) => rows?.map((r) => (rowKey(r) === rowKey(p) ? { ...r, pin: res.pin } : r)));
      setShown((s) => new Set(s).add(rowKey(p)));
      Alert.alert('New PIN issued', `New PIN issued for ${p.name}`);
    },
    onError: (e) => Alert.alert('Could not issue a PIN', errorMessage(e)),
  });

  const data = q.data ?? [];
  const rows = useMemo(() => {
    const t = query.trim().toLowerCase();
    return data
      .filter((p) => type === 'all' || p.userType === type)
      .filter((p) => !t || [p.name, p.email, p.company ?? ''].some((v) => v.toLowerCase().includes(t)))
      .sort((a, b) => FILTERS.indexOf(a.userType) - FILTERS.indexOf(b.userType) || a.name.localeCompare(b.name));
  }, [data, query, type]);

  const toggle = (k: string) =>
    setShown((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const copy = async (pin: string) => {
    try {
      await Clipboard.setStringAsync(pin);
      Alert.alert('PIN copied');
    } catch {
      Alert.alert('Could not copy the PIN');
    }
  };

  const confirmNew = (p: PinHolder) =>
    Alert.alert('Issue a new PIN?', `Issue a new PIN for ${p.name}? Their current PIN will stop working straight away.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Issue new PIN', style: 'destructive', onPress: () => regenerate.mutate(p) },
    ]);

  const options = FILTERS.map((f) => ({
    value: f,
    label: `${f === 'all' ? 'All' : TYPES[f].label} (${f === 'all' ? data.length : data.filter((p) => p.userType === f).length})`,
  }));

  return (
    <Screen title="Access PINs" back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Muted size={13} style={{ marginHorizontal: 2, lineHeight: 19 }}>
        Everyone's 6-digit PIN for opening a task's Access Point tab.
      </Muted>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <View style={{ marginTop: 14 }}>
          <ErrorBox message={errorMessage(q.error, 'Could not load PINs')} onRetry={() => void q.refetch()} />
        </View>
      ) : (
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search name, email, company…" style={{ marginTop: 14 }} />
          <Chips options={options} value={type} onChange={setType} style={{ marginTop: 12 }} />
          <Btn
            title={showAll ? 'Hide all' : 'Show all'}
            icon={showAll ? 'eye-off-outline' : 'eye-outline'}
            variant="ghost"
            onPress={() => setShowAll((v) => !v)}
            style={{ marginTop: 12, minHeight: 42 }}
          />
          {rows.length === 0 ? (
            <EmptyCard icon="search" title="No one matches." style={{ marginTop: 14 }} />
          ) : (
            <Card style={{ marginTop: 14 }}>
              {rows.map((p, i) => {
                const k = rowKey(p);
                const visible = showAll || shown.has(k);
                const busy = regenerate.isPending && !!regenerate.variables && rowKey(regenerate.variables) === k;
                return (
                  <View key={k} style={[{ paddingHorizontal: 14, paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T w="s" size={14.5} numberOfLines={1}>
                          {p.name}
                          {!p.active ? <T size={12} color={colors.muted}>{'  (inactive)'}</T> : null}
                        </T>
                        <Muted size={12.5} numberOfLines={1}>
                          {p.email}
                        </Muted>
                        {p.company ? (
                          <Muted size={12} numberOfLines={1}>
                            {p.company}
                          </Muted>
                        ) : null}
                      </View>
                      <Pill kind={TYPES[p.userType].kind} label={TYPES[p.userType].label} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                      <T mono size={17} style={{ flex: 1, letterSpacing: 4 }}>
                        {visible ? p.pin : '••••••'}
                      </T>
                      <IconBtn icon={visible ? 'eye-off-outline' : 'eye-outline'} label={visible ? 'Hide PIN' : 'Show PIN'} onPress={() => toggle(k)} />
                      <IconBtn icon="copy-outline" label="Copy PIN" onPress={() => void copy(p.pin)} />
                      {busy ? (
                        <View style={{ width: 40, alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={colors.navy} />
                        </View>
                      ) : (
                        <IconBtn icon="refresh" label="Issue a new PIN" disabled={regenerate.isPending} onPress={() => confirmNew(p)} />
                      )}
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function IconBtn({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={19} color={colors.muted} />
    </Pressable>
  );
}
