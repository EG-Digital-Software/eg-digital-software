import React, { useState } from 'react';
import { View, Pressable, TextInput, Alert, Linking, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { useRefetchTask, useSetTask, useTask } from '../lib/queries';
import { unreadCount, useSeenVersion } from '../lib/seen';
import { formatSize, formatStamp, initials } from '../lib/format';
import { PROGRESS_PILL, fmtDate, teamName } from '../lib/portal';
import { fileUrl, type PickedFile } from '../api/tasks';
import { errorMessage } from '../api/client';
import { Avatar, Bird, Btn, Card, ErrorBox, Eyebrow, KV, Loading, Muted, Pill, Screen, T, useRevealFocused } from '../ui';
import { colors, fonts } from '../theme';
import type { Task } from '../api/types';

const PRIORITY: Record<string, string> = { URGENT: 'Urgent', IMPORTANT: 'Important', MEDIUM: 'Medium', LOW: 'Low' };

export default function TaskDetailScreen() {
  const route = useRoute<any>();
  const taskId: string = route.params?.taskId;
  const q = useTask(taskId, { poll: false });
  const [tab, setTab] = useState<'details' | 'files'>('details');
  useSeenVersion();

  const task = q.data;
  return (
    <Screen title="Task" back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {!task ? (
        q.isError ? (
          <ErrorBox message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : (
          <Loading />
        )
      ) : (
        <Body task={task} tab={tab} setTab={setTab} />
      )}
    </Screen>
  );
}

function Body({ task, tab, setTab }: { task: Task; tab: 'details' | 'files'; setTab: (t: 'details' | 'files') => void }) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const pill = PROGRESS_PILL[task.progress] ?? PROGRESS_PILL.NOT_STARTED!;
  const unread = unreadCount(task, user?.id);
  const last = task.comments[task.comments.length - 1];
  const chatSub = unread
    ? `${unread} new message${unread > 1 ? 's' : ''}${last ? ` from ${last.authorName.split(' ')[0]}` : ''}`
    : last
      ? `Latest from ${last.authorId === user?.id ? 'you' : last.authorName.split(' ')[0]}, ${formatStamp(last.createdAt)}`
      : 'Start the conversation with your team';

  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <T mono size={12.5} color={colors.muted}>
          {task.taskNumber}
        </T>
        <Pill kind={pill.kind} label={pill.label} />
      </View>
      <T w="b" size={22} style={{ letterSpacing: -0.2, lineHeight: 28, marginTop: 8, marginBottom: 16 }}>
        {task.title}
      </T>

      <Pressable
        onPress={() => nav.navigate('Thread', { taskId: task.id })}
        style={({ pressed }) => [
          { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, backgroundColor: colors.navy },
          pressed && { opacity: 0.92 },
        ]}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <Bird size={28} />
        </View>
        <View style={{ flex: 1 }}>
          <T w="s" size={15} color="#fff">
            Task chat
          </T>
          <T size={12.5} color="#C9D3E1" numberOfLines={1}>
            {chatSub}
          </T>
        </View>
        {unread > 0 ? (
          <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
            <T w="b" size={11} color="#fff">
              {unread}
            </T>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color="#fff" />
      </Pressable>

      {/* Android-style tabs */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, marginTop: 16 }}>
        {(['details', 'files'] as const).map((k) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center' }}>
              <T w="s" size={14} color={on ? colors.green : colors.muted}>
                {k === 'details' ? 'Details' : `Files${task.attachments.length ? ` · ${task.attachments.length}` : ''}`}
              </T>
              {on ? <View style={{ position: 'absolute', left: '22%', right: '22%', bottom: -1, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.green }} /> : null}
            </Pressable>
          );
        })}
      </View>

      {tab === 'details' ? <Details task={task} /> : <Files task={task} />}
    </>
  );
}

