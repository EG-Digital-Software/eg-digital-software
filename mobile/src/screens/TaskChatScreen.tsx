import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Image,
  Linking,
  Alert,
  Modal,
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
} from 'react-native';
import { useRoute, useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { AppBar, Avatar, ErrorBox, Loading, T, Muted, useKeyboardVisible } from '../ui';
import { teamName } from '../lib/portal';
import { EmojiPanel, SwipeToReply, deleteBefore } from './chatParts';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { useTask, useSetTask, useRefetchTask } from '../lib/queries';
import { markSeen } from '../lib/seen';
import { mentionToken, parseMessage, stripMentions } from '../lib/mentions';
import { formatDay, formatSize, formatTime, isImage, sameDay } from '../lib/format';
import { fileUrl, type PickedFile } from '../api/tasks';
import { useFileViewer } from '../lib/fileViewer';
import { errorMessage } from '../api/client';
import { colors, fonts } from '../theme';
import { initials } from '../lib/format';

const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
const radius = { sm: 8, md: 12, lg: 18, pill: 999 };
const typography = {
  body: { fontSize: 14.5, fontFamily: fonts.regular, color: colors.fg, lineHeight: 21 },
  caption: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted },
};
import type { AssignableUser, Role, TaskComment, TaskCommentReaction } from '../api/types';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '✅'];

const ROLE_TAG: Partial<Record<Role | 'TEAM', string>> = { SUPER_ADMIN: 'Admin', EMPLOYEE: 'Team', TEAM: 'Team', CLIENT: 'Client' };

type Item = { type: 'day'; id: string; label: string } | { type: 'msg'; id: string; comment: TaskComment };

