import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Linking, Alert, RefreshControl, Image } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Avatar, Badge, Button, Card, EmptyState, ErrorView, LoadingView, ProgressBar, Row, SectionTitle, Segmented } from '../components';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { useTask, useSetTask, useRefetchTask } from '../lib/queries';
import { PRIORITY_META, PROGRESS_META, PROGRESS_ORDER, checklistProgress, dueColor, dueState, labelColor, lastComment } from '../lib/tasks';
import { formatDate, formatSize, formatStamp, isImage } from '../lib/format';
import { stripMentions } from '../lib/mentions';
import { unreadCount, useSeenVersion } from '../lib/seen';
import { fileUrl } from '../api/tasks';
import { errorMessage } from '../api/client';
import { colors, spacing, typography, radius } from '../theme';
import type { Task, TaskApproval, TaskAttachment, TaskProgress } from '../api/types';

type Tab = 'details' | 'approvals' | 'files';

export default function TaskDetailScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const taskId: string = route.params?.taskId;
  const q = useTask(taskId);
  const [tab, setTab] = useState<Tab>('details');
  const { user } = useAuth();
  useSeenVersion();

  const task = q.data;
  useEffect(() => {
    if (task) nav.setOptions({ title: task.taskNumber });
  }, [task?.taskNumber, nav]);

  if (!task) {
    if (q.isError) return <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
    return <LoadingView />;
  }

  const priority = PRIORITY_META[task.priority];
  const progress = PROGRESS_META[task.progress];
  const pending = task.approvals.filter((a) => a.status === 'PENDING').length;
  const last = lastComment(task);
  const unread = unreadCount(task, user?.id);

  return (
    <ScrollView
      style={styles.safe}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />}
    >
      <Text style={[typography.h1, { fontSize: 24 }]}>{task.title}</Text>
      <View style={styles.badges}>
        <Badge label={progress.label} fg={progress.fg} bg={progress.bg} icon={progress.icon} />
        <Badge label={priority.label} fg={priority.fg} bg={priority.bg} icon={priority.icon} />
      </View>

      <Card onPress={() => nav.navigate('TaskChat', { taskId: task.id, title: task.title })} style={styles.chatCard}>
        <View style={styles.chatIcon}>
          <Ionicons name="chatbubbles" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.h3, { color: '#fff' }]}>Task chat</Text>
          <Text style={styles.chatPreview} numberOfLines={1}>
            {last
              ? `${last.authorName.split(' ')[0]}: ${stripMentions(last.body) || (last.attachments?.length ? '📎 File' : '')}`
              : 'Start the conversation'}
          </Text>
        </View>
        {unread > 0 ? (
          <View style={styles.unread}>
            <Text style={styles.unreadText}>{unread}</Text>
          </View>
        ) : last ? (
          <Text style={styles.chatPreview}>{formatStamp(last.createdAt)}</Text>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color="#B7C4D8" />
      </Card>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'details', label: 'Details' },
          { value: 'approvals', label: `Approvals${task.approvals.some((a) => !a.parentId) ? ` (${task.approvals.filter((a) => !a.parentId).length})` : ''}`, dot: pending > 0 },
          { value: 'files', label: `Files${task.attachments.length + (task.archive?.length ?? 0) ? ` (${task.attachments.length + (task.archive?.length ?? 0)})` : ''}` },
        ]}
      />

      {tab === 'details' && <DetailsTab task={task} />}
      {tab === 'approvals' && <ApprovalsTab task={task} />}
      {tab === 'files' && <FilesTab task={task} />}
    </ScrollView>
  );
}

// ─── Details ──────────────────────────────────────────────

