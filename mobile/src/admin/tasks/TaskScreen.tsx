import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import type { AdminBoard, AdminTask, ReportKind, TaskInput, TaskTabs } from '../../api/admin/tasks';
import type { AssignableUser, TaskPriority, TaskProgress } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { TaskScope, useScope } from '../../context/ScopeContext';
import { formatStamp, initials } from '../../lib/format';
import { useBoard, useSetTask, useTask } from '../../lib/queries';
import { Avatar, Bar, Bird, Btn, Card, ErrorBox, Loading, Muted, Screen, Sheet, T, Toggle, useRevealFocused } from '../../ui';
import { colors, fonts } from '../../theme';
import {
  DateRow,
  Input,
  Label,
  LabelChip,
  PRIORITY_META,
  PRIORITY_ORDER,
  PROGRESS_META,
  PROGRESS_ORDER,
  SelectRow,
  SmallBtn,
  TASK_TEAMS,
  Tabs,
  confirmDestroy,
  toDateInput,
  toIso,
  useAdminApi,
  useRefreshBoard,
} from './common';
import { AccessPanel, ApprovalsPanel, ArchivePanel, FilesPanel, HoursPanel } from './panels';
import { ContentPanel, ReportPanel, SocialPanel } from './specialty';
import { activityMeta, useBoardSeen, type NewSince } from './activity';

type TabKey = 'details' | 'files' | 'approvals' | 'access' | 'hours' | 'archive' | 'social' | 'content' | ReportKind;

/** Tabs an admin switches on per task (shown to the client when on). */
const EXTRA_TABS: { flag: keyof TaskTabs; tab: TabKey; label: string; hint: string }[] = [
  { flag: 'showSocialDashboard', tab: 'social', label: 'Social Media Dashboard', hint: 'Reach, engagement and posts from the Meta connection.' },
  { flag: 'showContentCalendar', tab: 'content', label: 'Content Calendar', hint: 'Plan posts, get approval and publish to Facebook and Instagram.' },
  { flag: 'showSeoDashboard', tab: 'seo', label: 'SEO Dashboard', hint: 'Search performance, keywords and site checks.' },
  { flag: 'showLocalListing', tab: 'local', label: 'Local Listing', hint: 'Google Business Profile, reviews and listings.' },
  { flag: 'showAzurePerformance', tab: 'azure', label: 'Azure Performance', hint: 'Availability, incidents, usage and cost.' },
];

// ─── Task detail: AdminTask { clientId, taskId } ──────────

export default function AdminTaskScreen() {
  const route = useRoute<any>();
  const clientId: string = route.params?.clientId;
  const taskId: string = route.params?.taskId;
  return (
    <TaskScope clientId={clientId}>
      <TaskDetail clientId={clientId} taskId={taskId} />
    </TaskScope>
  );
}

/** How often an open task refreshes (others' notes, files, approvals); chat has its own screen. */
const TASK_POLL_MS = 15_000;