export default function TaskChatScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const taskId: string = route.params?.taskId;
  const { user, admin } = useAuth();
  const readOnly = !!admin && !admin.edit;
  const { api, scopeKey } = useScope();
  const q = useTask(taskId);
  const setTask = useSetTask();
  const refetch = useRefetchTask(taskId);
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();
  // With the keyboard up the home-indicator inset is hidden behind it.
  const bottomPad = keyboardUp ? spacing.sm : Math.max(insets.bottom, spacing.sm);
  const task = q.data;
  // A completed task's chat is closed for new messages (history stays readable).
  const chatClosed = task?.progress === 'COMPLETED';
  const meId = user?.id;

  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [replyTo, setReplyTo] = useState<TaskComment | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<TaskComment | null>(null);
  // Picked @mentions: shown as "@Name" while typing, swapped for tokens on send.
  const [mentionPicks, setMentionPicks] = useState<{ display: string; token: string }[]>([]);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

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

  // Attachment strip that slides up above the composer (instead of a popup).
  const [trayOpen, setTrayOpen] = useState(false);
  const tray = useRef(new Animated.Value(0)).current;
  const [trayMounted, setTrayMounted] = useState(false);
  useEffect(() => {
    if (trayOpen) setTrayMounted(true);
    Animated.timing(tray, {
      toValue: trayOpen ? 1 : 0,
      duration: trayOpen ? 220 : 180,
      easing: trayOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !trayOpen) setTrayMounted(false);
    });
  }, [trayOpen, tray]);
  const closeTray = () => {
    setTrayOpen(false);
    setEmojiOpen(false);
  };
  const toggleTray = () => {
    if (!trayOpen) {
      Keyboard.dismiss();
      setEmojiOpen(false);
    }
    setTrayOpen((o) => !o);
  };

  // Emoji panel: takes the keyboard's place (same height) under the composer.
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [panelHeight, setPanelHeight] = useState(280);
  // Where the cursor is, so emoji go in at that point (not only at the end).
  const sel = useRef({ start: 0, end: 0 });
  // Typing closes the strip and the emoji panel.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      setTrayOpen(false);
      setEmojiOpen(false);
      if (e.endCoordinates.height > 150) setPanelHeight(Math.round(e.endCoordinates.height));
    });
    return () => sub.remove();
  }, []);

  const toggleEmoji = () => {
    if (emojiOpen) {
      setEmojiOpen(false);
      inputRef.current?.focus();
      return;
    }
    setTrayOpen(false);
    Keyboard.dismiss();
    setEmojiOpen(true);
  };

  const insertEmoji = (e: string) => {
    const { start, end } = sel.current;
    const s = Math.min(start, draft.length);
    const en = Math.min(Math.max(end, s), draft.length);
    setDraft(draft.slice(0, s) + e + draft.slice(en));
    sel.current = { start: s + e.length, end: s + e.length };
  };

  const backspace = () => {
    const { start, end } = sel.current;
    const s = Math.min(start, draft.length);
    const en = Math.min(Math.max(end, s), draft.length);
    if (en > s) {
      setDraft(draft.slice(0, s) + draft.slice(en));
      sel.current = { start: s, end: s };
      return;
    }
    const next = deleteBefore(draft, s);
    setDraft(next.text);
    sel.current = { start: next.pos, end: next.pos };
  };

  const startReply = (c: TaskComment) => {
    setReplyTo(c);
    setTrayOpen(false);
    if (!emojiOpen) inputRef.current?.focus();
  };

  const pickers = (() => {
    const fromLibrary = async (kind: 'images' | 'videos') => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access in Settings to share photos and videos.');
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind], quality: 1 });
      const a = res.assets?.[0];
      if (!res.canceled && a) {
        setFile({ uri: a.uri, name: a.fileName ?? (kind === 'videos' ? `video-${Date.now()}.mp4` : `photo-${Date.now()}.jpg`), mimeType: a.mimeType, size: a.fileSize });
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
    return [
      { key: 'camera', label: 'Camera', icon: 'camera' as const, fg: '#D7263D', bg: colors.redBg, run: fromCamera },
      { key: 'photo', label: 'Photo', icon: 'image' as const, fg: colors.onFg, bg: colors.onBg, run: () => fromLibrary('images') },
      { key: 'video', label: 'Video', icon: 'videocam' as const, fg: '#7A4FD6', bg: '#F0EBFC', run: () => fromLibrary('videos') },
      { key: 'file', label: 'File', icon: 'document' as const, fg: colors.green, bg: colors.greenSoft, run: fromFiles },
    ];
  })();
  const pick = (run: () => Promise<unknown>) => {
    setTrayOpen(false);
    void run();
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
    return (
      <View style={styles.safe}>
        <AppBar title="Chat" back />
        <View style={{ padding: 18 }}>
          {q.isError ? <ErrorBox message={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : <Loading />}
        </View>
      </View>
    );
  }

  const canSend = (!!draft.trim() || !!file) && !send.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.safe}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <AppBar title={task.title} back />
      <View style={styles.sub}>
        <Muted size={13} numberOfLines={1}>
          {task.taskNumber} · {teamName(task)}
        </Muted>
      </View>
      <View style={{ flex: 1 }}>
      <FlatList
        inverted
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          task.comments.length === 0 ? (
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={28} color={colors.green} />
              <Text style={[typography.caption, { marginTop: 6 }]}>No messages yet — start the conversation.</Text>
            </View>
          ) : undefined
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
            <SwipeToReply onReply={() => startReply(c)} enabled={!readOnly && !chatClosed}>
              <MessageBubble
                comment={c}
                mine={c.authorId === meId}
                meId={meId}
                showAuthor={!grouped}
                replyTo={c.replyToId ? byId.get(c.replyToId) : undefined}
                onLongPress={() => setMenuFor(c)}
                onReact={readOnly ? undefined : (emoji) => react.mutate({ commentId: c.id, emoji })}
              />
            </SwipeToReply>
          );
        }}
      />
      {trayOpen || emojiOpen ? <Pressable style={styles.trayScrim} onPress={closeTray} accessibilityLabel="Close" /> : null}
      </View>

      {mentionMatches.length > 0 && (
        <View style={styles.mentions}>
          {mentionMatches.map((u) => (
            <Pressable key={`${u.userType}:${u.userId}`} style={styles.mentionRow} onPress={() => pickMention(u)}>
              <Avatar name={u.name} size={28} />
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
                <Ionicons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>
          )}
          {file && (
            <View style={styles.pendingRow}>
              {isImage(file.mimeType, file.name) ? (
                <Image source={{ uri: file.uri }} style={styles.pendingThumb} />
              ) : (
                <Ionicons name="document-attach-outline" size={26} color={colors.green} />
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
                  <Ionicons name="close" size={20} color={colors.muted} />
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {readOnly ? (
        <View style={[styles.composer, { paddingBottom: bottomPad + 6, justifyContent: 'center' }]}>
          <Muted size={13}>View only — turn on Allow changes to reply as the customer.</Muted>
        </View>
      ) : chatClosed ? (
        // Completed task: earlier messages stay visible, new ones are blocked.
        <View style={[styles.composer, { paddingBottom: bottomPad + 6, justifyContent: 'center' }]}>
          <Muted size={13}>This task is completed — chat is closed for new messages.</Muted>
        </View>
      ) : (
      <>
      {trayMounted ? (
        <Animated.View
          style={[
            styles.tray,
            {
              height: tray.interpolate({ inputRange: [0, 1], outputRange: [0, 96] }),
              opacity: tray,
            },
          ]}
        >
          <Animated.View style={[styles.trayRow, { transform: [{ translateY: tray.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
            {pickers.map((p) => (
              <Pressable key={p.key} onPress={() => pick(p.run)} style={({ pressed }) => [styles.trayItem, pressed && { opacity: 0.7 }]}>
                <View style={[styles.trayIcon, { backgroundColor: p.bg }]}>
                  <Ionicons name={p.icon} size={22} color={p.fg} />
                </View>
                <T w="s" size={12} color={colors.fg}>
                  {p.label}
                </T>
              </Pressable>
            ))}
          </Animated.View>
        </Animated.View>
      ) : null}
      <View style={[styles.composer, { paddingBottom: emojiOpen ? 8 : bottomPad + 4 }]}>
        <Pressable onPress={toggleTray} style={[styles.attach, trayOpen && { backgroundColor: colors.navy }]} hitSlop={6} disabled={send.isPending} accessibilityLabel={trayOpen ? 'Close attachments' : 'Add attachment'}>
          <Animated.View style={{ transform: [{ rotate: tray.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
            <Ionicons name="add" size={24} color={trayOpen ? '#fff' : colors.green} />
          </Animated.View>
        </Pressable>
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Message · type @ to mention"
            placeholderTextColor={colors.muted}
            value={draft}
            onChangeText={setDraft}
            onSelectionChange={(e) => {
              sel.current = e.nativeEvent.selection;
            }}
            // Tapping the box while the emoji panel is open brings the keyboard back.
            onFocus={() => setEmojiOpen(false)}
            showSoftInputOnFocus
            multiline
            editable={!send.isPending}
          />
          <Pressable onPress={toggleEmoji} style={styles.emojiToggle} hitSlop={6} accessibilityLabel={emojiOpen ? 'Show keyboard' : 'Emoji'}>
            <Ionicons name={emojiOpen ? 'keypad-outline' : 'happy-outline'} size={22} color={emojiOpen ? colors.green : colors.muted} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => canSend && send.mutate()}
          disabled={!canSend}
          style={({ pressed }) => [styles.send, { backgroundColor: canSend ? colors.navy : '#AEB8C6', opacity: pressed ? 0.8 : 1 }]}
        >
          {send.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
        </Pressable>
      </View>
      {emojiOpen ? (
        <EmojiPanel onPick={insertEmoji} onBackspace={backspace} height={panelHeight} bottomInset={insets.bottom} />
      ) : null}
      </>
      )}

      <MessageMenu
        comment={menuFor}
        onClose={() => setMenuFor(null)}
        // Read-only customer view: the API refuses reactions and there's no composer to reply in.
        onReact={readOnly ? undefined : (emoji) => menuFor && react.mutate({ commentId: menuFor.id, emoji })}
        onReply={
          readOnly || chatClosed
            ? undefined
            : () => {
                setReplyTo(menuFor);
                inputRef.current?.focus();
              }
        }
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
  onReact?: (emoji: string) => void;
}) {
  const fg = mine ? '#fff' : colors.fg;
  const view = useFileViewer();
  const openAttachment = (i: number) =>
    view((c.attachments ?? []).map((x) => ({ url: fileUrl(x.url), name: x.fileName, contentType: x.contentType })), i);
  const segments = parseMessage(c.body);
  const reactions = groupReactions(c.reactions ?? [], meId);

  return (
    <View style={[styles.mrow, mine && { justifyContent: 'flex-end' }, !showAuthor && { marginTop: 2 }]}>
      {!mine ? (
        showAuthor ? (
          <Avatar name={c.authorName} label={initials(c.authorName)} size={28} />
        ) : (
          <View style={{ width: 28 }} />
        )
      ) : null}
    <View style={[styles.bubbleWrap, mine && styles.bubbleWrapMine]}>
      <Pressable onLongPress={onLongPress} delayLongPress={250}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          {!mine && showAuthor ? (
            <Text style={styles.author}>
              {c.authorName}
              {ROLE_TAG[c.authorType] ? <Text style={styles.roleTag}>  {ROLE_TAG[c.authorType]}</Text> : null}
            </Text>
          ) : null}
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

          {(c.attachments ?? []).map((f, fi) => {
            const url = fileUrl(f.url);
            return isImage(f.contentType, f.fileName) ? (
              <Pressable key={f.id} onPress={() => openAttachment(fi)} onLongPress={onLongPress}>
                <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
              </Pressable>
            ) : (
              <Pressable key={f.id} onPress={() => openAttachment(fi)} onLongPress={onLongPress} style={[styles.fileChip, mine && styles.fileChipMine]}>
                <Ionicons name="document-outline" size={20} color={mine ? '#fff' : colors.green} />
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
            <Pressable key={r.emoji} onPress={onReact ? () => onReact(r.emoji) : undefined} disabled={!onReact} style={[styles.reaction, r.mine && styles.reactionMine]}>
              <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
              {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
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
  onReact?: (emoji: string) => void;
  onReply?: () => void;
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
          {onReact ? (
            <View style={styles.emojiRow}>
              {QUICK_REACTIONS.map((e) => (
                <Pressable key={e} onPress={act(() => onReact(e))} style={styles.emojiBtn}>
                  <Text style={{ fontSize: 26 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {onReply ? <SheetAction icon="arrow-undo-outline" label="Reply" onPress={act(onReply)} /> : null}
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sheetAction, pressed && { backgroundColor: colors.soft2 }]}>
      <Ionicons name={icon} size={20} color={colors.navy} />
      <Text style={typography.body}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  sub: { paddingHorizontal: 18, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: '#fff' },
  mrow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  trayScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tray: { overflow: 'hidden', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line },
  trayRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', height: 96, paddingHorizontal: 12 },
  trayItem: { alignItems: 'center', gap: 6, minWidth: 64 },
  trayIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 18, paddingVertical: spacing.md, gap: 10 },
  emptyChat: { alignItems: 'center', paddingVertical: spacing.xl },
  day: { alignSelf: 'center', backgroundColor: colors.soft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginVertical: spacing.sm },
  dayText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.muted },
  bubbleWrap: { alignItems: 'flex-start', maxWidth: '78%' },
  bubbleWrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  author: { fontSize: 12, fontFamily: fonts.bold, color: colors.green, marginBottom: 2 },
  roleTag: { fontSize: 11, fontFamily: fonts.medium, color: colors.muted },
  bubble: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: 18, gap: 6, minWidth: 64 },
  bubbleTheirs: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 6 },
  bubbleMine: { backgroundColor: colors.navy, borderBottomRightRadius: 6 },
  time: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, opacity: 0.8, alignSelf: 'flex-end' },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.green, backgroundColor: colors.soft2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  quoteMine: { backgroundColor: colors.navyLight, borderLeftColor: '#9CC3FF' },
  quoteAuthor: { fontSize: 12, fontWeight: '700', color: colors.green },
  image: { width: 220, height: 220, borderRadius: radius.md, backgroundColor: colors.line },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.soft2, maxWidth: 240 },
  fileChipMine: { backgroundColor: 'rgba(255,255,255,0.14)' },
  link: { color: colors.green, textDecorationLine: 'underline' },
  mention: { fontFamily: fonts.bold, color: colors.green },
  mentionOnDark: { color: '#9CC3FF' },
  mentionMe: { backgroundColor: colors.mention, color: '#78350F' },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4 },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  reactionMine: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  reactionCount: { fontSize: 12, fontWeight: '600', color: colors.muted },
  mentions: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 4 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8 },
  pending: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pendingThumb: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.line },
  replyBar: { width: 3, alignSelf: 'stretch', backgroundColor: colors.green, borderRadius: 2 },
  replyAuthor: { fontSize: 13, fontWeight: '700', color: colors.green },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  attach: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.soft2,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    paddingLeft: 16,
    paddingRight: 4,
    fontFamily: fonts.medium,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
    color: colors.fg,
  },
  emojiToggle: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: spacing.md },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  emojiBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.soft2 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.sm, borderRadius: radius.md },
});
