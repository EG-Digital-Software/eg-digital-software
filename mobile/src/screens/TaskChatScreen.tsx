import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, useIsFocused } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Avatar, ErrorView, LoadingView } from '../components';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { useTask, useSetTask, useRefetchTask } from '../lib/queries';
import { markSeen } from '../lib/seen';
import { mentionToken, parseMessage, stripMentions } from '../lib/mentions';
import { formatDay, formatSize, formatTime, isImage, sameDay } from '../lib/format';
import { fileUrl, type PickedFile } from '../api/tasks';
import { errorMessage } from '../api/client';
import { colors, spacing, typography, radius } from '../theme';
import type { AssignableUser, Role, TaskComment, TaskCommentReaction } from '../api/types';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '✅'];

const ROLE_TAG: Partial<Record<Role, string>> = { SUPER_ADMIN: 'Admin', EMPLOYEE: 'Team', CLIENT: 'Client' };

type Item = { type: 'day'; id: string; label: string } | { type: 'msg'; id: string; comment: TaskComment };

export default function TaskChatScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const taskId: string = route.params?.taskId;
  const { user } = useAuth();
  const { api, scopeKey } = useScope();
  const q = useTask(taskId);
  const setTask = useSetTask();
  const refetch = useRefetchTask(taskId);
  const focused = useIsFocused();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const task = q.data;
  const meId = user?.id;

  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [replyTo, setReplyTo] = useState<TaskComment | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<TaskComment | null>(null);
  // Picked @mentions: shown as "@Name" while typing, swapped for tokens on send.
  const [mentionPicks, setMentionPicks] = useState<{ display: string; token: string }[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (task) nav.setOptions({ title: task.title });
  }, [task?.title, nav]);

  // Everything visible is read while the chat is open.
  useEffect(() => {
    if (task && focused) markSeen(task);
  }, [task, focused]);

  const mentionable = useQuery({
    queryKey: ['mentionable', scopeKey, taskId],
    queryFn: () => api!.mentionableUsers(taskId),
    enabled: !!api,
    staleTime: 5 * 60_000,
  });

  // Active "@query" at the end of the draft.
  const mentionQuery = useMemo(() => {
    const m = /(^|\s)@([^\s@[\]]*)$/.exec(draft);
    return m ? m[2]! : null;
  }, [draft]);
  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return (mentionable.data ?? [])
      .filter((u) => u.userId !== meId && u.name.toLowerCase().includes(mentionQuery.toLowerCase()))
      .slice(0, 6);
  }, [mentionQuery, mentionable.data, meId]);

  const pickMention = (u: AssignableUser) => {
    setDraft((d) => d.replace(/@([^\s@[\]]*)$/, `@${u.name} `));
    setMentionPicks((p) => [...p.filter((x) => x.display !== `@${u.name}`), { display: `@${u.name}`, token: mentionToken(u) }]);
  };

  const encodeMentions = (text: string) => {
    let out = text;
    for (const m of [...mentionPicks].sort((a, b) => b.display.length - a.display.length)) {
      out = out.split(m.display).join(m.token);
    }
    return out;
  };

  const send = useMutation({
    mutationFn: async () => {
      const body = encodeMentions(draft.trim());
      if (file) setProgress(0);
      return api!.addComment(taskId, body, file ?? undefined, replyTo?.id, setProgress);
    },
    onSuccess: (comment) => {
      setDraft('');
      setFile(null);
      setReplyTo(null);
      setMentionPicks([]);
      if (task) setTask({ ...task, comments: [...task.comments.filter((c) => c.id !== comment.id), comment] });
      refetch();
    },
    onError: (e) => Alert.alert('Message not sent', errorMessage(e)),
    onSettled: () => setProgress(null),
  });

  const react = useMutation({
    mutationFn: ({ commentId, emoji }: { commentId: string; emoji: string }) => api!.toggleReaction(taskId, commentId, emoji),
    onSuccess: (reactions, { commentId }) => {
      if (task) setTask({ ...task, comments: task.comments.map((c) => (c.id === commentId ? { ...c, reactions } : c)) });
    },
    onError: (e) => Alert.alert('Could not react', errorMessage(e)),
  });

  const pickAttachment = () => {
    const fromLibrary = async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access in Settings to share photos.');
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 });
      const a = res.assets?.[0];
      if (!res.canceled && a) {
        setFile({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, mimeType: a.mimeType, size: a.fileSize });
      }
    };
    const fromCamera = async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Permission needed', 'Allow camera access in Settings to take photos.');
      const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      const a = res.assets?.[0];
      if (!res.canceled && a) {
        setFile({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize });
      }
    };
    const fromFiles = async () => {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      const a = res.assets?.[0];
      if (!res.canceled && a) setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size });
    };
    Alert.alert('Share', undefined, [
      { text: 'Photo or video', onPress: () => void fromLibrary() },
      { text: 'Camera', onPress: () => void fromCamera() },
      { text: 'File', onPress: () => void fromFiles() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Newest at the bottom: an inverted list renders data reversed.
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const comments = task?.comments ?? [];
    comments.forEach((c, i) => {
      const prev = comments[i - 1];
      if (!prev || !sameDay(prev.createdAt, c.createdAt)) out.push({ type: 'day', id: `day-${c.id}`, label: formatDay(c.createdAt) });
      out.push({ type: 'msg', id: c.id, comment: c });
    });
    return out.reverse();
  }, [task?.comments]);

  const byId = useMemo(() => new Map((task?.comments ?? []).map((c) => [c.id, c])), [task?.comments]);

  if (!task) {
    if (q.isError) return <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
    return <LoadingView />;
  }

  const canSend = (!!draft.trim() || !!file) && !send.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.safe}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <FlatList
        inverted
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          task.comments.length === 0 ? (
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={28} color={colors.accent} />
              <Text style={[typography.caption, { marginTop: 6 }]}>No messages yet — start the conversation.</Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          if (item.type === 'day') {
            return (
              <View style={styles.day}>
                <Text style={styles.dayText}>{item.label}</Text>
              </View>
            );
          }
          const c = item.comment;
          // In the inverted list the visually-previous message is the next index.
          const above = items[index + 1];
          const grouped = above?.type === 'msg' && above.comment.authorId === c.authorId;
          return (
            <MessageBubble
              comment={c}
              mine={c.authorId === meId}
              meId={meId}
              showAuthor={!grouped}
              replyTo={c.replyToId ? byId.get(c.replyToId) : undefined}
              onLongPress={() => setMenuFor(c)}
              onReact={(emoji) => react.mutate({ commentId: c.id, emoji })}
            />
          );
        }}
      />

      {mentionMatches.length > 0 && (
        <View style={styles.mentions}>
          {mentionMatches.map((u) => (
            <Pressable key={`${u.userType}:${u.userId}`} style={styles.mentionRow} onPress={() => pickMention(u)}>
              <Avatar name={u.name} url={u.avatarUrl} size={28} />
              <Text style={[typography.body, { flex: 1 }]} numberOfLines={1}>
                {u.name}
              </Text>
              <Text style={typography.caption}>{ROLE_TAG[u.userType] ?? ''}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {(replyTo || file) && (
        <View style={styles.pending}>
          {replyTo && (
            <View style={styles.pendingRow}>
              <View style={styles.replyBar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyAuthor}>Replying to {replyTo.authorId === meId ? 'yourself' : replyTo.authorName}</Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {stripMentions(replyTo.body) || '📎 File'}
                </Text>
              </View>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          )}
          {file && (
            <View style={styles.pendingRow}>
              {isImage(file.mimeType, file.name) ? (
                <Image source={{ uri: file.uri }} style={styles.pendingThumb} />
              ) : (
                <Ionicons name="document-attach-outline" size={26} color={colors.accent} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={typography.body} numberOfLines={1}>
                  {file.name}
                </Text>
                <Text style={typography.caption}>
                  {progress !== null ? `Uploading… ${progress}%` : formatSize(file.size ?? 0)}
                </Text>
              </View>
              {!send.isPending && (
                <Pressable onPress={() => setFile(null)} hitSlop={10}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <Pressable onPress={pickAttachment} style={styles.attach} hitSlop={6} disabled={send.isPending}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Write a message…  (@ to mention)"
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
          editable={!send.isPending}
        />
        <Pressable
          onPress={() => canSend && send.mutate()}
          disabled={!canSend}
          style={({ pressed }) => [styles.send, { opacity: !canSend ? 0.4 : pressed ? 0.7 : 1 }]}
        >
          {send.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
        </Pressable>
      </View>

      <MessageMenu
        comment={menuFor}
        onClose={() => setMenuFor(null)}
        onReact={(emoji) => menuFor && react.mutate({ commentId: menuFor.id, emoji })}
        onReply={() => {
          setReplyTo(menuFor);
          inputRef.current?.focus();
        }}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Message bubble ───────────────────────────────────────

function MessageBubble({
  comment: c,
  mine,
  meId,
  showAuthor,
  replyTo,
  onLongPress,
  onReact,
}: {
  comment: TaskComment;
  mine: boolean;
  meId?: string;
  showAuthor: boolean;
  replyTo?: TaskComment;
  onLongPress: () => void;
  onReact: (emoji: string) => void;
}) {
  const fg = mine ? '#fff' : colors.text;
  const segments = parseMessage(c.body);
  const reactions = groupReactions(c.reactions ?? [], meId);

  return (
    <View style={[styles.bubbleWrap, mine && styles.bubbleWrapMine, !showAuthor && { marginTop: 2 }]}>
      {!mine && showAuthor && (
        <Text style={styles.author}>
          {c.authorName}
          {ROLE_TAG[c.authorType] ? <Text style={styles.roleTag}>  {ROLE_TAG[c.authorType]}</Text> : null}
        </Text>
      )}
      <Pressable onLongPress={onLongPress} delayLongPress={250}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          {c.replyToId && (
            <View style={[styles.quote, mine && styles.quoteMine]}>
              <Text style={[styles.quoteAuthor, mine && { color: '#B7C4D8' }]} numberOfLines={1}>
                {replyTo ? replyTo.authorName : 'Message'}
              </Text>
              <Text style={[typography.caption, mine && { color: '#DCE4EF' }]} numberOfLines={2}>
                {replyTo ? stripMentions(replyTo.body) || '📎 File' : 'Original message was deleted'}
              </Text>
            </View>
          )}

          {(c.attachments ?? []).map((f) => {
            const url = fileUrl(f.url);
            return isImage(f.contentType, f.fileName) ? (
              <Pressable key={f.id} onPress={() => Linking.openURL(url)} onLongPress={onLongPress}>
                <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
              </Pressable>
            ) : (
              <Pressable key={f.id} onPress={() => Linking.openURL(url)} onLongPress={onLongPress} style={[styles.fileChip, mine && styles.fileChipMine]}>
                <Ionicons name="document-outline" size={20} color={mine ? '#fff' : colors.accent} />
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: fg, fontWeight: '600' }} numberOfLines={1}>
                    {f.fileName}
                  </Text>
                  <Text style={[typography.caption, mine && { color: '#B7C4D8' }]}>{formatSize(f.size)}</Text>
                </View>
              </Pressable>
            );
          })}

          {c.body ? (
            <Text style={[typography.body, { color: fg }]} selectable={false}>
              {segments.map((s, i) =>
                s.type === 'text' ? (
                  <Text key={i}>{s.text}</Text>
                ) : s.type === 'link' ? (
                  <Text key={i} style={[styles.link, mine && { color: '#9CC3FF' }]} onPress={() => Linking.openURL(s.url)}>
                    {s.url}
                  </Text>
                ) : (
                  <Text key={i} style={[styles.mention, s.userId === meId ? styles.mentionMe : mine ? styles.mentionOnDark : null]}>
                    @{s.name}
                  </Text>
                )
              )}
            </Text>
          ) : null}
          <Text style={[styles.time, mine && { color: '#B7C4D8' }]}>{formatTime(c.createdAt)}</Text>
        </View>
      </Pressable>

      {reactions.length > 0 && (
        <View style={[styles.reactions, mine && { justifyContent: 'flex-end' }]}>
          {reactions.map((r) => (
            <Pressable key={r.emoji} onPress={() => onReact(r.emoji)} style={[styles.reaction, r.mine && styles.reactionMine]}>
              <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
              {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function groupReactions(list: TaskCommentReaction[], meId?: string) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of list) {
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    g.count++;
    if (r.userId === meId) g.mine = true;
    map.set(r.emoji, g);
  }
  return [...map.values()];
}

// ─── Long-press menu ──────────────────────────────────────

function MessageMenu({
  comment,
  onClose,
  onReact,
  onReply,
}: {
  comment: TaskComment | null;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
}) {
  const insets = useSafeAreaInsets();
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <Modal visible={!!comment} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.emojiRow}>
            {QUICK_REACTIONS.map((e) => (
              <Pressable key={e} onPress={act(() => onReact(e))} style={styles.emojiBtn}>
                <Text style={{ fontSize: 26 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
          <SheetAction icon="arrow-undo-outline" label="Reply" onPress={act(onReply)} />
          {comment?.body ? (
            <SheetAction
              icon="copy-outline"
              label="Copy text"
              onPress={act(() => void Clipboard.setStringAsync(stripMentions(comment.body)))}
            />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sheetAction, pressed && { backgroundColor: colors.background }]}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={typography.body}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.sm },
  emptyChat: { alignItems: 'center', paddingVertical: spacing.xl },
  day: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginVertical: spacing.sm },
  dayText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  bubbleWrap: { alignItems: 'flex-start', maxWidth: '82%' },
  bubbleWrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  author: { ...typography.caption, marginBottom: 2, marginLeft: 4, fontWeight: '600' },
  roleTag: { fontSize: 11, fontWeight: '500', color: colors.accent },
  bubble: { padding: 10, paddingHorizontal: 12, borderRadius: radius.lg, gap: 6, minWidth: 64 },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  bubbleMine: { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  time: { fontSize: 11, color: colors.textMuted, alignSelf: 'flex-end' },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.accent, backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  quoteMine: { backgroundColor: colors.primaryLight, borderLeftColor: '#9CC3FF' },
  quoteAuthor: { fontSize: 12, fontWeight: '700', color: colors.accent },
  image: { width: 220, height: 220, borderRadius: radius.md, backgroundColor: colors.border },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 8, borderRadius: radius.md, backgroundColor: colors.accentSoft, maxWidth: 240 },
  fileChipMine: { backgroundColor: colors.primaryLight },
  link: { color: colors.accent, textDecorationLine: 'underline' },
  mention: { fontWeight: '700', color: colors.accent },
  mentionOnDark: { color: '#9CC3FF' },
  mentionMe: { backgroundColor: colors.mention, color: '#78350F' },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4 },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  reactionMine: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  reactionCount: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  mentions: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 4 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8 },
  pending: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pendingThumb: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.border },
  replyBar: { width: 3, alignSelf: 'stretch', backgroundColor: colors.accent, borderRadius: 2 },
  replyAuthor: { fontSize: 13, fontWeight: '700', color: colors.accent },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attach: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 21,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    backgroundColor: colors.background,
    color: colors.text,
  },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  emojiBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.sm, borderRadius: radius.md },
});