function TaskDetail({ clientId, taskId }: { clientId: string; taskId: string }) {
  const q = useTask(taskId, { poll: false });
  // Slow poll on the same cache entry, so changes by others show up while it's open.
  const { api: scoped, scopeKey } = useScope();
  useQuery({ queryKey: ['task', scopeKey, taskId], queryFn: () => scoped!.getTask(taskId), enabled: !!scoped, refetchInterval: TASK_POLL_MS });
  const task = q.data as AdminTask | undefined;
  return (
    <Screen title={task?.taskNumber ?? 'Task'} back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {!task ? q.isError ? <ErrorBox message={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : <Loading /> : <Body clientId={clientId} task={task} />}
    </Screen>
  );
}

function Body({ clientId, task }: { clientId: string; task: AdminTask }) {
  const nav = useNavigation<any>();
  const api = useAdminApi(clientId);
  const board = useBoard();
  const setTask = useSetTask();
  const refresh = useRefreshBoard();
  const [tab, setTab] = useState<TabKey>('details');

  // Opening the task marks its activity as seen (and keeps it seen while open).
  // The "What's new" card is web-only; on the phone those updates arrive as push notifications.
  const seen = useBoardSeen(clientId);
  const [since, setSince] = useState<NewSince | null | undefined>(undefined);
  useEffect(() => {
    if (seen.ready && since === undefined) setSince(seen.newSince(task));
  }, [seen.ready, since, task, seen]);
  const sig = activityMeta(task).sig;
  useEffect(() => {
    if (seen.ready && since !== undefined) seen.markOpened(task);
    // Re-mark whenever the task's activity changes while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen.ready, since, sig]);

  // Quick taps (assign A then B, tick two steps) each send the whole list: show the
  // change straight away so the next tap builds on it, and only take the server's
  // copy once the last save is back (an earlier reply mustn't undo a later tap).
  const pendingSaves = useRef(0);
  const optimistic = (t: typeof task, body: TaskInput): typeof task => {
    const next = { ...t } as typeof task;
    if (body.assignees) next.assignees = body.assignees.map((a) => ({ ...a, email: a.email ?? null, avatarUrl: a.avatarUrl ?? null }));
    if (body.labelIds) {
      const all = (board.data as AdminBoard | undefined)?.labels ?? [];
      next.labels = body.labelIds.map((id) => all.find((l) => l.id === id) ?? t.labels.find((l) => l.id === id)).filter((l): l is (typeof t.labels)[number] => !!l);
    }
    if (body.checklist) next.checklist = body.checklist.map((c, i) => ({ id: t.checklist[i]?.id ?? `tmp-${i}`, text: c.text, done: !!c.done, order: i }));
    return next;
  };
  const patch = useMutation({
    mutationFn: (body: TaskInput) => api.updateTask(task.id, body),
    onMutate: (body) => {
      pendingSaves.current += 1;
      setTask(optimistic(task, body));
    },
    onSuccess: (t) => {
      if (pendingSaves.current === 1) setTask(t);
      refresh();
    },
    onError: (e) => {
      Alert.alert('Not saved', errorMessage(e));
      refresh(task.id);
    },
    onSettled: () => {
      pendingSaves.current = Math.max(0, pendingSaves.current - 1);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteTask(task.id),
    onSuccess: () => {
      refresh();
      nav.goBack();
    },
    onError: (e) => Alert.alert('Not deleted', errorMessage(e)),
  });

  // Title: edited locally, saved when the box loses focus.
  const [title, setTitle] = useState(task.title);
  const titleFocused = useRef(false);
  useEffect(() => {
    if (!titleFocused.current) setTitle(task.title);
  }, [task.title]);
  const saveTitle = () => {
    titleFocused.current = false;
    const v = title.trim();
    if (!v) return setTitle(task.title);
    if (v !== task.title) patch.mutate({ title: v });
  };

  const done = task.progress === 'COMPLETED';
  const extra = EXTRA_TABS.filter((x) => task[x.flag]);
  const pendingApprovals = task.approvals.filter((a) => a.status === 'PENDING').length;
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'files', label: `Files${task.attachments.length ? ` · ${task.attachments.length}` : ''}` },
    { key: 'approvals', label: `Approvals${pendingApprovals ? ` · ${pendingApprovals}` : ''}` },
    { key: 'access', label: 'Access Point' },
    { key: 'hours', label: 'Hours' },
    { key: 'archive', label: `Archive${task.archive?.length ? ` · ${task.archive.length}` : ''}` },
    ...extra.map((x) => ({ key: x.tab, label: x.label })),
  ];
  const last = task.comments[task.comments.length - 1];

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 4 }}>
        <Pressable
          onPress={() => patch.mutate({ progress: done ? 'NOT_STARTED' : 'COMPLETED' })}
          accessibilityLabel={done ? 'Mark not started' : 'Mark completed'}
          hitSlop={8}
          style={{
            marginTop: 6,
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 2,
            borderColor: done ? colors.green2 : colors.faint,
            backgroundColor: done ? colors.green2 : '#fff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {done ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
        </Pressable>
        <TextInput
          value={title}
          onChangeText={setTitle}
          onFocus={() => (titleFocused.current = true)}
          onBlur={saveTitle}
          multiline
          blurOnSubmit
          returnKeyType="done"
          maxLength={300}
          style={{
            flex: 1,
            fontFamily: fonts.bold,
            fontSize: 21,
            lineHeight: 27,
            color: done ? colors.muted : colors.fg,
            textDecorationLine: 'none',
            paddingVertical: 2,
          }}
        />
      </View>
      <Muted size={12} style={{ marginTop: 4, marginLeft: 38 }}>
        Created {formatStamp(task.createdAt)} · Last changed {formatStamp(task.updatedAt)}
      </Muted>

      <Pressable
        onPress={() => nav.navigate('AdminThread', { clientId, taskId: task.id })}
        style={({ pressed }) => [
          { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: colors.navy, marginTop: 14 },
          pressed && { opacity: 0.92 },
        ]}
      >
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <Bird size={26} />
        </View>
        <View style={{ flex: 1 }}>
          <T w="s" size={15} color="#fff">
            Task chat
          </T>
          <T size={12.5} color="#C9D3E1" numberOfLines={1}>
            {last ? `${last.authorName}: ${last.body || 'Attachment'}` : 'No messages yet'}
          </T>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#fff" />
      </Pressable>

      <View style={{ marginTop: 12 }}>
        <Tabs tabs={tabs} value={tabs.some((t) => t.key === tab) ? tab : 'details'} onChange={setTab} />
      </View>

      {tab === 'details' || !tabs.some((t) => t.key === tab) ? (
        <Details clientId={clientId} task={task} board={board.data as AdminBoard | undefined} patch={(b) => patch.mutate(b)} saving={patch.isPending} />
      ) : tab === 'files' ? (
        <FilesPanel clientId={clientId} task={task} />
      ) : tab === 'approvals' ? (
        <ApprovalsPanel clientId={clientId} task={task} />
      ) : tab === 'access' ? (
        <AccessPanel key={task.id} clientId={clientId} task={task} />
      ) : tab === 'hours' ? (
        <HoursPanel clientId={clientId} task={task} />
      ) : tab === 'archive' ? (
        <ArchivePanel clientId={clientId} task={task} />
      ) : tab === 'content' ? (
        <ContentPanel clientId={clientId} task={task} />
      ) : (
        <>
          <Btn
            title={`Open full ${tabs.find((t) => t.key === tab)?.label ?? 'dashboard'}`}
            icon="open-outline"
            style={{ marginTop: 16 }}
            onPress={() => nav.navigate('AdminTaskDashboard', { clientId, taskId: task.id, kind: tab })}
          />
          <Muted size={12} style={{ marginTop: 6, textAlign: 'center' }}>
            Edit figures, upload CSVs and see the client report and team insights — the same page as the web portal.
          </Muted>
          {tab === 'social' ? <SocialPanel clientId={clientId} task={task} /> : <ReportPanel clientId={clientId} task={task} kind={tab as ReportKind} />}
        </>
      )}

      {tab === 'details' ? (
        <Btn
          title="Delete task"
          icon="trash-outline"
          variant="ghost"
          loading={remove.isPending}
          style={{ marginTop: 28, borderColor: colors.redBg }}
          onPress={() => confirmDestroy('Delete task?', `Delete ${task.taskNumber} "${task.title}"? Its chat, notes, approvals and files are deleted too.`, () => remove.mutate())}
        />
      ) : null}
    </>
  );
}

function Details({
  clientId,
  task,
  board,
  patch,
  saving,
}: {
  clientId: string;
  task: AdminTask;
  board?: AdminBoard;
  patch: (b: TaskInput) => void;
  saving: boolean;
}) {
  const api = useAdminApi(clientId);
  const setTask = useSetTask();
  const refresh = useRefreshBoard();
  const users = useQuery({ queryKey: ['admin-tasks', clientId, 'users'], queryFn: api.assignableUsers });
  const [assignOpen, setAssignOpen] = useState(false);
  const buckets = [...(board?.buckets ?? [])].sort((a, b) => a.order - b.order);
  const labels = board?.labels ?? [];
  const labelIds = task.labels.map((l) => l.id);

  const move = useMutation({
    mutationFn: (bucketId: string) => api.moveTask(task.id, bucketId, buckets.find((b) => b.id === bucketId)?.tasks.length ?? 0),
    onSuccess: (t) => {
      setTask(t);
      refresh();
    },
    onError: (e) => Alert.alert('Not moved', errorMessage(e)),
  });

  const toggleAssignee = (u: AssignableUser) => {
    const has = task.assignees.some((a) => a.userId === u.userId);
    const list = has ? task.assignees.filter((a) => a.userId !== u.userId) : [...task.assignees, u];
    patch({ assignees: list.map((a) => ({ userId: a.userId, userType: a.userType, name: a.name, email: a.email || undefined, avatarUrl: a.avatarUrl })) });
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, minHeight: 18 }}>
        {saving ? (
          <>
            <ActivityIndicator size="small" color={colors.muted} />
            <Muted size={12}>Saving…</Muted>
          </>
        ) : null}
      </View>

      <Label style={{ marginTop: 4 }}>Column</Label>
      <SelectRow
        value={task.bucketId}
        onChange={(v) => v && move.mutate(v)}
        options={buckets.map((b) => ({ value: b.id, label: b.name }))}
        title="Move to column"
        disabled={move.isPending}
      />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>Status</Label>
          <SelectRow<TaskProgress>
            value={task.progress}
            onChange={(v) => v && patch({ progress: v })}
            options={PROGRESS_ORDER.map((p) => ({ value: p, label: PROGRESS_META[p].label }))}
            dot={(v) => (v ? PROGRESS_META[v].color : undefined)}
            title="Status"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Priority</Label>
          <SelectRow<TaskPriority>
            value={task.priority}
            onChange={(v) => v && patch({ priority: v })}
            options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_META[p].label }))}
            dot={(v) => (v ? PRIORITY_META[v].color : undefined)}
            title="Priority"
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>Start date</Label>
          <DateRow value={toDateInput(task.startDate)} onChange={(v) => patch({ startDate: toIso(v) || null })} placeholder="Set start" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Due date</Label>
          <DateRow
            value={toDateInput(task.dueDate)}
            onChange={(v) => patch({ dueDate: toIso(v) || null })}
            placeholder={task.progress === 'ONGOING' ? 'Ongoing' : 'Set due'}
            disabled={task.progress === 'ONGOING'}
          />
        </View>
      </View>

      <Label>Assign Team Name</Label>
      <SelectRow
        value={task.assignedTeam ?? ''}
        onChange={(v) => patch({ assignedTeam: v || null })}
        options={[{ value: '', label: 'No team' }, ...TASK_TEAMS.map((t) => ({ value: t, label: t }))]}
        title="Team the client sees"
      />
      <Muted size={12} style={{ marginTop: 4, marginLeft: 2 }}>
        The client sees this team, never the employee names.
      </Muted>

      <Label>Assigned to</Label>
      <Card style={{ padding: 12 }}>
        {task.assignees.length === 0 ? <Muted size={13}>No one assigned yet.</Muted> : null}
        {task.assignees.map((a) => (
          <View key={a.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
            <Avatar name={a.name} label={initials(a.name)} size={30} />
            <View style={{ flex: 1 }}>
              <T w="s" size={14} numberOfLines={1}>
                {a.name}
              </T>
              {a.email ? (
                <Muted size={12} numberOfLines={1}>
                  {a.email}
                </Muted>
              ) : null}
            </View>
            <Pressable
              onPress={() => confirmDestroy('Remove assignee?', `Take ${a.name} off this task?`, () => toggleAssignee(a), 'Remove')}
              hitSlop={8}
              accessibilityLabel={`Remove ${a.name}`}
            >
              <Ionicons name="close-circle" size={20} color={colors.faint} />
            </Pressable>
          </View>
        ))}
        <SmallBtn title="Assign people" icon="person-add-outline" onPress={() => setAssignOpen(true)} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
      </Card>

      <Label>Labels</Label>
      {labels.length === 0 ? (
        <Muted size={13}>No labels on this board yet. Add them from the board's Labels button.</Muted>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {labels.map((l) => {
            const on = labelIds.includes(l.id);
            return (
              <LabelChip
                key={l.id}
                name={l.name}
                color={l.color}
                selected={on}
                onPress={() => patch({ labelIds: on ? labelIds.filter((x) => x !== l.id) : [...labelIds, l.id] })}
              />
            );
          })}
        </View>
      )}

      <Label>Task number</Label>
      <Card style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
        <T mono size={13}>
          {task.taskNumber}
        </T>
      </Card>

      <Label>Tabs on this task</Label>
      <Card>
        {EXTRA_TABS.map((x, i) => (
          <View key={x.flag} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
            <View style={{ flex: 1 }}>
              <T w="s" size={14}>
                {x.label}
              </T>
              <Muted size={12}>{x.hint}</Muted>
            </View>
            <Toggle value={!!task[x.flag]} onChange={(on) => patch({ [x.flag]: on })} />
          </View>
        ))}
      </Card>

      <Checklist task={task} patch={patch} />
      <Description task={task} patch={patch} />
      <Notes clientId={clientId} task={task} />

      <AssigneeSheet
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        users={users.data ?? []}
        loading={users.isLoading}
        selected={task.assignees.map((a) => a.userId)}
        onToggle={toggleAssignee}
      />
    </>
  );
}

