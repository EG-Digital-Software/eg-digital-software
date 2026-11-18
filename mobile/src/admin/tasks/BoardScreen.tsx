import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import type { TaskBucket, TaskPriority, TaskProgress } from '../../api/types';
import { TaskScope } from '../../context/ScopeContext';
import { initials } from '../../lib/format';
import { fmtDate } from '../../lib/portal';
import { useBoard } from '../../lib/queries';
import { Avatar, Btn, Card, Chips, EmptyCard, ErrorBox, Loading, Muted, Pill, Screen, SearchField, Sheet, SheetOption, T } from '../../ui';
import { colors } from '../../theme';
import type { AdminTask } from '../../api/admin/tasks';
import { useBoardSeen } from './activity';
import {
  Input,
  LABEL_HEX,
  LabelChip,
  PRIORITY_META,
  PRIORITY_ORDER,
  PROGRESS_META,
  PROGRESS_ORDER,
  SelectRow,
  SmallBtn,
  confirmDestroy,
  labelHex,
  useAdminApi,
  useRefreshBoard,
} from './common';

type ProgressFilter = 'all' | TaskProgress;

interface Filters {
  assignee: string;
  priority: TaskPriority | '';
  labelId: string;
}
const NO_FILTERS: Filters = { assignee: '', priority: '', labelId: '' };

/** Same tasks with completed ones moved to the bottom (stable otherwise). */
const completedLast = <T extends { progress: TaskProgress }>(list: T[]): T[] =>
  [...list].sort((x, y) => Number(x.progress === 'COMPLETED') - Number(y.progress === 'COMPLETED'));

/** Route AdminTaskBoard { clientId, companyName? }. */
export default function AdminTaskBoardScreen() {
  const route = useRoute<any>();
  const clientId: string = route.params?.clientId;
  const companyName: string | undefined = route.params?.companyName;
  return (
    <TaskScope clientId={clientId}>
      <BoardBody clientId={clientId} companyName={companyName} back />
    </TaskScope>
  );
}