function DetailsTab({ task }: { task: Task }) {
  const { api } = useScope();
  const setTask = useSetTask();
  const refetch = useRefetchTask(task.id);
  const checklist = checklistProgress(task);
  const due = dueState(task);

  const progressM = useMutation({
    mutationFn: (p: TaskProgress) => api!.setProgress(task.id, p),
    onSuccess: setTask,
    onError: (e) => Alert.alert('Could not update', errorMessage(e)),
  });

  const checklistM = useMutation({
    mutationFn: (items: { text: string; done: boolean }[]) => api!.setChecklist(task.id, items),
    onSuccess: setTask,
    onError: (e) => {
      Alert.alert('Could not update', errorMessage(e));
      refetch();
    },
  });

  const toggleItem = (id: string) =>
    checklistM.mutate(task.checklist.map((c) => ({ text: c.text, done: c.id === id ? !c.done : c.done })));

  const notes = task.notes.filter((n) => (n.kind ?? 'NOTE') === 'NOTE');

  return (
    <View>
      <SectionTitle title="Status" />
      <View style={styles.statusGrid}>
        {PROGRESS_ORDER.map((p) => {
          const m = PROGRESS_META[p];
          const active = task.progress === p;
          return (
            <Pressable
              key={p}
              disabled={progressM.isPending}
              onPress={() => !active && progressM.mutate(p)}
              style={[styles.status, active && { backgroundColor: m.bg, borderColor: m.fg }]}
            >
              <Ionicons name={m.icon} size={18} color={active ? m.fg : colors.textMuted} />
              <Text style={[styles.statusText, active && { color: m.fg }]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <Row label="Start" value={formatDate(task.startDate)} />
        <Row label="Due" value={formatDate(task.dueDate)} valueStyle={{ color: due === 'none' ? colors.text : dueColor(due) }} />
        <Row label="Created" value={formatDate(task.createdAt)} last={!task.completedAt} />
        {task.completedAt ? <Row label="Completed" value={formatDate(task.completedAt)} last /> : null}
      </Card>

      {task.assignees.length > 0 && (
        <>
          <SectionTitle title="Assigned to" />
          <Card>
            {task.assignees.map((a, i) => (
              <View key={a.userId} style={[styles.person, i < task.assignees.length - 1 && styles.divider]}>
                <Avatar name={a.name} url={a.avatarUrl} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{a.name}</Text>
                  {a.email ? <Text style={typography.caption}>{a.email}</Text> : null}
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      {task.labels.length > 0 && (
        <View style={styles.labels}>
          {task.labels.map((l) => (
            <View key={l.id} style={[styles.label, { backgroundColor: labelColor(l.color) }]}>
              <Text style={styles.labelText}>{l.name}</Text>
            </View>
          ))}
        </View>
      )}

      {task.checklist.length > 0 && (
        <>
          <SectionTitle title="Checklist" />
          <Card>
            <View style={{ marginBottom: spacing.sm }}>
              <ProgressBar value={checklist ?? 0} color={colors.success} />
              <Text style={[typography.caption, { marginTop: 6 }]}>
                {task.checklist.filter((c) => c.done).length} of {task.checklist.length} done
              </Text>
            </View>
            {task.checklist.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => toggleItem(c.id)}
                disabled={checklistM.isPending}
                style={[styles.checkItem, i < task.checklist.length - 1 && styles.divider]}
              >
                <Ionicons name={c.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={c.done ? colors.success : colors.border} />
                <Text style={[typography.body, { flex: 1 }, c.done && styles.done]}>{c.text}</Text>
              </Pressable>
            ))}
          </Card>
        </>
      )}

      {task.description ? (
        <>
          <SectionTitle title="Description" />
          <Card>
            <Text style={typography.body} selectable>
              {task.description}
            </Text>
            {task.descriptionAuthorName ? (
              <Text style={[typography.caption, { marginTop: spacing.sm }]}>
                Updated by {task.descriptionAuthorName}
                {task.descriptionUpdatedAt ? ` · ${formatDate(task.descriptionUpdatedAt)}` : ''}
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}

      <NotesSection task={task} notes={notes} />
    </View>
  );
}

function NotesSection({ task, notes }: { task: Task; notes: Task['notes'] }) {
  const { api } = useScope();
  const refetch = useRefetchTask(task.id);
  const [draft, setDraft] = useState('');
  const add = useMutation({
    mutationFn: (body: string) => api!.addNote(task.id, body),
    onSuccess: () => {
      setDraft('');
      refetch();
    },
    onError: (e) => Alert.alert('Could not add note', errorMessage(e)),
  });

  return (
    <>
      <SectionTitle title="Notes" />
      <Card>
        {notes.length === 0 && <Text style={typography.caption}>No notes yet.</Text>}
        {notes.map((n, i) => (
          <View key={n.id} style={[styles.note, i < notes.length - 1 && styles.divider]}>
            <View style={styles.noteHead}>
              <Text style={[typography.caption, { fontWeight: '600', color: colors.text }]}>{n.authorName}</Text>
              <Text style={typography.caption}>{formatStamp(n.createdAt)}</Text>
            </View>
            <Text style={typography.body} selectable>
              {n.body}
            </Text>
          </View>
        ))}
        <View style={styles.noteComposer}>
          <TextInput
            style={styles.noteInput}
            placeholder="Add a note…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            onPress={() => draft.trim() && add.mutate(draft.trim())}
            disabled={!draft.trim() || add.isPending}
            style={[styles.noteSend, (!draft.trim() || add.isPending) && { opacity: 0.4 }]}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </Pressable>
        </View>
      </Card>
    </>
  );
}

// ─── Approvals ────────────────────────────────────────────

const APPROVAL_META = {
  PENDING: { label: 'Pending', fg: colors.warning, bg: colors.warningSoft, icon: 'time-outline' as const },
  APPROVED: { label: 'Approved', fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' as const },
  REJECTED: { label: 'Rejected', fg: colors.danger, bg: colors.dangerSoft, icon: 'close-circle' as const },
};

function ApprovalsTab({ task }: { task: Task }) {
  const top = task.approvals.filter((a) => !a.parentId);
  if (!top.length) {
    return <EmptyState icon="shield-checkmark-outline" title="No approval requests" message="Requests from the team will appear here." />;
  }
  return (
    <View>
      {top.map((a, i) => {
        const resubs = task.approvals
          .filter((r) => r.parentId === a.id)
          .sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt));
        return (
          <View key={a.id}>
            <ApprovalCard task={task} approval={a} number={`#${top.length - i}`} />
            {resubs.map((r, j) => (
              <View key={r.id} style={styles.resub}>
                <ApprovalCard task={task} approval={r} number={`#${top.length - i}.${j + 1} · Resubmission`} />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function ApprovalCard({ task, approval, number }: { task: Task; approval: TaskApproval; number: string }) {
  const { api } = useScope();
  const { role } = useAuth();
  const refetch = useRefetchTask(task.id);
  const [deciding, setDeciding] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [feedback, setFeedback] = useState('');
  const meta = APPROVAL_META[approval.status];
  // Admins and the customer decide; team members only view (enforced by the API too).
  const canDecide = approval.status === 'PENDING' && (role === 'CLIENT' || role === 'SUPER_ADMIN');

  const decide = useMutation({
    mutationFn: (status: 'APPROVED' | 'REJECTED') =>
      api!.decideApproval(task.id, approval.id, { status, feedback: feedback.trim() || null }),
    onSuccess: () => {
      setDeciding(null);
      setFeedback('');
      refetch();
    },
    onError: (e) => Alert.alert('Could not save decision', errorMessage(e)),
  });

  return (
    <Card>
      <View style={styles.approvalHead}>
        <Text style={styles.approvalNo}>{number}</Text>
        <Badge label={meta.label} fg={meta.fg} bg={meta.bg} icon={meta.icon} />
      </View>
      {approval.subject ? <Text style={[typography.h3, { marginBottom: 4 }]}>{approval.subject}</Text> : null}
      {approval.message ? (
        <Text style={typography.body} selectable>
          {approval.message}
        </Text>
      ) : null}
      <Text style={[typography.caption, { marginTop: spacing.sm }]}>
        Requested by {approval.requestedByName} · {formatStamp(approval.createdAt)}
      </Text>

      {approval.attachments && approval.attachments.length > 0 && (
        <View style={{ marginTop: spacing.sm }}>
          {approval.attachments.map((f) => (
            <FileRow key={f.id} file={f} compact />
          ))}
        </View>
      )}

      {approval.status !== 'PENDING' && (
        <View style={[styles.decision, { backgroundColor: meta.bg }]}>
          <Text style={[typography.caption, { color: meta.fg, fontWeight: '600' }]}>
            {meta.label} by {approval.decidedByName ?? '—'}
            {approval.decidedAt ? ` · ${formatStamp(approval.decidedAt)}` : ''}
          </Text>
          {approval.feedback ? <Text style={[typography.body, { marginTop: 4 }]}>{approval.feedback}</Text> : null}
        </View>
      )}

      {canDecide && !deciding && (
        <View style={styles.decideRow}>
          <Button title="Reject" variant="danger" icon="close" onPress={() => setDeciding('REJECTED')} style={styles.decideBtn} />
          <Button title="Approve" variant="success" icon="checkmark" onPress={() => setDeciding('APPROVED')} style={styles.decideBtn} />
        </View>
      )}
      {canDecide && deciding && (
        <View style={{ marginTop: spacing.md }}>
          <Text style={[typography.caption, { fontWeight: '600', marginBottom: 6 }]}>
            {deciding === 'APPROVED' ? 'Approve' : 'Reject'} — feedback (optional)
          </Text>
          <TextInput
            style={styles.feedback}
            placeholder={deciding === 'REJECTED' ? 'What needs to change?' : 'Any comments?'}
            placeholderTextColor={colors.textMuted}
            value={feedback}
            onChangeText={setFeedback}
            multiline
          />
          <View style={styles.decideRow}>
            <Button title="Cancel" variant="ghost" onPress={() => setDeciding(null)} style={styles.decideBtn} />
            <Button
              title={deciding === 'APPROVED' ? 'Confirm approve' : 'Confirm reject'}
              variant={deciding === 'APPROVED' ? 'success' : 'danger'}
              loading={decide.isPending}
              onPress={() => decide.mutate(deciding)}
              style={styles.decideBtn}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

// ─── Files ────────────────────────────────────────────────

function FilesTab({ task }: { task: Task }) {
  const { api } = useScope();
  const refetch = useRefetchTask(task.id);
  const [progress, setProgress] = useState<number | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return null;
      const a = res.assets[0];
      setProgress(0);
      return api!.addAttachment(task.id, { uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size }, setProgress);
    },
    onSettled: () => setProgress(null),
    onSuccess: (r) => r && refetch(),
    onError: (e) => Alert.alert('Upload failed', errorMessage(e)),
  });

  return (
    <View>
      <Button
        title={progress !== null ? `Uploading… ${progress}%` : 'Add a file'}
        icon="cloud-upload-outline"
        variant="secondary"
        loading={upload.isPending && progress === null}
        disabled={upload.isPending}
        onPress={() => upload.mutate()}
        style={{ marginBottom: spacing.md }}
      />
      <SectionTitle title="Attachments" />
      {task.attachments.length === 0 ? (
        <Text style={[typography.caption, { marginBottom: spacing.md }]}>No attachments yet.</Text>
      ) : (
        <Card>
          {task.attachments.map((f, i) => (
            <FileRow key={f.id} file={f} last={i === task.attachments.length - 1} />
          ))}
        </Card>
      )}
      {task.archive && task.archive.length > 0 && (
        <>
          <SectionTitle title="Archive" />
          <Card>
            {task.archive.map((f, i) => (
              <FileRow key={f.id} file={f} last={i === task.archive.length - 1} />
            ))}
          </Card>
        </>
      )}
    </View>
  );
}

export function FileRow({ file, compact, last }: { file: TaskAttachment; compact?: boolean; last?: boolean }) {
  const url = fileUrl(file.url);
  const img = isImage(file.contentType, file.fileName);
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => Alert.alert('Could not open file'))}
      style={({ pressed }) => [styles.file, !last && !compact && styles.divider, compact && styles.fileCompact, pressed && { opacity: 0.7 }]}
    >
      {img ? (
        <Image source={{ uri: url }} style={styles.thumb} />
      ) : (
        <View style={styles.fileIcon}>
          <Ionicons name="document-outline" size={20} color={colors.accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={typography.body} numberOfLines={1}>
          {file.fileName}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {[formatSize(file.size), file.uploadedByName, formatStamp(file.createdAt)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  badges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  chatCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primary, borderColor: colors.primary },
  chatIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  chatPreview: { color: '#B7C4D8', fontSize: 13, marginTop: 2 },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  status: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  label: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  labelText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  done: { color: colors.textMuted, textDecorationLine: 'line-through' },
  note: { paddingVertical: 10 },
  noteHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  noteComposer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  noteInput: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: colors.background,
    color: colors.text,
  },
  noteSend: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  approvalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  approvalNo: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  resub: { marginLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: spacing.sm },
  decision: { marginTop: spacing.md, padding: 12, borderRadius: radius.md },
  decideRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  decideBtn: { flex: 1, paddingVertical: 11, paddingHorizontal: spacing.sm },
  feedback: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 15,
    backgroundColor: colors.background,
    color: colors.text,
    textAlignVertical: 'top',
  },
  file: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  fileCompact: { paddingVertical: 6 },
  fileIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.border },
});