export function AssigneeSheet({
  open,
  onClose,
  users,
  loading,
  selected,
  onToggle,
}: {
  open: boolean;
  onClose: () => void;
  users: AssignableUser[];
  loading?: boolean;
  selected: string[];
  onToggle: (u: AssignableUser) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose}>
      <T w="s" size={17} style={{ marginBottom: 6 }}>
        Assign to
      </T>
      {loading ? <Loading /> : users.length === 0 ? <Muted size={13}>No staff found.</Muted> : null}
      {users.map((u) => {
        const on = selected.includes(u.userId);
        return (
          <Pressable
            key={u.userId}
            onPress={() => onToggle(u)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              minHeight: 54,
              paddingHorizontal: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: on ? colors.green2 : colors.line,
              backgroundColor: on ? colors.greenTint : '#fff',
              marginTop: 8,
            }}
          >
            <Avatar name={u.name} label={initials(u.name)} size={30} />
            <View style={{ flex: 1 }}>
              <T w="s" size={14} numberOfLines={1}>
                {u.name}
              </T>
              <Muted size={12} numberOfLines={1}>
                {u.userType === 'SUPER_ADMIN' ? 'Admin' : 'Team'}
                {u.email ? ` · ${u.email}` : ''}
              </Muted>
            </View>
            <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.green : colors.faint} />
          </Pressable>
        );
      })}
      <Btn title="Done" style={{ marginTop: 14 }} onPress={onClose} />
    </Sheet>
  );
}

