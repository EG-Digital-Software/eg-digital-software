import React, { useEffect, useState } from 'react';
import { View, FlatList, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listCustomers } from '../api/portal';
import { errorMessage } from '../api/client';
import { displayName, useAuth } from '../context/AuthContext';
import { Avatar, Bird, Btn, Card, ErrorBox, KeyboardSafe, Loading, Muted, SearchField, T, Toggle } from '../ui';
import { colors, GUTTER } from '../theme';
import type { CustomerSummary } from '../api/types';

const label = (c: CustomerSummary) => c.companyName || c.contactPerson || c.clientId;

/** Admin: choose which customer's portal to open (signed in from the logo). */
export default function CustomerPickerScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { user, openCustomer, signOut } = useAuth();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [edit, setEdit] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({ queryKey: ['customers', debounced], queryFn: () => listCustomers(debounced || undefined) });

  const open = async (c: CustomerSummary) => {
    setOpening(c.clientId);
    try {
      await openCustomer(c.clientId, label(c), edit);
    } catch (e) {
      Alert.alert('Could not open this customer', errorMessage(e));
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 60, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {nav.canGoBack() ? (
          <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={22} color={colors.fg} />
          </Pressable>
        ) : (
          <Bird size={28} />
        )}
        <T w="s" size={20} style={{ flex: 1 }}>
          Choose a customer
        </T>
      </View>
      <KeyboardSafe>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(c) => c.clientId}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: GUTTER, paddingBottom: insets.bottom + 24, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <Muted size={14}>Signed in as admin · {displayName(user)}. Open a customer to see the app exactly as they do.</Muted>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
              <View style={{ flex: 1 }}>
                <T w="s" size={14}>
                  Allow changes
                </T>
                <Muted size={12.5}>Off: view only. On: messages, notes and signatures are made as the customer.</Muted>
              </View>
              <Toggle value={edit} onChange={setEdit} />
            </Card>
            <SearchField value={q} onChangeText={setQ} placeholder="Search customers" />
            {list.isLoading ? <Loading /> : null}
            {list.isError ? <ErrorBox message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : null}
          </View>
        }
        ListEmptyComponent={!list.isLoading && !list.isError ? <Muted style={{ textAlign: 'center', marginTop: 20 }}>No customers found</Muted> : undefined}
        renderItem={({ item }) => (
          <Card onPress={() => open(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
            <Avatar name={label(item)} size={42} radius={12} fill={colors.navy} color="#fff" />
            <View style={{ flex: 1 }}>
              <T w="s" size={15} numberOfLines={1}>
                {label(item)}
              </T>
              <T mono size={12} color={colors.muted}>
                {item.clientId}
              </T>
            </View>
            {opening === item.clientId ? <ActivityIndicator color={colors.navy} /> : <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
          </Card>
        )}
        ListFooterComponent={<Btn title="Sign out" variant="ghost" onPress={() => void signOut()} style={{ marginTop: 16 }} />}
      />
      </KeyboardSafe>
    </View>
  );
}
