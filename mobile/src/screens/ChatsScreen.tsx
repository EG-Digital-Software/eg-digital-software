import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useBoard } from '../lib/queries';
import { unreadCount, useSeenVersion } from '../lib/seen';
import { formatStamp } from '../lib/format';
import { stripMentions } from '../lib/mentions';
import { lastActivityAt } from '../lib/tasks';
import { errorMessage } from '../api/client';
import { Bird, Card, ErrorBox, Eyebrow, Loading, Muted, Pill, Screen, SearchField, T } from '../ui';
import { colors } from '../theme';

export default function ChatsScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const board = useBoard();
  useSeenVersion();
  const [q, setQ] = useState('');

  const chats = useMemo(
    () => board.tasks.filter((t) => t.comments.length > 0).sort((a, b) => lastActivityAt(b).localeCompare(lastActivityAt(a))),
    [board.tasks]
  );
  const term = q.trim().toLowerCase();
  const shown = chats.filter((t) => !term || `${t.taskNumber} ${t.title}`.toLowerCase().includes(term));

  return (
    <Screen title="Chats" refreshing={board.isRefetching} onRefresh={() => void board.refetch()}>
      <Muted size={14} style={{ marginBottom: 14 }}>
        Conversations on your tasks
      </Muted>
      <SearchField value={q} onChangeText={setQ} placeholder="Search chats" />

      <Eyebrow style={{ marginTop: 18, marginBottom: 8, marginLeft: 2 }}>Task chats</Eyebrow>
      {board.isLoading ? (
        <Loading />
      ) : board.isError ? (
        <ErrorBox message={errorMessage(board.error)} onRetry={() => void board.refetch()} />
      ) : (
        <Card>
          {shown.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <T w="s" size={15}>
                {term ? 'No chats match' : 'No conversations yet'}
              </T>
            </View>
          ) : (
            shown.map((t, i) => {
              const last = t.comments[t.comments.length - 1]!;
              const unread = unreadCount(t, user?.id);
              const who = last.authorId === user?.id ? 'You' : last.authorName.split(' ')[0];
              const text = stripMentions(last.body) || (last.attachments?.length ? last.attachments[0]!.fileName : '');
              return (
                <Pressable
                  key={t.id}
                  onPress={() => nav.navigate('Thread', { taskId: t.id })}
                  style={({ pressed }) => [
                    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line },
                    pressed && { backgroundColor: colors.soft2 },
                  ]}
                >
                  <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' }}>
                    <Bird size={26} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <T w="s" size={15} style={{ flex: 1 }} numberOfLines={1}>
                        {t.title}
                      </T>
                      <Muted size={12}>{formatStamp(last.createdAt)}</Muted>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <Muted size={13} style={{ flex: 1 }} numberOfLines={1}>
                        {who}: {text}
                      </Muted>
                      {unread > 0 ? (
                        <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                          <T w="b" size={11} color="#fff">
                            {unread}
                          </T>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
      )}
      <Muted size={13} style={{ textAlign: 'center', marginTop: 16 }}>
        Open any task to start a new conversation.
      </Muted>
    </Screen>
  );
}
