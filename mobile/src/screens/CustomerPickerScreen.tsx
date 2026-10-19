import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, EmptyState, ErrorView, LoadingView } from '../components';
import { listCustomers } from '../api/tasks';
import { errorMessage } from '../api/client';
import { customerLabel, useScope } from '../context/ScopeContext';
import { colors, spacing, typography, radius } from '../theme';

/** Admin: choose whose task board to open (like the web Tasks company picker). */
export default function CustomerPickerScreen() {
  const nav = useNavigation<any>();
  const { customer, setCustomer } = useScope();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({ queryKey: ['customers', debounced], queryFn: () => listCustomers(debounced || undefined) });

  return (
    <View style={styles.safe}>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          autoFocus
          style={styles.searchInput}
          placeholder="Search customers"
          placeholderTextColor={colors.textMuted}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
        />
      </View>
      {list.isLoading ? (
        <LoadingView />
      ) : list.isError ? (
        <ErrorView message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(c) => c.clientId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          ListEmptyComponent={<EmptyState icon="business-outline" title="No customers found" />}
          renderItem={({ item }) => {
            const active = item.clientId === customer?.clientId;
            return (
              <Pressable
                onPress={() => {
                  setCustomer(item);
                  nav.goBack();
                }}
                style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && { opacity: 0.8 }]}
              >
                <Avatar name={customerLabel(item)} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.h3} numberOfLines={1}>
                    {customerLabel(item)}
                  </Text>
                  <Text style={typography.caption}>{item.clientId}</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
});