function Checklist({ task, patch }: { task: AdminTask; patch: (b: TaskInput) => void }) {
  const [text, setText] = useState('');
  const items = [...task.checklist].sort((a, b) => a.order - b.order).map((c) => ({ text: c.text, done: c.done }));
  const doneCount = items.filter((c) => c.done).length;
  const save = (list: { text: string; done: boolean }[]) => patch({ checklist: list });
  const add = () => {
    const v = text.trim();
    if (!v) return;
    save([...items, { text: v, done: false }]);
    setText('');
  };
  return (
    <>
      <Label style={{ marginTop: 20 }}>{`Scope of Work${items.length ? ` · ${doneCount}/${items.length}` : ''}`}</Label>
      <Card style={{ padding: 12 }}>
        {items.length ? <Bar pct={(doneCount / items.length) * 100} style={{ marginBottom: 8 }} /> : null}
        {items.map((c, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}>
            <Pressable onPress={() => save(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} hitSlop={8} accessibilityLabel={c.done ? 'Mark not done' : 'Mark done'}>
              <Ionicons name={c.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={c.done ? colors.green2 : colors.faint} />
            </Pressable>
            <T size={14} style={[{ flex: 1 }, c.done && { color: colors.muted, textDecorationLine: 'line-through' }]}>
              {c.text}
            </T>
            <Pressable
              onPress={() => confirmDestroy('Remove step?', `Remove "${c.text}" from the scope of work?`, () => save(items.filter((_, j) => j !== i)), 'Remove')}
              hitSlop={8}
              accessibilityLabel="Remove step"
            >
              <Ionicons name="close" size={18} color={colors.faint} />
            </Pressable>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: items.length ? 6 : 0 }}>
          <Input value={text} onChangeText={setText} placeholder="Add a step" onSubmitEditing={add} returnKeyType="done" style={{ flex: 1 }} maxLength={500} />
          <Pressable onPress={add} accessibilityLabel="Add step" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colors.navy : '#AEB8C6', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </View>
      </Card>
    </>
  );
}

function Description({ task, patch }: { task: AdminTask; patch: (b: TaskInput) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.description ?? '');
  return (
    <>
      <Label style={{ marginTop: 20 }}>Description</Label>
      <Card style={{ padding: 14 }}>
        {editing ? (
          <>
            <Input value={text} onChangeText={setText} multiline autoFocus placeholder="Describe the task" maxLength={10000} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <SmallBtn
                title="Save"
                tone="primary"
                onPress={() => {
                  setEditing(false);
                  if (text.trim() !== (task.description ?? '').trim()) patch({ description: text.trim() || null });
                }}
              />
              <SmallBtn title="Cancel" onPress={() => setEditing(false)} />
            </View>
          </>
        ) : (
          <>
            {task.description ? (
              <T size={14} style={{ lineHeight: 20 }}>
                {task.description}
              </T>
            ) : (
              <Muted size={13}>No description.</Muted>
            )}
            {task.descriptionAuthorName ? (
              <Muted size={12} style={{ marginTop: 6 }}>
                {task.descriptionAuthorName}
                {task.descriptionUpdatedAt ? ` · ${formatStamp(task.descriptionUpdatedAt)}` : ''}
              </Muted>
            ) : null}
            <SmallBtn
              title="Edit"
              icon="create-outline"
              style={{ alignSelf: 'flex-start', marginTop: 10 }}
              onPress={() => {
                setText(task.description ?? '');
                setEditing(true);
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}

function Notes({ clientId, task }: { clientId: string; task: AdminTask }) {
  const { user } = useAuth();
  const api = useAdminApi(clientId);
  const setTask = useSetTask();
  const refresh = useRefreshBoard();
  const reveal = useRevealFocused();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const notes = task.notes.filter((n) => (n.kind ?? 'NOTE') === 'NOTE');
  const onErr = (e: unknown) => Alert.alert('Not saved', errorMessage(e));

  const add = useMutation({
    mutationFn: () => api.addNote(task.id, draft.trim()),
    onSuccess: (note) => {
      setDraft('');
      setTask({ ...task, notes: [...task.notes, note] });
      refresh(task.id);
    },
    onError: onErr,
  });
  const edit = useMutation({
    mutationFn: (v: { id: string; body: string }) => api.editNote(task.id, v.id, v.body),
    onSuccess: () => {
      setEditing(null);
      refresh(task.id);
    },
    onError: onErr,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteNote(task.id, id), onSuccess: () => refresh(task.id), onError: onErr });

  return (
    <>
      <Label style={{ marginTop: 20 }}>Notes</Label>
      <Card style={{ padding: 12 }}>
        {notes.length === 0 ? (
          <Muted size={13} style={{ marginBottom: 10 }}>
            No notes yet.
          </Muted>
        ) : (
          notes.map((n) => {
            const mine = n.authorId === user?.id;
            return (
              <View key={n.id} style={{ padding: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: mine ? colors.greenTint : colors.soft2, marginBottom: 8 }}>
                {editing?.id === n.id ? (
                  <>
                    <Input value={editing.body} onChangeText={(v) => setEditing({ id: n.id, body: v })} multiline autoFocus />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <SmallBtn title="Save" tone="primary" disabled={!editing.body.trim() || edit.isPending} onPress={() => edit.mutate({ id: n.id, body: editing.body.trim() })} />
                      <SmallBtn title="Cancel" onPress={() => setEditing(null)} />
                    </View>
                  </>
                ) : (
                  <>
                    {n.subject ? (
                      <T w="s" size={14}>
                        {n.subject}
                      </T>
                    ) : null}
                    <T size={14} style={{ lineHeight: 20 }}>
                      {n.body}
                    </T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                      <Muted size={12} style={{ flex: 1 }}>
                        {mine ? 'You' : n.authorName} · {formatStamp(n.createdAt)}
                      </Muted>
                      {mine ? (
                        <Pressable onPress={() => setEditing({ id: n.id, body: n.body })} hitSlop={8} accessibilityLabel="Edit note">
                          <Ionicons name="create-outline" size={17} color={colors.muted} />
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => confirmDestroy('Delete note?', 'This note is removed for everyone.', () => remove.mutate(n.id))} hitSlop={8} accessibilityLabel="Delete note">
                        <Ionicons name="trash-outline" size={17} color={colors.redFg} />
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            );
          })
        )}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
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
              maxHeight: 140,
              paddingHorizontal: 14,
              paddingTop: 13,
              paddingBottom: 10,
              borderRadius: 10,
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
      </Card>
    </>
  );
}

// ─── New task: AdminTaskNew { clientId, bucketId? } ───────

export function AdminTaskNewScreen() {
  const route = useRoute<any>();
  const clientId: string = route.params?.clientId;
  return (
    <TaskScope clientId={clientId}>
      <NewTask clientId={clientId} bucketId={route.params?.bucketId} />
    </TaskScope>
  );
}

function NewTask({ clientId, bucketId }: { clientId: string; bucketId?: string }) {
  const nav = useNavigation<any>();
  const api = useAdminApi(clientId);
  const board = useBoard();
  const refresh = useRefreshBoard();
  const users = useQuery({ queryKey: ['admin-tasks', clientId, 'users'], queryFn: api.assignableUsers });
  const data = board.data as AdminBoard | undefined;
  const buckets = [...(data?.buckets ?? [])].sort((a, b) => a.order - b.order);

  const [f, setF] = useState({
    bucketId: bucketId ?? '',
    title: '',
    description: '',
    progress: 'NOT_STARTED' as TaskProgress,
    priority: 'MEDIUM' as TaskPriority,
    startDate: '',
    dueDate: '',
    assignedTeam: '',
    assignees: [] as AssignableUser[],
    labelIds: [] as string[],
    tabs: {} as TaskTabs,
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [assignOpen, setAssignOpen] = useState(false);
  const column = f.bucketId || buckets[0]?.id || '';

  const create = useMutation({
    mutationFn: () =>
      api.createTask({
        bucketId: column,
        title: f.title.trim(),
        description: f.description.trim() || null,
        progress: f.progress,
        priority: f.priority,
        startDate: toIso(f.startDate) || null,
        dueDate: f.progress === 'ONGOING' ? null : toIso(f.dueDate) || null,
        assignedTeam: f.assignedTeam || null,
        assignees: f.assignees.map((a) => ({ userId: a.userId, userType: a.userType, name: a.name, email: a.email || undefined, avatarUrl: a.avatarUrl })),
        labelIds: f.labelIds,
        ...f.tabs,
      }),
    onSuccess: (t) => {
      refresh();
      nav.replace('AdminTask', { clientId, taskId: t.id });
    },
    onError: (e) => Alert.alert('Task not created', errorMessage(e)),
  });

  return (
    <Screen title="New task" back>
      {board.isLoading ? (
        <Loading />
      ) : board.isError ? (
        <ErrorBox message={errorMessage(board.error)} onRetry={() => void board.refetch()} />
      ) : buckets.length === 0 ? (
        <Muted>Add a column to the board first.</Muted>
      ) : (
        <>
          <Muted size={13}>Task number: {data?.nextTaskNumber ?? 'assigned automatically'}</Muted>
          <Label>Title</Label>
          <Input value={f.title} onChangeText={(v) => set({ title: v })} placeholder="Task title" autoFocus maxLength={300} />
          <Label>Column</Label>
          <SelectRow value={column} onChange={(v) => v && set({ bucketId: v })} options={buckets.map((b) => ({ value: b.id, label: b.name }))} title="Column" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Label>Status</Label>
              <SelectRow<TaskProgress>
                value={f.progress}
                onChange={(v) => v && set({ progress: v })}
                options={PROGRESS_ORDER.map((p) => ({ value: p, label: PROGRESS_META[p].label }))}
                dot={(v) => (v ? PROGRESS_META[v].color : undefined)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Priority</Label>
              <SelectRow<TaskPriority>
                value={f.priority}
                onChange={(v) => v && set({ priority: v })}
                options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_META[p].label }))}
                dot={(v) => (v ? PRIORITY_META[v].color : undefined)}
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Label>Start date</Label>
              <DateRow value={f.startDate} onChange={(v) => set({ startDate: v })} placeholder="Set start" />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Due date</Label>
              <DateRow value={f.progress === 'ONGOING' ? '' : f.dueDate} onChange={(v) => set({ dueDate: v })} placeholder={f.progress === 'ONGOING' ? 'Ongoing' : 'Set due'} disabled={f.progress === 'ONGOING'} />
            </View>
          </View>
          <Label>Assign Team Name</Label>
          <SelectRow value={f.assignedTeam} onChange={(v) => set({ assignedTeam: v })} options={[{ value: '', label: 'No team' }, ...TASK_TEAMS.map((t) => ({ value: t, label: t }))]} />
          <Label>Assigned to</Label>
          <Pressable onPress={() => setAssignOpen(true)}>
            <Card style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="person-add-outline" size={18} color={colors.muted} />
              <T size={14} style={{ flex: 1 }} color={f.assignees.length ? colors.fg : colors.faint} numberOfLines={2}>
                {f.assignees.length ? f.assignees.map((a) => a.name).join(', ') : 'Choose people'}
              </T>
            </Card>
          </Pressable>
          {data?.labels.length ? (
            <>
              <Label>Labels</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {data.labels.map((l) => {
                  const on = f.labelIds.includes(l.id);
                  return (
                    <LabelChip
                      key={l.id}
                      name={l.name}
                      color={l.color}
                      selected={on}
                      onPress={() => set({ labelIds: on ? f.labelIds.filter((x) => x !== l.id) : [...f.labelIds, l.id] })}
                    />
                  );
                })}
              </View>
            </>
          ) : null}
          <Label>Description</Label>
          <Input value={f.description} onChangeText={(v) => set({ description: v })} placeholder="Type a description or add notes here" multiline maxLength={10000} />
          <Label>Tabs on this task</Label>
          <Card>
            {EXTRA_TABS.map((x, i) => (
              <View key={x.flag} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                <T w="s" size={14} style={{ flex: 1 }}>
                  {x.label}
                </T>
                <Toggle value={!!f.tabs[x.flag]} onChange={(on) => set({ tabs: { ...f.tabs, [x.flag]: on } })} />
              </View>
            ))}
          </Card>
          <Btn title="Create task" icon="add" style={{ marginTop: 20 }} loading={create.isPending} disabled={!f.title.trim() || !column} onPress={() => create.mutate()} />
        </>
      )}
      <AssigneeSheet
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        users={users.data ?? []}
        loading={users.isLoading}
        selected={f.assignees.map((a) => a.userId)}
        onToggle={(u) => set({ assignees: f.assignees.some((a) => a.userId === u.userId) ? f.assignees.filter((a) => a.userId !== u.userId) : [...f.assignees, u] })}
      />
    </Screen>
  );
}