/** The board inside a Screen. Must sit inside <TaskScope clientId>. */
export function BoardBody({
  clientId,
  companyName,
  back,
  header,
}: {
  clientId: string;
  companyName?: string;
  back?: boolean;
  /** Extra content above the board (e.g. the customer switcher on the Tasks tab). */
  header?: React.ReactNode;
}) {
  const nav = useNavigation<any>();
  const api = useAdminApi(clientId);
  const board = useBoard();
  const refresh = useRefreshBoard();
  const users = useQuery({ queryKey: ['admin-tasks', clientId, 'users'], queryFn: api.assignableUsers });
  const seen = useBoardSeen(clientId);

  const [q, setQ] = useState('');
  const [progress, setProgress] = useState<ProgressFilter>('all');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [bucketMenu, setBucketMenu] = useState<TaskBucket | null>(null);
  const [taskMenu, setTaskMenu] = useState<AdminTask | null>(null);
  const [moveFor, setMoveFor] = useState<AdminTask | null>(null);
  const [prompt, setPrompt] = useState<{ title: string; value: string; action: string; onSave: (v: string) => void } | null>(null);

  const onErr = (e: unknown) => Alert.alert('Something went wrong', errorMessage(e));
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => refresh(),
    onError: onErr,
  });
  const doIt = (fn: () => Promise<unknown>) => run.mutate(fn);

  const buckets = useMemo(() => [...(board.data?.buckets ?? [])].sort((a, b) => a.order - b.order), [board.data]);
  const labels = board.data?.labels ?? [];
  const term = q.trim().toLowerCase();
  const match = (t: AdminTask) =>
    (!term || `${t.taskNumber} ${t.title} ${t.description ?? ''}`.toLowerCase().includes(term)) &&
    (progress === 'all' || t.progress === progress) &&
    (!filters.assignee || t.assignees.some((a) => a.userId === filters.assignee)) &&
    (!filters.priority || t.priority === filters.priority) &&
    (!filters.labelId || t.labels.some((l) => l.id === filters.labelId));
  const total = buckets.reduce((n, b) => n + b.tasks.length, 0);
  const done = buckets.reduce((n, b) => n + b.tasks.filter((t) => t.progress === 'COMPLETED').length, 0);
  const filterCount = Object.values(filters).filter(Boolean).length;
  const filtering = !!term || progress !== 'all' || filterCount > 0;

  const moveBucket = (b: TaskBucket, by: number) => {
    const ids = buckets.map((x) => x.id);
    const i = ids.indexOf(b.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    doIt(() => api.reorderBuckets(ids));
  };
  // Up/down follow the order shown (completed tasks last); the server index is
  // the neighbour's position in the stored order.
  const moveWithin = (t: AdminTask, by: number) => {
    const b = buckets.find((x) => x.id === t.bucketId);
    if (!b) return;
    const stored = [...b.tasks].sort((x, y) => x.order - y.order);
    const list = completedLast(stored);
    const i = list.findIndex((x) => x.id === t.id);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    doIt(() => api.moveTask(t.id, b.id, stored.findIndex((x) => x.id === list[j].id)));
  };

  return (
    <Screen title={companyName ? `Tasks · ${companyName}` : 'Tasks'} back={back} refreshing={board.isRefetching} onRefresh={() => void board.refetch()}>
      {header}
      {board.isLoading ? (
        <Loading />
      ) : board.isError || !board.data ? (
        <ErrorBox message={errorMessage(board.error)} onRetry={() => void board.refetch()} />
      ) : (
        <>
          <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkbox-outline" size={22} color={colors.green} />
            </View>
            <View style={{ flex: 1 }}>
              <T w="s" size={16}>
                Task board
              </T>
              <Muted size={13}>
                {total} {total === 1 ? 'task' : 'tasks'} · {done} completed
              </Muted>
            </View>
          </Card>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <SmallBtn
              title="New task"
              icon="add"
              tone="primary"
              disabled={!buckets.length}
              onPress={() => nav.navigate('AdminTaskNew', { clientId, bucketId: buckets[0]?.id })}
            />
            <SmallBtn
              title="Add column"
              icon="albums-outline"
              onPress={() => setPrompt({ title: 'New column', value: '', action: 'Add', onSave: (name) => doIt(() => api.createBucket(name)) })}
            />
            <SmallBtn title="Labels" icon="pricetag-outline" onPress={() => setLabelsOpen(true)} />
            <SmallBtn title="Time Sheet" icon="time-outline" onPress={() => nav.navigate('AdminTaskTimeSheet', { clientId, companyName })} />
            <SmallBtn title="Appointments" icon="calendar-outline" onPress={() => nav.navigate('AdminTaskAppointments', { clientId, companyName })} />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 14 }}>
            <SearchField value={q} onChangeText={setQ} placeholder="Search tasks" style={{ flex: 1 }} />
            <Pressable
              onPress={() => setFilterOpen(true)}
              accessibilityLabel="Filters"
              style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: filterCount ? colors.greenChip : colors.input, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="funnel-outline" size={18} color={filterCount ? colors.greenChipText : colors.muted} />
              {filterCount ? (
                <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                  <T w="b" size={10} color="#fff">
                    {filterCount}
                  </T>
                </View>
              ) : null}
            </Pressable>
          </View>
          <Chips<ProgressFilter>
            style={{ marginTop: 12 }}
            value={progress}
            onChange={setProgress}
            options={[{ value: 'all', label: 'All' }, ...PROGRESS_ORDER.map((p) => ({ value: p, label: PROGRESS_META[p].label }))]}
          />

          {buckets.length === 0 ? (
            <EmptyCard icon="albums-outline" title="No columns yet" body="Add a column to start planning tasks for this customer." style={{ marginTop: 16 }} />
          ) : (
            buckets.map((b) => {
              const tasks = completedLast([...(b.tasks as AdminTask[])].sort((x, y) => x.order - y.order)).filter(match);
              if (filtering && tasks.length === 0) return null;
              const shut = collapsed[b.id];
              return (
                <View key={b.id} style={{ marginTop: 18 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Pressable onPress={() => setCollapsed((c) => ({ ...c, [b.id]: !shut }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }} hitSlop={6}>
                      <Ionicons name={shut ? 'chevron-forward' : 'chevron-down'} size={16} color={colors.muted} />
                      <T w="s" size={16} numberOfLines={1} style={{ flexShrink: 1 }}>
                        {b.name}
                      </T>
                      <View style={{ paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: colors.soft, justifyContent: 'center' }}>
                        <T w="s" size={12} color={colors.muted}>
                          {filtering ? `${tasks.length}/${b.tasks.length}` : b.tasks.length}
                        </T>
                      </View>
                    </Pressable>
                    <Pressable onPress={() => nav.navigate('AdminTaskNew', { clientId, bucketId: b.id })} hitSlop={8} accessibilityLabel={`Add task to ${b.name}`} style={iconBtn}>
                      <Ionicons name="add" size={20} color={colors.fg} />
                    </Pressable>
                    <Pressable onPress={() => setBucketMenu(b)} hitSlop={8} accessibilityLabel={`${b.name} options`} style={iconBtn}>
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.fg} />
                    </Pressable>
                  </View>
                  {shut ? null : tasks.length === 0 ? (
                    <Pressable onPress={() => nav.navigate('AdminTaskNew', { clientId, bucketId: b.id })}>
                      <Card style={{ padding: 14, borderStyle: 'dashed', alignItems: 'center' }}>
                        <Muted size={13}>No tasks · tap to add one</Muted>
                      </Card>
                    </Pressable>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {tasks.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          updated={seen.isUpdated(t)}
                          onPress={() => nav.navigate('AdminTask', { clientId, taskId: t.id })}
                          onLongPress={() => setTaskMenu(t)}
                        />
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
          {filtering && buckets.every((b) => !(b.tasks as AdminTask[]).some(match)) ? (
            <EmptyCard icon="search" title="No tasks match" body="Try a different search or filter." style={{ marginTop: 16 }} />
          ) : null}
          <Muted size={12} style={{ textAlign: 'center', marginTop: 18 }}>
            Tip: long-press a task to move or delete it.
          </Muted>
        </>
      )}

      {/* Filters */}
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)}>
        <T w="s" size={17}>
          Filter tasks
        </T>
        <Muted size={12.5} style={{ marginTop: 12, marginBottom: 6 }}>
          Assignee
        </Muted>
        <SelectRow
          value={filters.assignee}
          onChange={(v) => setFilters((f) => ({ ...f, assignee: v }))}
          options={[{ value: '', label: 'Anyone' }, ...(users.data ?? []).map((u) => ({ value: u.userId, label: u.name }))]}
        />
        <Muted size={12.5} style={{ marginTop: 12, marginBottom: 6 }}>
          Priority
        </Muted>
        <SelectRow<TaskPriority>
          value={filters.priority}
          onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
          options={[{ value: '', label: 'Any' }, ...PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_META[p].label }))]}
        />
        <Muted size={12.5} style={{ marginTop: 12, marginBottom: 6 }}>
          Label
        </Muted>
        <SelectRow
          value={filters.labelId}
          onChange={(v) => setFilters((f) => ({ ...f, labelId: v }))}
          options={[{ value: '', label: 'Any' }, ...labels.map((l) => ({ value: l.id, label: l.name }))]}
          dot={(v) => (v ? labelHex(labels.find((l) => l.id === v)?.color ?? 'slate').solid : undefined)}
        />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Btn title="Clear" variant="ghost" style={{ flex: 1 }} onPress={() => setFilters(NO_FILTERS)} />
          <Btn title="Done" style={{ flex: 1 }} onPress={() => setFilterOpen(false)} />
        </View>
      </Sheet>

      {/* Column menu */}
      <Sheet open={!!bucketMenu} onClose={() => setBucketMenu(null)}>
        {bucketMenu ? (
          <>
            <T w="s" size={17}>
              {bucketMenu.name}
            </T>
            <SheetOption
              title="Add a task here"
              chevron
              onPress={() => {
                const b = bucketMenu;
                setBucketMenu(null);
                nav.navigate('AdminTaskNew', { clientId, bucketId: b.id });
              }}
            />
            <SheetOption
              title="Rename column"
              onPress={() => {
                const b = bucketMenu;
                setBucketMenu(null);
                after(() => setPrompt({ title: 'Rename column', value: b.name, action: 'Save', onSave: (name) => name !== b.name && doIt(() => api.updateBucket(b.id, { name })) }));
              }}
            />
            <SheetOption
              title="Move column up"
              onPress={() => {
                moveBucket(bucketMenu, -1);
                setBucketMenu(null);
              }}
            />
            <SheetOption
              title="Move column down"
              onPress={() => {
                moveBucket(bucketMenu, 1);
                setBucketMenu(null);
              }}
            />
            <SheetOption
              title="Delete column"
              onPress={() => {
                const b = bucketMenu;
                setBucketMenu(null);
                after(() =>
                  confirmDestroy('Delete column?', `Delete "${b.name}" and all ${b.tasks.length} of its tasks? This can't be undone.`, () =>
                    doIt(() => api.deleteBucket(b.id))
                  )
                );
              }}
            />
          </>
        ) : null}
      </Sheet>

      {/* Task menu */}
      <Sheet open={!!taskMenu} onClose={() => setTaskMenu(null)}>
        {taskMenu ? (
          <>
            <T mono size={12} color={colors.muted}>
              {taskMenu.taskNumber}
            </T>
            <T w="s" size={17} numberOfLines={2}>
              {taskMenu.title}
            </T>
            <SheetOption
              title="Open task"
              chevron
              onPress={() => {
                const t = taskMenu;
                setTaskMenu(null);
                nav.navigate('AdminTask', { clientId, taskId: t.id });
              }}
            />
            <SheetOption
              title={taskMenu.progress === 'COMPLETED' ? 'Mark not started' : 'Mark completed'}
              onPress={() => {
                const t = taskMenu;
                setTaskMenu(null);
                doIt(() => api.updateTask(t.id, { progress: t.progress === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED' }));
              }}
            />
            <SheetOption
              title="Move to another column"
              chevron
              onPress={() => {
                const t = taskMenu;
                setTaskMenu(null);
                after(() => setMoveFor(t));
              }}
            />
            <SheetOption
              title="Move up"
              onPress={() => {
                moveWithin(taskMenu, -1);
                setTaskMenu(null);
              }}
            />
            <SheetOption
              title="Move down"
              onPress={() => {
                moveWithin(taskMenu, 1);
                setTaskMenu(null);
              }}
            />
            <SheetOption
              title="Delete task"
              onPress={() => {
                const t = taskMenu;
                setTaskMenu(null);
                after(() =>
                  confirmDestroy('Delete task?', `Delete ${t.taskNumber} "${t.title}"? Its chat, notes and files go too.`, () => doIt(() => api.deleteTask(t.id)))
                );
              }}
            />
          </>
        ) : null}
      </Sheet>

      {/* Move to column */}
      <Sheet open={!!moveFor} onClose={() => setMoveFor(null)}>
        <T w="s" size={17}>
          Move to column
        </T>
        {buckets.map((b) => (
          <SheetOption
            key={b.id}
            title={b.name}
            right={String(b.tasks.length)}
            selected={b.id === moveFor?.bucketId}
            onPress={() => {
              const t = moveFor;
              setMoveFor(null);
              if (t && b.id !== t.bucketId) doIt(() => api.moveTask(t.id, b.id, b.tasks.length));
            }}
          />
        ))}
      </Sheet>

      <LabelsSheet
        open={labelsOpen}
        onClose={() => setLabelsOpen(false)}
        labels={labels}
        onCreate={(name, color) => doIt(() => api.createLabel(name, color))}
        onDelete={(id, name) => confirmDestroy('Delete label?', `Remove "${name}" from the board and every task?`, () => doIt(() => api.deleteLabel(id)))}
      />

      <PromptSheet prompt={prompt} onClose={() => setPrompt(null)} />
    </Screen>
  );
}

/** Run after a closing sheet has finished animating (iOS drops a modal/alert opened mid-dismiss). */
const after = (fn: () => void) => setTimeout(fn, 400);

const iconBtn = { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.soft, alignItems: 'center' as const, justifyContent: 'center' as const };

function TaskCard({ task: t, updated, onPress, onLongPress }: { task: AdminTask; updated?: boolean; onPress: () => void; onLongPress: () => void }) {
  const pm = PROGRESS_META[t.progress] ?? PROGRESS_META.NOT_STARTED;
  const pr = PRIORITY_META[t.priority] ?? PRIORITY_META.MEDIUM;
  const doneItems = t.checklist.filter((c) => c.done).length;
  const overdue = t.dueDate && t.progress !== 'COMPLETED' && new Date(t.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={({ pressed }) => [pressed && { opacity: 0.92 }]}>
      <Card style={[{ paddingHorizontal: 14, paddingVertical: 12, borderLeftWidth: 4, borderLeftColor: pr.color }, updated && { backgroundColor: '#FFF5F6' }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {updated ? <View accessibilityLabel="New activity" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red }} /> : null}
            <T mono size={12} color={colors.muted}>
              {t.taskNumber}
            </T>
          </View>
          <Pill kind={pm.kind} label={pm.label} />
        </View>
        <T
          w="s"
          size={15}
          style={[{ marginTop: 6 }, t.progress === 'COMPLETED' && { color: colors.muted }]}
          numberOfLines={3}
        >
          {t.title}
        </T>
        {t.labels.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {t.labels.map((l) => (
              <LabelChip key={l.id} name={l.name} color={l.color} />
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row' }}>
            {t.assignees.slice(0, 4).map((a, i) => (
              <Avatar key={a.userId} name={a.name} label={initials(a.name)} size={24} style={{ marginLeft: i ? -6 : 0, borderWidth: 2, borderColor: '#fff' }} />
            ))}
          </View>
          {t.assignedTeam ? (
            <Muted size={12} w="s">
              {t.assignedTeam}
            </Muted>
          ) : t.assignees.length === 0 ? (
            <Muted size={12}>Unassigned</Muted>
          ) : null}
          <View style={{ flex: 1 }} />
          {t.checklist.length ? (
            <Muted size={12}>
              <Ionicons name="checkbox-outline" size={12} /> {doneItems}/{t.checklist.length}
            </Muted>
          ) : null}
          {t.comments.length ? (
            <Muted size={12}>
              <Ionicons name="chatbubble-outline" size={12} /> {t.comments.length}
            </Muted>
          ) : null}
          {t.dueDate ? (
            <T size={12} w="s" color={overdue ? colors.redFg : colors.muted}>
              Due {fmtDate(t.dueDate)}
            </T>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

function LabelsSheet({
  open,
  onClose,
  labels,
  onCreate,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  labels: { id: string; name: string; color: string }[];
  onCreate: (name: string, color: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('sky');
  return (
    <Sheet open={open} onClose={onClose}>
      <T w="s" size={17}>
        Labels
      </T>
      <View style={{ gap: 8, marginTop: 10 }}>
        {labels.length === 0 ? <Muted size={13}>No labels yet.</Muted> : null}
        {labels.map((l) => (
          <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: labelHex(l.color).solid }} />
            <T w="m" size={14} style={{ flex: 1 }} numberOfLines={1}>
              {l.name}
            </T>
            <Pressable onPress={() => onDelete(l.id, l.name)} hitSlop={8} accessibilityLabel={`Delete ${l.name}`}>
              <Ionicons name="trash-outline" size={18} color={colors.redFg} />
            </Pressable>
          </View>
        ))}
      </View>
      <Muted size={12.5} style={{ marginTop: 16, marginBottom: 6 }}>
        New label
      </Muted>
      <Input value={name} onChangeText={setName} placeholder="Label name" maxLength={60} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
        {Object.entries(LABEL_HEX).map(([k, c]) => (
          <Pressable
            key={k}
            onPress={() => setColor(k)}
            accessibilityLabel={k}
            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.solid, borderWidth: 3, borderColor: color === k ? colors.navy : '#fff' }}
          />
        ))}
      </View>
      <Btn
        title="Add label"
        icon="add"
        style={{ marginTop: 14 }}
        disabled={!name.trim()}
        onPress={() => {
          onCreate(name.trim(), color);
          setName('');
        }}
      />
    </Sheet>
  );
}

/** A one-field text prompt in a bottom sheet (Alert.prompt is iOS-only). */
export function PromptSheet({
  prompt,
  onClose,
}: {
  prompt: { title: string; value: string; action: string; onSave: (v: string) => void; placeholder?: string } | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [key, setKey] = useState<string | null>(null);
  // Seed the box each time a new prompt opens.
  const id = prompt ? `${prompt.title}:${prompt.value}` : null;
  if (id !== key) {
    setKey(id);
    setValue(prompt?.value ?? '');
  }
  const save = () => {
    const v = value.trim();
    if (!v || !prompt) return;
    prompt.onSave(v);
    onClose();
  };
  return (
    <Sheet open={!!prompt} onClose={onClose}>
      <T w="s" size={17} style={{ marginBottom: 12 }}>
        {prompt?.title}
      </T>
      <Input value={value} onChangeText={setValue} autoFocus placeholder={prompt?.placeholder ?? 'Name'} maxLength={80} onSubmitEditing={save} returnKeyType="done" />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Btn title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
        <Btn title={prompt?.action ?? 'Save'} style={{ flex: 1 }} disabled={!value.trim()} onPress={save} />
      </View>
    </Sheet>
  );
}