function Details({ task }: { task: Task }) {
  const { user, admin } = useAuth();
  const { api } = useScope();
  const setTask = useSetTask();
  const [draft, setDraft] = useState('');
  const reveal = useRevealFocused();
  const notes = task.notes.filter((n) => (n.kind ?? 'NOTE') === 'NOTE');
  const team = teamName(task);
  const readOnly = !!admin && !admin.edit;

  const add = useMutation({
    mutationFn: () => api!.addNote(task.id, draft.trim()),
    onSuccess: (note) => {
      setDraft('');
      setTask({ ...task, notes: [...task.notes, note] });
    },
    onError: (e) => Alert.alert('Note not saved', errorMessage(e)),
  });

  return (
    <>
      <KV
        style={{ marginTop: 16 }}
        rows={[
          ['Started', fmtDate(task.startDate || task.createdAt)],
          ['End', task.dueDate ? fmtDate(task.dueDate) : 'No end date'],
          ['Priority', PRIORITY[task.priority] ?? task.priority],
        ]}
      />

      <Eyebrow style={{ marginTop: 20, marginBottom: 10, marginLeft: 2 }}>Team</Eyebrow>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 }}>
          <Avatar name={team} label={initials(team)} />
          <View style={{ flex: 1 }}>
            <T w="s" size={14}>
              {task.assignedTeam ? team : 'Not assigned yet'}
            </T>
            <Muted size={12.5}>Your EG Eloma team on this task</Muted>
          </View>
        </View>
      </Card>

      <Eyebrow style={{ marginTop: 20, marginBottom: 10, marginLeft: 2 }}>Notes</Eyebrow>
      <Card style={{ padding: 14 }}>
        {notes.length === 0 ? (
          <Muted size={14} style={{ marginBottom: 10 }}>
            No notes yet. Notes are visible to your EG Eloma team.
          </Muted>
        ) : (
          notes.map((n) => (
            <View key={n.id} style={{ padding: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.soft2, marginBottom: 8 }}>
              {n.subject ? (
                <T w="s" size={14}>
                  {n.subject}
                </T>
              ) : null}
              <T size={14} style={{ lineHeight: 20 }}>
                {n.body}
              </T>
              <Muted size={12} style={{ marginTop: 4 }}>
                {n.authorId === user?.id ? 'You' : n.authorType === 'EMPLOYEE' ? team : n.authorName} · {formatStamp(n.createdAt)}
              </Muted>
            </View>
          ))
        )}
        {!readOnly ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onContentSizeChange={reveal}
              placeholder="Add a note"
              placeholderTextColor={colors.faint}
              multiline
              style={{
                flex: 1,
                minHeight: 46,
                maxHeight: 120,
                paddingHorizontal: 14,
                paddingTop: 13,
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomWidth: 1.5,
                borderBottomColor: '#8C99AB',
                backgroundColor: colors.soft,
                fontFamily: fonts.medium,
                fontSize: 15,
                color: colors.fg,
              }}
            />
            <Pressable
              onPress={() => draft.trim() && !add.isPending && add.mutate()}
              accessibilityLabel="Save note"
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: draft.trim() ? colors.navy : '#AEB8C6', alignItems: 'center', justifyContent: 'center' }}
            >
              {add.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
            </Pressable>
          </View>
        ) : null}
      </Card>
    </>
  );
}

function Files({ task }: { task: Task }) {
  const { user, admin } = useAuth();
  const { api } = useScope();
  const setTask = useSetTask();
  const refetch = useRefetchTask(task.id);
  const [progress, setProgress] = useState<number | null>(null);
  const readOnly = !!admin && !admin.edit;
  const files = [...task.attachments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const upload = useMutation({
    mutationFn: (file: PickedFile) => {
      setProgress(0);
      return api!.addAttachment(task.id, file, setProgress);
    },
    onSuccess: (att) => {
      setTask({ ...task, attachments: [...task.attachments, att] });
      refetch();
    },
    onError: (e) => Alert.alert('Upload failed', errorMessage(e)),
    onSettled: () => setProgress(null),
  });

  const pick = () => {
    const fromFiles = async () => {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      const a = res.assets?.[0];
      if (!res.canceled && a) upload.mutate({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size });
    };
    const fromPhotos = async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access in Settings to add photos.');
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 });
      const a = res.assets?.[0];
      if (!res.canceled && a) upload.mutate({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, mimeType: a.mimeType, size: a.fileSize });
    };
    Alert.alert('Add a file', undefined, [
      { text: 'Photo or video', onPress: () => void fromPhotos() },
      { text: 'File', onPress: () => void fromFiles() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <>
      {!readOnly ? (
        <Btn
          title={progress !== null ? `Uploading… ${progress}%` : 'Add a file'}
          icon="cloud-upload-outline"
          variant="dashed"
          loading={upload.isPending && progress === null}
          disabled={upload.isPending}
          onPress={pick}
          style={{ marginTop: 16 }}
        />
      ) : null}
      <Card style={{ marginTop: 16 }}>
        {files.length === 0 ? (
          <Muted size={14} style={{ padding: 16 }}>
            No files on this task yet.
          </Muted>
        ) : (
          files.map((f, i) => (
            <Pressable
              key={f.id}
              onPress={() => Linking.openURL(fileUrl(f.url))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="document-outline" size={18} color={colors.green} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T w="s" size={14} numberOfLines={1}>
                  {f.fileName}
                </T>
                <Muted size={12.5}>
                  {f.uploadedById === user?.id ? 'You' : teamName(task)} · {formatStamp(f.createdAt)}
                  {f.size ? ` · ${formatSize(f.size)}` : ''}
                </Muted>
              </View>
            </Pressable>
          ))
        )}
      </Card>
    </>
  );
}
