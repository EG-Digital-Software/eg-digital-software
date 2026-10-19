import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chips, EmptyState, ErrorView, LoadingView } from '../components';
import { TaskCard } from '../components/TaskCard';
import { useAuth, displayName } from '../context/AuthContext';
import { customerLabel, useScope } from '../context/ScopeContext';
import { useBoard, type BoardTask } from '../lib/queries';
import { PRIORITY_META, PROGRESS_ORDER, PROGRESS_META, dueState, pendingApprovals } from '../lib/tasks';
import { unreadCount, useSeenVersion } from '../lib/seen';
import { clientProfile } from '../api/tasks';
import { errorMessage } from '../api/client';
import { colors, spacing, typography, radius } from '../theme';
import type { TaskProgress } from '../api/types';

type Filter = 'OPEN' | 'ALL' | TaskProgress;

export default function TasksScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { api, isAdmin, isClient, isEmployee, customer } = useScope();
  useSeenVersion();

  // A suspended client's Tasks are locked, exactly like the web portal.
  const profile = useQuery({ queryKey: ['client', 'profile'], queryFn: clientProfile, enabled: isClient });
  const suspended = isClient && (profile.data?.accountStatusEffective ?? profile.data?.accountStatus) === 'SUSPENDED';

  const board = useBoard();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: board.tasks.length, OPEN: 0 };
    for (const t of board.tasks) {
      c[t.progress] = (c[t.progress] ?? 0) + 1;
      if (t.progress !== 'COMPLETED') c.OPEN++;
    }
    return c;
  }, [board.tasks]);

  const stats = useMemo(() => {
    const open = board.tasks.filter((t) => t.progress !== 'COMPLETED');
    return {
      open: open.length,
      due: open.filter((t) => ['overdue', 'today', 'soon'].includes(dueState(t))).length,
      overdue: open.some((t) => dueState(t) === 'overdue'),
      approvals: board.tasks.reduce((n, t) => n + pendingApprovals(t), 0),
    };
  }, [board.tasks]);

  const data = useMemo(() => {
    const q = search.trim().toLowerCase();
    return board.tasks
      .filter((t) => (filter === 'ALL' ? true : filter === 'OPEN' ? t.progress !== 'COMPLETED' : t.progress === filter))
      .filter(
        (t) =>
          !q ||
          t.title.toLowerCase().includes(q) ||
          t.taskNumber.toLowerCase().includes(q) ||
          t.groupName.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        // Open work first, then by priority, then nearest due date.
        const done = Number(a.progress === 'COMPLETED') - Number(b.progress === 'COMPLETED');
        if (done) return done;
        const pr = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
        if (pr) return pr;
        const ad = a.dueDate ? Date.parse(a.dueDate) : Infinity;
        const bd = b.dueDate ? Date.parse(b.dueDate) : Infinity;
        return ad - bd;
      });
  }, [board.tasks, filter, search]);

  const filters: { value: Filter; label: string; count?: number }[] = [
    { value: 'OPEN', label: 'Open', count: counts.OPEN },
    ...PROGRESS_ORDER.map((p) => ({ value: p as Filter, label: PROGRESS_META[p].label, count: counts[p] ?? 0 })),
    { value: 'ALL', label: 'All', count: counts.ALL },
  ];

  const openTask = (t: BoardTask) => nav.navigate('TaskDetail', { taskId: t.id, title: t.taskNumber });

  const header = (
    <View>
      <View style={styles.headerPad}>
        <Text style={typography.caption}>Good day,</Text>
        <Text style={typography.h1} numberOfLines={1}>
          {displayName(user)}
        </Text>
        <Text style={[typography.caption, { marginBottom: spacing.md }]}>
          {isEmployee ? 'Tasks assigned to you across all customers' : isClient ? "Work we're tracking for your account" : 'Plan and track work for each customer'}
        </Text>

        {isAdmin && (
          <Card onPress={() => nav.navigate('CustomerPicker')} style={styles.picker}>
            <Ionicons name="business-outline" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={typography.caption}>Customer</Text>
              <Text style={typography.h3} numberOfLines={1}>
                {customer ? customerLabel(customer) : 'Select a customer'}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </Card>
        )}

        {api && (
          <View style={styles.stats}>
            <Stat icon="list-outline" label="Open tasks" value={stats.open} onPress={() => setFilter('OPEN')} />
            <Stat
              icon="alarm-outline"
              label="Due soon"
              value={stats.due}
              tint={stats.overdue ? colors.danger : colors.warning}
              onPress={() => setFilter('OPEN')}
            />
            <Stat icon="shield-checkmark-outline" label="Approvals" value={stats.approvals} tint={colors.success} />
          </View>
        )}

        {api && (
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search tasks"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
        )}
      </View>
      {api && <Chips options={filters} value={filter} onChange={setFilter} />}
    </View>
  );

  let body: React.ReactNode = null;
  if (suspended) {
    body = (
      <EmptyState
        icon="lock-closed-outline"
        title="Tasks are locked"
        message="Your account is currently suspended, so Tasks aren't available. Please contact your account manager to restore access."
      />
    );
  } else if (isAdmin && !customer) {
    body = <EmptyState icon="business-outline" title="Pick a customer" message="Choose a customer above to see their tasks." />;
  } else if (board.isLoading || (isClient && profile.isLoading)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <LoadingView label="Loading tasks…" />
      </SafeAreaView>
    );
  } else if (board.isError && !board.data) {
    body = <ErrorView message={errorMessage(board.error)} onRetry={() => board.refetch()} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={body ? [] : data}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={board.isRefetching} onRefresh={() => board.refetch()} tintColor={colors.primary} />}
        ListEmptyComponent={
          body ?? (
            <EmptyState
              icon="checkmark-done-outline"
              title={search ? 'No matching tasks' : 'Nothing here'}
              message={search ? 'Try a different search.' : 'No tasks in this view.'}
            />
          )
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: spacing.md }}>
            <TaskCard
              task={item}
              group={isEmployee ? item.groupName : undefined}
              unread={unreadCount(item, user?.id)}
              onPress={() => openTask(item)}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function Stat({
  icon,
  label,
  value,
  tint = colors.accent,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  tint?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.stat, { opacity: pressed ? 0.85 : 1 }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={typography.caption} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerPad: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  list: { paddingBottom: spacing.xl },
  picker: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  stat: {
    flex: 1,
    gap: 6,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
});
