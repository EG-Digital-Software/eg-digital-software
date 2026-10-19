import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Card, EmptyState, ErrorView, LoadingView } from '../components';
import { useAuth } from '../context/AuthContext';
import { customerLabel, useScope } from '../context/ScopeContext';
import { useBoard } from '../lib/queries';
import { lastActivityAt, lastComment } from '../lib/tasks';
import { unreadCount, useSeenVersion } from '../lib/seen';
import { stripMentions } from '../lib/mentions';
import { formatStamp } from '../lib/format';
import { errorMessage } from '../api/client';
import { colors, spacing, typography, radius } from '../theme';

/** Every task chat in the current board, most recent conversation first. */
export default function ChatsScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { api, isAdmin, isEmployee, customer } = useScope();
  const board = useBoard();
  useSeenVersion();
  const [q, setQ] = useState('');

  const threads = useMemo(() => {
    const s = q.trim().toLowerCase();
    return board.tasks
      .filter((t) => t.comments.length > 0)
      .filter((t) => !s || t.title.toLowerCase().includes(s) || t.taskNumber.toLowerCase().includes(s))
      .sort((a, b) => Date.parse(lastActivityAt(b)) - Date.parse(lastActivityAt(a)));
  }, [board.tasks, q]);

  const header = (
    <View>
      <Text style={typography.h1}>Chats</Text>
      <Text style={[typography.caption, { marginBottom: spacing.md }]}>
        {isAdmin && customer ? customerLabel(customer) : 'Conversations on your tasks'}
      </Text>
      {api && (
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search chats"
            placeholderTextColor={colors.textMuted}
            value={q}
            onChangeText={setQ}
          />
        </View>
      )}
    </View>
  );

  if (!api) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.list}>{header}</View>
        <EmptyState icon="business-outline" title="Pick a customer" message="Choose a customer on the Tasks tab first." />
      </SafeAreaView>
    );
  }
  if (board.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.list}>{header}</View>
        <LoadingView />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={board.isRefetching} onRefresh={() => board.refetch()} tintColor={colors.primary} />}
        ListEmptyComponent={
          board.isError ? (
            <ErrorView message={errorMessage(board.error)} onRetry={() => board.refetch()} />
          ) : (
            <EmptyState icon="chatbubbles-outline" title="No conversations yet" message="Open a task and say hello." />
          )
        }
        renderItem={({ item: t }) => {
          const last = lastComment(t)!;
          const unread = unreadCount(t, user?.id);
          const mine = last.authorId === user?.id;
          const preview =
            stripMentions(last.body).trim() || (last.attachments?.length ? `📎 ${last.attachments[0]!.fileName}` : '');
          return (
            <Card onPress={() => nav.navigate('TaskChat', { taskId: t.id, title: t.title })}>
              <View style={styles.header}>
                <Avatar name={last.authorName} />
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={[typography.h3, { flex: 1 }]} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={[typography.caption, unread > 0 && { color: colors.accent, fontWeight: '600' }]}>
                      {formatStamp(last.createdAt)}
                    </Text>
                  </View>
                  <Text style={typography.caption} numberOfLines={1}>
                    {t.taskNumber}
                    {isEmployee ? ` · ${t.groupName}` : ''}
                  </Text>
                  <View style={styles.titleRow}>
                    <Text
                      style={[typography.body, { marginTop: 4, flex: 1, color: unread ? colors.text : colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {mine ? 'You' : last.authorName.split(' ')[0]}: {preview}
                    </Text>
                    {unread > 0 && (
                      <View style={styles.unread}>
                        <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginTop: 4,
  },
  unreadText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
});
