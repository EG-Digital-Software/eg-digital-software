import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Check,
  Plus,
  Paperclip,
  Maximize2,
  FileText,
  UserPlus,
  X,
  Send,
  Download,
  Info,
  Calendar,
  MessageSquareText,
  Circle,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  RotateCcw,
  Pencil,
  KeyRound,
} from 'lucide-react';
import type {
  AssignableUser,
  Task,
  TaskApproval,
  TaskApprovalStatus,
  TaskBucket,
  TaskComment,
  TaskNote,
  TaskNoteKind,
  TaskPriority,
  TaskProgress,
} from '@/types';
import type { TaskApi, TaskInput } from '@/api/tasks';
import { apiErrorMessage } from '@/api/client';
import { useAuth } from '@/store/auth';
import { cn, formatDate, initials, mediaUrl } from '@/lib/utils';
import { downloadChatDoc, printChatPdf } from '@/lib/chatExport';
import { PRIORITY_META, PRIORITY_ORDER, PROGRESS_META, PROGRESS_ORDER } from '@/lib/tasks';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage, Tooltip } from '@/components/ui/misc';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

interface Props {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  task?: Task | null;
  createBucketId?: string;
  buckets: TaskBucket[];
  assignableUsers: AssignableUser[];
  api: TaskApi;
  scopeKey: string;
  /** Customer this board belongs to; shown in the popup header. */
  customerName?: string;
  /** Previewed number the next created task will receive. */
  nextTaskNumber?: string;
  readOnly?: boolean;
}

interface Draft {
  bucketId: string;
  title: string;
  description: string;
  progress: TaskProgress;
  priority: TaskPriority;
  startDate: string; // yyyy-mm-dd
  dueDate: string;
  assignees: AssignableUser[];
  labelIds: string[];
  checklist: { text: string; done: boolean }[];
}


const toDateInput = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const toIso = (d: string) => (d ? new Date(d + 'T00:00:00').toISOString() : '');

function draftFromTask(task: Task | null | undefined, createBucketId: string | undefined, firstBucket: string): Draft {
  if (task) {
    return {
      bucketId: task.bucketId,
      title: task.title,
      description: task.description ?? '',
      progress: task.progress,
      priority: task.priority,
      startDate: toDateInput(task.startDate),
      dueDate: toDateInput(task.dueDate),
      assignees: task.assignees.map((a) => ({
        userId: a.userId,
        userType: a.userType,
        name: a.name,
        email: a.email,
        avatarUrl: a.avatarUrl,
      })),
      labelIds: task.labels.map((l) => l.id),
      checklist: task.checklist.map((c) => ({ text: c.text, done: c.done })),
    };
  }
  return {
    bucketId: createBucketId ?? firstBucket,
    title: '',
    description: '',
    progress: 'NOT_STARTED',
    priority: 'MEDIUM',
    startDate: '',
    dueDate: '',
    assignees: [],
    labelIds: [],
    checklist: [],
  };
}

export function TaskDialog({
  open,
  onClose,
  mode,
  task,
  createBucketId,
  buckets,
  assignableUsers,
  api,
  scopeKey,
  customerName,
  nextTaskNumber,
  readOnly = false,
}: Props) {
  const qc = useQueryClient();
  const isEdit = mode === 'edit';
  // In the client portal (readOnly) the customer may still edit the task —
  // title, status, notes, checklist, assignees — but the schedule and priority
  // are locked (only start date, due date, priority and the task number are
  // read-only). Admin is never readOnly, so everything stays editable there.
  const disabled = false;
  const locked = readOnly;
  const me = useAuth((s) => s.user);
  const meId = me?.id;
  const meName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || me?.email || 'You';
  // Only admins and the customer submit/decide approvals; team members (and
  // suppliers) see the tab read-only — just the outcome. Mirrors the backend gate.
  const canApprove = me?.role === 'SUPER_ADMIN' || me?.role === 'CLIENT';
  // Deleting an approval request (at any status) is admin-only.
  const isAdmin = me?.role === 'SUPER_ADMIN';

  const [draft, setDraft] = useState<Draft>(() => draftFromTask(task, createBucketId, buckets[0]?.id ?? ''));
  const [tab, setTab] = useState<'details' | 'attachments' | 'approval' | 'access'>('details');
  const [approvalSubject, setApprovalSubject] = useState('');
  const [approvalMessage, setApprovalMessage] = useState('');
  const [approvalFiles, setApprovalFiles] = useState<File[]>([]);
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [note, setNote] = useState('');
  const [accessNote, setAccessNote] = useState('');
  const [accessSubject, setAccessSubject] = useState('');
  const [comment, setComment] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [chatFile, setChatFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(draftFromTask(task, createBucketId, buckets[0]?.id ?? ''));
      setTab('details');
      setApprovalSubject('');
      setApprovalMessage('');
      setApprovalFiles([]);
      setFeedbackDraft({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, mode, createBucketId]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks', scopeKey] });

  // Light, live view of just this task (chat + approvals + attachments) — polled
  // once a second so messages and approval activity land almost instantly for
  // both admin and client, without a full-board refetch or page reload. Keeps
  // polling in the background too, so a reply arrives even on an unfocused tab.
  const taskKey = ['task', scopeKey, task?.id] as const;
  const taskQ = useQuery({
    queryKey: taskKey,
    queryFn: () => api.getTask(task!.id),
    enabled: open && isEdit && !!task?.id,
    initialData: task ?? undefined,
    staleTime: 0,
    refetchInterval: open && isEdit ? 2000 : false,
    refetchIntervalInBackground: false,
  });
  const liveTask = taskQ.data ?? task;
  const invalidateTask = () => qc.invalidateQueries({ queryKey: taskKey });

  // Keep the chat pinned to the newest message — on open, on send, and when a
  // poll pulls in a reply from the other party.
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const commentCount = liveTask?.comments.length ?? 0;
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el && showChat) el.scrollTop = el.scrollHeight;
  }, [commentCount, showChat, open]);

  const patch = useMutation({
    mutationFn: (body: TaskInput) => api.updateTask(task!.id, body),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const create = useMutation({
    mutationFn: (body: TaskInput) => api.createTask(body),
    onSuccess: () => { invalidate(); toast.success('Task created'); onClose(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const addComment = useMutation({
    mutationFn: (v: { body: string; file?: File }) => api.addComment(task!.id, v.body, v.file),
    // Show the message instantly (and clear the composer) instead of waiting for
    // the round-trip.
    onMutate: async (v) => {
      setComment('');
      setChatFile(null);
      if (!task) return { prev: undefined };
      await qc.cancelQueries({ queryKey: taskKey });
      const prev = qc.getQueryData<Task>(taskKey);
      const now = new Date().toISOString();
      const optimistic: TaskComment = {
        id: `temp-${Date.now()}`,
        taskId: task.id,
        authorId: meId ?? '',
        authorType: me?.role ?? 'SUPER_ADMIN',
        authorName: meName,
        body: v.body,
        createdAt: now,
        attachments: v.file
          ? [{ id: `tmp-${Date.now()}`, taskId: task.id, fileName: v.file.name, url: '', size: v.file.size, createdAt: now }]
          : [],
      };
      const base = prev ?? task;
      qc.setQueryData<Task>(taskKey, { ...base, comments: [...base.comments, optimistic] });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(taskKey, ctx.prev);
      toast.error(apiErrorMessage(e));
    },
    onSettled: () => { invalidateTask(); invalidate(); },
  });
  const removeComment = useMutation({ mutationFn: (id: string) => api.deleteComment(task!.id, id), onSuccess: () => { invalidateTask(); invalidate(); } });
  const addNoteMut = useMutation({
    mutationFn: (v: { body: string; kind: TaskNoteKind; subject?: string | null }) => api.addNote(task!.id, v.body, v.kind, v.subject),
    // Show the note instantly (and clear the right composer) before the round-trip.
    onMutate: async (v) => {
      if (v.kind === 'ACCESS_POINT') { setAccessNote(''); setAccessSubject(''); } else setNote('');
      if (!task) return { prev: undefined };
      await qc.cancelQueries({ queryKey: taskKey });
      const prev = qc.getQueryData<Task>(taskKey);
      const now = new Date().toISOString();
      const optimistic: TaskNote = {
        id: `temp-${Date.now()}`,
        taskId: task.id,
        kind: v.kind,
        authorId: meId ?? '',
        authorType: me?.role ?? 'SUPER_ADMIN',
        authorName: meName,
        subject: v.subject ?? null,
        body: v.body,
        createdAt: now,
      };
      const base = prev ?? task;
      qc.setQueryData<Task>(taskKey, { ...base, notes: [...(base.notes ?? []), optimistic] });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(taskKey, ctx.prev);
      toast.error(apiErrorMessage(e));
    },
    onSettled: () => { invalidateTask(); invalidate(); },
  });
  function sendNote(kind: TaskNoteKind) {
    const body = (kind === 'ACCESS_POINT' ? accessNote : note).trim();
    if (!task || addNoteMut.isPending || !body) return;
    addNoteMut.mutate({ body, kind, subject: kind === 'ACCESS_POINT' ? (accessSubject.trim() || null) : undefined });
  }
  const editNoteMut = useMutation({
    mutationFn: (v: { id: string; body: string; subject?: string | null }) => api.editNote(task!.id, v.id, v.body, v.subject),
    // Reflect the edit instantly; reconcile with the server after.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: taskKey });
      const prev = qc.getQueryData<Task>(taskKey);
      if (prev) {
        qc.setQueryData<Task>(taskKey, {
          ...prev,
          notes: prev.notes.map((n) => (n.id === v.id ? { ...n, body: v.body, ...(v.subject !== undefined ? { subject: v.subject } : {}) } : n)),
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(taskKey, ctx.prev); toast.error(apiErrorMessage(e)); },
    onSettled: () => { invalidateTask(); invalidate(); },
  });
  const deleteNoteMut = useMutation({
    mutationFn: (id: string) => api.deleteNote(task!.id, id),
    // Drop the row instantly; reconcile with the server after.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: taskKey });
      const prev = qc.getQueryData<Task>(taskKey);
      if (prev) {
        qc.setQueryData<Task>(taskKey, { ...prev, notes: prev.notes.filter((n) => n.id !== id) });
      }
      return { prev };
    },
    onError: (e, _id, ctx) => { if (ctx?.prev) qc.setQueryData(taskKey, ctx.prev); toast.error(apiErrorMessage(e)); },
    onSettled: () => { invalidateTask(); invalidate(); },
  });
  const uploadFile = useMutation({
    mutationFn: (file: File) => api.addAttachment(task!.id, file),
    onSuccess: () => { invalidateTask(); invalidate(); toast.success('Attachment added'); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const removeFile = useMutation({ mutationFn: (id: string) => api.deleteAttachment(task!.id, id), onSuccess: () => { invalidateTask(); invalidate(); } });
  const submitApproval = useMutation({
    mutationFn: (v: { subject: string; message: string; files?: File[] }) => api.submitApproval(task!.id, v),
    onSuccess: () => { invalidateTask(); invalidate(); setApprovalSubject(''); setApprovalMessage(''); setApprovalFiles([]); toast.success('Approval requested'); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const decideApproval = useMutation({
    mutationFn: (v: { id: string; status: 'APPROVED' | 'REJECTED'; feedback?: string | null }) =>
      api.decideApproval(task!.id, v.id, { status: v.status, feedback: v.feedback }),
    // Reflect the decision instantly; reconcile with the server afterwards.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: taskKey });
      const prev = qc.getQueryData<Task>(taskKey);
      if (prev) {
        const now = new Date().toISOString();
        qc.setQueryData<Task>(taskKey, {
          ...prev,
          approvals: prev.approvals.map((a) =>
            a.id === v.id
              ? { ...a, status: v.status, feedback: v.feedback ?? a.feedback ?? null, decidedByName: meName, decidedAt: now }
              : a
          ),
        });
      }
      setFeedbackDraft((f) => { const n = { ...f }; delete n[v.id]; return n; });
      return { prev };
    },
    onError: (e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(taskKey, ctx.prev); toast.error(apiErrorMessage(e)); },
    onSuccess: (_d, v) => toast.success(v.status === 'APPROVED' ? 'Approved' : 'Rejected'),
    onSettled: () => { invalidateTask(); invalidate(); },
  });
  const removeApproval = useMutation({
    mutationFn: (id: string) => api.deleteApproval(task!.id, id),
    // Drop the row instantly; reconcile with the server in the background.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: taskKey });
      const prev = qc.getQueryData<Task>(taskKey);
      if (prev) {
        qc.setQueryData<Task>(taskKey, { ...prev, approvals: prev.approvals.filter((a) => a.id !== id) });
      }
      return { prev };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(taskKey, ctx.prev);
      toast.error(apiErrorMessage(e));
    },
    onSettled: () => { invalidateTask(); invalidate(); },
  });
  const reopenApproval = useMutation({
    mutationFn: (id: string) => api.reopenApproval(task!.id, id),
    // Flip the row back to pending instantly; reconcile with the server after.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: taskKey });
      const prev = qc.getQueryData<Task>(taskKey);
      if (prev) {
        qc.setQueryData<Task>(taskKey, {
          ...prev,
          approvals: prev.approvals.map((a) =>
            a.id === id
              ? { ...a, status: 'PENDING', decidedByName: null, decidedByType: null, decidedAt: null }
              : a
          ),
        });
      }
      return { prev };
    },
    onError: (e, _id, ctx) => { if (ctx?.prev) qc.setQueryData(taskKey, ctx.prev); toast.error(apiErrorMessage(e)); },
    onSuccess: () => toast.success('Re-opened for a new decision'),
    onSettled: () => { invalidateTask(); invalidate(); },
  });

  function update(partial: Partial<Draft>, persist?: TaskInput) {
    setDraft((d) => ({ ...d, ...partial }));
    if (isEdit && persist) patch.mutate(persist);
  }
  function toggleAssignee(u: AssignableUser) {
    const has = draft.assignees.some((a) => a.userId === u.userId);
    const assignees = has ? draft.assignees.filter((a) => a.userId !== u.userId) : [...draft.assignees, u];
    update({ assignees }, { assignees });
  }
  function setChecklist(checklist: { text: string; done: boolean }[]) {
    update({ checklist }, { checklist });
  }
  function addChecklistItem() {
    const text = newChecklistItem.trim();
    if (!text) return;
    setChecklist([...draft.checklist, { text, done: false }]);
    setNewChecklistItem('');
  }
  function toggleComplete() {
    const next: TaskProgress = draft.progress === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED';
    update({ progress: next }, { progress: next });
  }
  function sendChat() {
    const body = comment.trim();
    if (!task || addComment.isPending || (!body && !chatFile)) return;
    addComment.mutate({ body, file: chatFile ?? undefined });
  }
  function submitCreate() {
    if (!draft.title.trim()) return toast.error('Title is required');
    create.mutate({
      bucketId: draft.bucketId,
      title: draft.title.trim(),
      description: draft.description || null,
      progress: draft.progress,
      priority: draft.priority,
      startDate: toIso(draft.startDate) || null,
      dueDate: toIso(draft.dueDate) || null,
      assignees: draft.assignees,
      labelIds: draft.labelIds,
      checklist: draft.checklist,
    });
  }

  const done = draft.progress === 'COMPLETED';
  const checklistDone = draft.checklist.filter((c) => c.done).length;
  const chatVisible = showChat;
  // The same TaskNote thread backs two lists, split by kind.
  const noteEntries = (liveTask?.notes ?? []).filter((n) => (n.kind ?? 'NOTE') === 'NOTE');
  const accessEntries = (liveTask?.notes ?? []).filter((n) => n.kind === 'ACCESS_POINT');

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('flex !max-w-none !max-h-[95vh] !h-[92vh] flex-col gap-0 overflow-hidden p-0', chatVisible ? '!w-[min(1680px,96vw)]' : '!w-[min(1200px,94vw)]')}>
        <DialogTitle className="sr-only">Task</DialogTitle>

        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-semibold text-primary">
            {customerName ? `Tasks - ${customerName}` : 'Tasks'}
          </span>
          <button
            type="button"
            onClick={() => setShowChat((s) => !s)}
            className={cn(
              'mr-8 inline-flex h-8 w-8 items-center justify-center rounded-md transition',
              showChat ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'
            )}
            title="Toggle task chat"
          >
            <MessageSquareText className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* ── Left: details ─────────────────────────── */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
            {/* Title */}
            <div className="flex items-start gap-3">
              <button
                type="button"
                disabled={disabled || !isEdit}
                onClick={toggleComplete}
                className={cn(
                  'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition',
                  done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40 hover:border-emerald-500'
                )}
                title="Toggle complete"
              >
                {done && <Check className="h-3.5 w-3.5" />}
              </button>
              <Input
                value={draft.title}
                disabled={disabled}
                placeholder="Task title"
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                onBlur={() => isEdit && task && draft.title.trim() && draft.title !== task.title && patch.mutate({ title: draft.title.trim() })}
                className={cn('h-auto border-0 px-0 py-0 text-xl font-semibold shadow-none focus-visible:ring-0', done && 'text-muted-foreground line-through')}
              />
            </div>

            {/* Meta */}
            {isEdit && task && (
              <p className="mt-1.5 flex items-center gap-1.5 pl-9 text-xs text-muted-foreground">
                Created {formatDate(task.createdAt)} · Last changed {formatDate(task.updatedAt)}
                <Info className="h-3.5 w-3.5" />
              </p>
            )}

            {/* Assignees */}
            <div className="mt-3 flex items-center gap-2">
              <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-2">
                  {draft.assignees.map((a) => (
                    <span key={a.userId} className="group relative">
                      <Avatar className="h-8 w-8 border-2 border-card">
                        {a.avatarUrl && <AvatarImage src={a.avatarUrl} alt={a.name} />}
                        <AvatarFallback className="text-[10px]">{initials(a.name)}</AvatarFallback>
                      </Avatar>
                      {!locked && (
                        <button type="button" onClick={() => toggleAssignee(a)} className="absolute -right-1 -top-1 hidden rounded-full bg-card shadow group-hover:block">
                          <X className="h-3 w-3 text-muted-foreground hover:text-rose-500" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {!locked && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary">
                        <Plus className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
                      <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {assignableUsers.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No staff found</div>}
                      {assignableUsers.map((u) => {
                        const checked = draft.assignees.some((a) => a.userId === u.userId);
                        return (
                          <DropdownMenuItem key={u.userId} onSelect={(e) => { e.preventDefault(); toggleAssignee(u); }}>
                            <Avatar className="h-6 w-6">
                              {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.name} />}
                              <AvatarFallback className="text-[9px]">{initials(u.name)}</AvatarFallback>
                            </Avatar>
                            <span className="flex-1 truncate">{u.name}</span>
                            {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-5 flex items-center gap-2">
              <TabPill active={tab === 'details'} onClick={() => setTab('details')} icon={<Circle className="h-4 w-4" />}>Task details</TabPill>
              {isEdit && (
                <TabPill active={tab === 'attachments'} onClick={() => setTab('attachments')} icon={<Paperclip className="h-4 w-4" />}>
                  Attachments{liveTask && liveTask.attachments.length > 0 ? ` (${liveTask.attachments.length})` : ''}
                </TabPill>
              )}
              {isEdit && (
                <TabPill active={tab === 'approval'} onClick={() => setTab('approval')} icon={<ShieldCheck className="h-4 w-4" />}>
                  Approval{liveTask && liveTask.approvals.length > 0 ? ` (${liveTask.approvals.length})` : ''}
                </TabPill>
              )}
              {isEdit && (
                <TabPill active={tab === 'access'} onClick={() => setTab('access')} icon={<KeyRound className="h-4 w-4" />}>
                  Access Point{accessEntries.length > 0 ? ` (${accessEntries.length})` : ''}
                </TabPill>
              )}
            </div>

            {tab === 'details' ? (
              <div className="mt-5 space-y-5">
                {/* Field grid */}
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Field label="Status">
                    {(() => {
                      const StatusIcon = PROGRESS_META[draft.progress].icon;
                      return (
                        <IconSelect
                          leading={<StatusIcon className={cn('h-4 w-4', PROGRESS_META[draft.progress].text)} />}
                          value={draft.progress}
                          disabled={disabled}
                          onChange={(v) => update({ progress: v as TaskProgress }, { progress: v as TaskProgress })}
                        >
                          {PROGRESS_ORDER.map((p) => <option key={p} value={p}>{PROGRESS_META[p].label}</option>)}
                        </IconSelect>
                      );
                    })()}
                  </Field>
                  <Field label="Priority">
                    {(() => {
                      const PriorityIcon = PRIORITY_META[draft.priority].icon;
                      return (
                        <IconSelect
                          leading={<PriorityIcon className={cn('h-4 w-4', PRIORITY_META[draft.priority].text)} />}
                          value={draft.priority}
                          disabled={locked}
                          onChange={(v) => update({ priority: v as TaskPriority }, { priority: v as TaskPriority })}
                        >
                          {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                        </IconSelect>
                      );
                    })()}
                  </Field>

                  <Field label="Start date">
                    <DateField value={draft.startDate} placeholder="Set start date" disabled={locked}
                      onChange={(v) => update({ startDate: v }, { startDate: toIso(v) || null })} />
                  </Field>
                  <Field label="Due date">
                    {/* An ongoing task has no fixed end — the due date is disabled
                        while the status is Ongoing. */}
                    <DateField value={draft.dueDate} placeholder={draft.progress === 'ONGOING' ? 'Not applicable (ongoing)' : 'Set due date'} disabled={locked || draft.progress === 'ONGOING'}
                      onChange={(v) => update({ dueDate: v }, { dueDate: toIso(v) || null })} />
                  </Field>

                  <Field label="Task number" hint="Unique ID assigned automatically to every task (TSK-EGD-5000, 5001, …). It can't be edited. For a new task this shows the number it will get on creation.">
                    <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-secondary/40 px-3 text-sm font-semibold tabular-nums text-foreground">
                      {task?.taskNumber ?? nextTaskNumber ?? 'Auto-generated'}
                    </div>
                  </Field>
                </div>

                {/* Checklist */}
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Scope of Work</h4>
                  {draft.checklist.length > 0 && (
                    <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(checklistDone / draft.checklist.length) * 100}%` }} />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {draft.checklist.map((item, i) => (
                      <div key={i} className="group flex items-center gap-2.5">
                        <button type="button" disabled={disabled}
                          onClick={() => setChecklist(draft.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c)))}
                          className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40')}>
                          {item.done && <Check className="h-3 w-3" />}
                        </button>
                        <span className={cn('flex-1 text-sm', item.done && 'text-muted-foreground line-through')}>{item.text}</span>
                        {!disabled && (
                          <button type="button" onClick={() => setChecklist(draft.checklist.filter((_, j) => j !== i))} className="opacity-0 transition group-hover:opacity-100">
                            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-rose-500" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {!disabled && (
                    <div className="mt-2 flex items-center gap-2.5">
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                      <Input value={newChecklistItem} placeholder="Add steps to complete this task. Mark them done as you go."
                        className="h-8 border-0 px-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        onChange={(e) => setNewChecklistItem(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())} />
                      {newChecklistItem.trim() && <Button type="button" size="sm" variant="secondary" onClick={addChecklistItem}><Plus className="h-4 w-4" /></Button>}
                    </div>
                  )}
                </div>

                {/* Notes — a chat-style thread; each note shows who wrote it. */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Notes</h4>
                    {isEdit && (
                      <button
                        type="button"
                        onClick={() => setShowNotes(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <Maximize2 className="h-3.5 w-3.5" /> View full notes
                      </button>
                    )}
                  </div>
                  {isEdit ? (
                    <NotesThread
                      notes={noteEntries}
                      originalNote={liveTask?.description ?? task?.description ?? ''}
                      originalAuthor={liveTask?.descriptionAuthorName ?? undefined}
                      meId={meId}
                      value={note}
                      onChange={setNote}
                      onSend={() => sendNote('NOTE')}
                      sending={addNoteMut.isPending}
                      canAdd={!!task && !addNoteMut.isPending}
                      onEdit={(id, body) => editNoteMut.mutate({ id, body })}
                      scrollClass="max-h-56"
                    />
                  ) : (
                    /* Before the task exists, capture initial notes on the task itself. */
                    <Textarea
                      value={draft.description}
                      placeholder="Type a description or add notes here"
                      className="min-h-[120px] border-0 bg-secondary/40 px-3 focus-visible:ring-1"
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    />
                  )}
                </div>
              </div>
            ) : tab === 'attachments' ? (
              /* Attachments tab */
              <div className="mt-5 space-y-2">
                {liveTask?.attachments.map((f) => (
                  <div key={f.id} className="group flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{f.fileName}</span>
                    <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                    <a href={mediaUrl(f.url)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><Download className="h-4 w-4" /></a>
                    <button type="button" onClick={() => removeFile.mutate(f.id)} className="opacity-0 transition group-hover:opacity-100"><X className="h-4 w-4 text-muted-foreground hover:text-rose-500" /></button>
                  </div>
                ))}
                {liveTask && liveTask.attachments.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No attachments yet.</p>}
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile.mutate(f); e.target.value = ''; }} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadFile.isPending}>
                  <Paperclip className="mr-1.5 h-4 w-4" /> {uploadFile.isPending ? 'Uploading…' : 'Add attachment'}
                </Button>
              </div>
            ) : tab === 'approval' ? (
              /* Approval tab */
              <ApprovalPanel
                approvals={liveTask?.approvals ?? []}
                canApprove={canApprove}
                isAdmin={isAdmin}
                subject={approvalSubject}
                message={approvalMessage}
                files={approvalFiles}
                onSubjectChange={setApprovalSubject}
                onMessageChange={setApprovalMessage}
                onFilesAdd={(fs) => setApprovalFiles((prev) => [...prev, ...fs])}
                onFileRemove={(i) => setApprovalFiles((prev) => prev.filter((_, j) => j !== i))}
                onSubmit={() => {
                  const s = approvalSubject.trim();
                  const m = approvalMessage.trim();
                  // A subject, a message, or at least one file is enough to send.
                  if ((!s && !m && approvalFiles.length === 0) || submitApproval.isPending) return;
                  submitApproval.mutate({ subject: s, message: m, files: approvalFiles });
                }}
                submitting={submitApproval.isPending}
                feedbackDraft={feedbackDraft}
                onFeedbackChange={(id, v) => setFeedbackDraft((f) => ({ ...f, [id]: v }))}
                onDecide={(id, status) => decideApproval.mutate({ id, status, feedback: feedbackDraft[id]?.trim() || null })}
                deciding={decideApproval.isPending ? decideApproval.variables?.id : undefined}
                onRemove={(id) => removeApproval.mutate(id)}
                onReopen={(id) => reopenApproval.mutate(id)}
              />
            ) : (
              /* Access Point tab — a register: Written by (auto) · Subject · Notes.
                 You can edit your own rows any time. */
              <AccessPointPanel
                entries={accessEntries}
                meId={meId}
                isAdmin={isAdmin}
                subject={accessSubject}
                body={accessNote}
                onSubjectChange={setAccessSubject}
                onBodyChange={setAccessNote}
                onAdd={() => sendNote('ACCESS_POINT')}
                adding={addNoteMut.isPending}
                canAdd={!!task && !addNoteMut.isPending}
                onEdit={(id, body, subject) => editNoteMut.mutate({ id, body, subject })}
                onDelete={(id) => deleteNoteMut.mutate(id)}
              />
            )}

            {/* Create footer */}
            {!isEdit && (
              <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="button" onClick={submitCreate} disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create task'}</Button>
              </div>
            )}
          </div>

          {/* ── Right: task chat ──────────────────────── */}
          {chatVisible && (
            <div className="flex max-h-[45vh] min-h-0 w-full shrink-0 flex-col border-t border-border bg-secondary/20 md:max-h-none md:w-[420px] md:border-l md:border-t-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold">Task Chat</h3>
                {/* Download the chat — admin-only. Word (.doc) or PDF via print. */}
                {isAdmin && task && liveTask && liveTask.comments.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title="Download chat"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-primary"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuLabel>Download chat</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          printChatPdf(liveTask, customerName) ||
                            toast.error('Allow pop-ups to download as PDF');
                        }}
                      >
                        <FileText className="h-4 w-4" /> PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => downloadChatDoc(liveTask, customerName)}>
                        <FileText className="h-4 w-4" /> Word (.doc)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
                {!task && <p className="pt-8 text-center text-xs text-muted-foreground">Create the task first to start the conversation.</p>}
                {task && liveTask && liveTask.comments.length === 0 && <p className="pt-8 text-center text-xs text-muted-foreground">No messages yet. Start the conversation.</p>}
                {liveTask?.comments.map((c) => {
                  const mine = !!meId && c.authorId === meId;
                  return (
                    <div key={c.id} className={cn('group flex gap-2', mine && 'flex-row-reverse')}>
                      {!mine && (
                        <Avatar className="mt-4 h-7 w-7 shrink-0"><AvatarFallback className="text-[10px]">{initials(c.authorName)}</AvatarFallback></Avatar>
                      )}
                      <div className={cn('min-w-0 max-w-[85%]', mine && 'text-right')}>
                        <div className={cn('mb-1 flex items-center gap-2 text-[11px]', mine ? 'justify-end' : '')}>
                          {!mine && <span className="font-semibold text-primary">{c.authorName}</span>}
                          <span className="text-muted-foreground">{formatDate(c.createdAt, 'dd MMM, h:mm a')}</span>
                        </div>
                        {c.body && (
                          <div className={cn('inline-block rounded-2xl px-3 py-2 text-left text-sm', mine ? 'bg-primary/10' : 'bg-card shadow-sm')}>
                            <p className="whitespace-pre-wrap break-words">{c.body}</p>
                          </div>
                        )}
                        {c.attachments?.map((f) => (
                          <a
                            key={f.id}
                            href={mediaUrl(f.url)}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              'mt-1 flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-xs shadow-sm transition hover:border-primary/40',
                              mine && 'flex-row-reverse text-right'
                            )}
                          >
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate font-medium">{f.fileName}</span>
                            <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          </a>
                        ))}
                        {/* Deleting a chat message is admin-only — clients and
                            employees cannot delete any message, not even their own. */}
                        {isAdmin && (
                          <button type="button" onClick={() => removeComment.mutate(c.id)} className="ml-2 text-[11px] text-muted-foreground opacity-0 transition hover:text-rose-500 group-hover:opacity-100">Delete</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border p-3">
                {chatFile && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{chatFile.name}</span>
                    <button type="button" onClick={() => setChatFile(null)} className="shrink-0 text-muted-foreground hover:text-rose-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5">
                  <input
                    ref={chatFileRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setChatFile(f); e.target.value = ''; }}
                  />
                  <button
                    type="button"
                    onClick={() => chatFileRef.current?.click()}
                    disabled={!task || addComment.isPending}
                    title="Attach a file"
                    className="mb-0.5 text-muted-foreground transition hover:text-primary disabled:text-muted-foreground/40"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <Textarea
                    value={comment}
                    placeholder={task ? 'Type a message' : 'Available after the task is created'}
                    rows={1}
                    disabled={!task}
                    className="min-h-[28px] w-full flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed"
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  />
                  <button type="button" onClick={sendChat} disabled={!task || addComment.isPending || (!comment.trim() && !chatFile)} className="mb-0.5 text-primary disabled:text-muted-foreground/40">
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Full notes reader */}
    <Dialog open={showNotes} onOpenChange={setShowNotes}>
      <DialogContent className="flex max-h-[85vh] flex-col !w-[min(720px,94vw)] !max-w-none gap-0 overflow-hidden p-0">
        <div className="flex shrink-0 items-start gap-2 border-b border-border px-5 py-3">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <DialogTitle className="text-sm font-semibold">
              {draft.title.trim() ? `Notes — ${draft.title.trim()}` : 'Notes'}
            </DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {(liveTask?.notes?.length ?? 0)} note{(liveTask?.notes?.length ?? 0) === 1 ? '' : 's'}
              {!disabled && <span className="text-muted-foreground/70"> · Writing as {meName}</span>}
            </p>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          <NotesThread
            notes={noteEntries}
            originalNote={liveTask?.description ?? task?.description ?? ''}
            originalAuthor={liveTask?.descriptionAuthorName ?? undefined}
            meId={meId}
            value={note}
            onChange={setNote}
            onSend={() => sendNote('NOTE')}
            sending={addNoteMut.isPending}
            canAdd={!!task && !addNoteMut.isPending}
            onEdit={(id, body) => editNoteMut.mutate({ id, body })}
            scrollClass="flex-1"
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

/**
 * Chat-style notes thread. Each note is a card showing its author and time, so
 * everyone can see who wrote which note. Any pre-existing single-field note
 * (the old `description`) is preserved as a pinned "Original" card at the top.
 */
function NotesThread({
  notes,
  originalNote,
  originalAuthor,
  meId,
  value,
  onChange,
  onSend,
  sending,
  canAdd,
  onEdit,
  scrollClass,
}: {
  notes: TaskNote[];
  originalNote?: string;
  originalAuthor?: string;
  meId?: string;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  canAdd: boolean;
  onEdit: (id: string, body: string) => void;
  scrollClass?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasOriginal = !!originalNote?.trim();
  // Which of my notes is being edited, and its working text.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  useEffect(() => {
    const el = scrollRef.current;
    if (el && !editingId) el.scrollTop = el.scrollHeight;
  }, [notes.length, editingId]);

  function startEdit(id: string, body: string) {
    setEditingId(id);
    setEditText(body);
  }
  function saveEdit(id: string) {
    const body = editText.trim();
    if (body) onEdit(id, body);
    setEditingId(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div ref={scrollRef} className={cn('space-y-3 overflow-y-auto rounded-lg border border-border bg-secondary/20 p-3', scrollClass)}>
        {!hasOriginal && notes.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">No notes yet. Add the first note below.</p>
        )}
        {hasOriginal && (
          <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-[11px]">
              <span className="font-semibold text-primary">{originalAuthor || 'Original note'}</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">Original</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{originalNote}</p>
          </div>
        )}
        {notes.map((n) => {
          const mine = !!meId && n.authorId === meId;
          const isEditing = editingId === n.id;
          return (
            <div key={n.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
              <div className="mb-1 flex items-center gap-2 text-[11px]">
                <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{initials(n.authorName)}</AvatarFallback></Avatar>
                <span className="font-semibold text-primary">{n.authorName}{mine ? ' (You)' : ''}</span>
                <span className="text-muted-foreground">{formatDate(n.createdAt, 'dd MMM yyyy, h:mm a')}</span>
                {/* Only the author can edit their own note — any time. */}
                {mine && !isEditing && !n.id.startsWith('temp-') && (
                  <button type="button" onClick={() => startEdit(n.id, n.body)} className="ml-auto text-muted-foreground transition hover:text-primary" title="Edit your note">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={editText}
                    autoFocus
                    className="min-h-[64px] w-full resize-none bg-secondary/40 px-2.5 py-1.5 text-sm"
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(n.id); }
                      if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                    }}
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => saveEdit(n.id)} disabled={!editText.trim()}>Save</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
              )}
            </div>
          );
        })}
      </div>
      {/* Composer — add a note (Enter to send, Shift+Enter for a new line). */}
      <div className="flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Textarea
          value={value}
          placeholder={canAdd ? 'Write a note…' : 'Available after the task is created'}
          rows={1}
          disabled={!canAdd}
          className="min-h-[28px] w-full flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        />
        <button type="button" onClick={onSend} disabled={!canAdd || !value.trim() || sending} className="mb-0.5 text-primary disabled:text-muted-foreground/40" title="Add note">
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Access Point tab — a small register with three columns: Written by (the
 * author, filled automatically), Subject, and Notes. Each author can edit their
 * own rows at any time; other rows are read-only to them.
 */
function AccessPointPanel({
  entries,
  meId,
  isAdmin,
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  onAdd,
  adding,
  canAdd,
  onEdit,
  onDelete,
}: {
  entries: TaskNote[];
  meId?: string;
  isAdmin: boolean;
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onAdd: () => void;
  adding: boolean;
  canAdd: boolean;
  onEdit: (id: string, body: string, subject: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  function startEdit(n: TaskNote) {
    setEditingId(n.id);
    setEditSubject(n.subject ?? '');
    setEditBody(n.body);
  }
  function saveEdit(id: string) {
    const b = editBody.trim();
    if (b) onEdit(id, b, editSubject.trim() || null);
    setEditingId(null);
  }

  return (
    <div className="mt-5 space-y-5">
      {/* Composer — Subject + Notes; the author is filled in automatically. */}
      <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
        <h4 className="text-sm font-semibold">Add access point</h4>
        <Input value={subject} placeholder="Subject" maxLength={200} disabled={!canAdd} onChange={(e) => onSubjectChange(e.target.value)} />
        <Textarea
          value={body}
          placeholder={canAdd ? 'Notes' : 'Available after the task is created'}
          className="min-h-[72px]"
          disabled={!canAdd}
          onChange={(e) => onBodyChange(e.target.value)}
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={onAdd} disabled={!canAdd || !body.trim() || adding}>
            <Plus className="mr-1.5 h-4 w-4" /> {adding ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </div>

      {/* Register */}
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No access points yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">Written by</th>
                <th className="px-2 py-2">Subject</th>
                <th className="px-2 py-2">Notes</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((n) => {
                const mine = !!meId && n.authorId === meId;
                const canManage = mine || isAdmin; // author, or an admin over any row
                const isTemp = n.id.startsWith('temp-');
                const isEditing = editingId === n.id;
                return (
                  <tr key={n.id} className="border-b border-border/60 align-top">
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6"><AvatarFallback className="text-[9px]">{initials(n.authorName)}</AvatarFallback></Avatar>
                        <div>
                          <div className="font-medium">{n.authorName}{mine ? ' (You)' : ''}</div>
                          <div className="text-[11px] text-muted-foreground">{formatDate(n.createdAt, 'dd MMM yyyy, h:mm a')}</div>
                        </div>
                      </div>
                    </td>
                    {isEditing ? (
                      <>
                        <td className="px-2 py-3"><Input value={editSubject} placeholder="Subject" maxLength={200} className="h-8 text-xs" onChange={(e) => setEditSubject(e.target.value)} /></td>
                        <td className="px-2 py-3"><Textarea value={editBody} className="min-h-[60px] text-sm" onChange={(e) => setEditBody(e.target.value)} /></td>
                        <td className="px-2 py-3">
                          <div className="flex gap-1.5">
                            <Button type="button" size="sm" onClick={() => saveEdit(n.id)} disabled={!editBody.trim()}>Save</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-3 font-medium">{n.subject || '—'}</td>
                        <td className="px-2 py-3 text-muted-foreground"><p className="max-w-[360px] whitespace-pre-wrap break-words">{n.body}</p></td>
                        <td className="px-2 py-3">
                          {canManage && !isTemp && (
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => startEdit(n)} title={mine ? 'Edit your entry' : 'Edit entry (admin)'} className="text-muted-foreground transition hover:text-primary">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => onDelete(n.id)} title={mine ? 'Delete your entry' : 'Delete entry (admin)'} className="text-muted-foreground transition hover:text-rose-500">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabPill({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {children}
    </button>
  );
}

const APPROVAL_META: Record<TaskApprovalStatus, { label: string; icon: typeof Clock; badge: string; dot: string }> = {
  PENDING: { label: 'Pending', icon: Clock, badge: 'bg-amber-100 text-amber-700', dot: 'text-amber-500' },
  APPROVED: { label: 'Approved', icon: CheckCircle2, badge: 'bg-emerald-100 text-emerald-700', dot: 'text-emerald-500' },
  REJECTED: { label: 'Rejected', icon: XCircle, badge: 'bg-rose-100 text-rose-700', dot: 'text-rose-500' },
};

function ApprovalStatusBadge({ status }: { status: TaskApprovalStatus }) {
  const m = APPROVAL_META[status];
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', m.badge)}>
      <Icon className="h-3.5 w-3.5" /> {m.label}
    </span>
  );
}

/**
 * Approval tab — a request register. Admins and the customer submit requests and
 * approve/reject them (with optional feedback); team members see the tab
 * read-only. Columns: Submitted date · Subject · Message · Action · Feedback.
 */
function ApprovalPanel({
  approvals,
  canApprove,
  isAdmin,
  subject,
  message,
  files,
  onSubjectChange,
  onMessageChange,
  onFilesAdd,
  onFileRemove,
  onSubmit,
  submitting,
  feedbackDraft,
  onFeedbackChange,
  onDecide,
  deciding,
  onRemove,
  onReopen,
}: {
  approvals: TaskApproval[];
  canApprove: boolean;
  isAdmin: boolean;
  subject: string;
  message: string;
  files: File[];
  onSubjectChange: (v: string) => void;
  onMessageChange: (v: string) => void;
  onFilesAdd: (files: File[]) => void;
  onFileRemove: (index: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  feedbackDraft: Record<string, string>;
  onFeedbackChange: (id: string, v: string) => void;
  onDecide: (id: string, status: 'APPROVED' | 'REJECTED') => void;
  deciding?: string;
  onRemove: (id: string) => void;
  onReopen: (id: string) => void;
}) {
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  return (
    <div className="mt-5 space-y-5">
      {/* Submit a request — admins only. The customer just reviews & decides. */}
      {isAdmin && (
        <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
          <h4 className="text-sm font-semibold">Request approval</h4>
          <Input value={subject} placeholder="Subject" maxLength={200} onChange={(e) => onSubjectChange(e.target.value)} />
          <Textarea
            value={message}
            placeholder="Please Upload Image/URL/File for Approval..."
            className="min-h-[72px]"
            onChange={(e) => onMessageChange(e.target.value)}
          />

          {/* Selected files (not yet uploaded) */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                  <span className="shrink-0 text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => onFileRemove(i)} className="shrink-0 text-muted-foreground hover:text-rose-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-primary">
              <Paperclip className="h-4 w-4" /> Attach image / file
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) onFilesAdd(fs); e.target.value = ''; }}
              />
            </label>
            <Button type="button" size="sm" onClick={onSubmit} disabled={submitting || (!subject.trim() && !message.trim() && files.length === 0)}>
              <Send className="mr-1.5 h-4 w-4" /> {submitting ? 'Sending…' : 'Submit for approval'}
            </Button>
          </div>
        </div>
      )}

      {/* Register */}
      {approvals.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No approval requests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="whitespace-nowrap px-2 py-2">Submitted</th>
                <th className="px-2 py-2">Subject</th>
                <th className="px-2 py-2">Message</th>
                <th className="px-2 py-2">Action</th>
                <th className="px-2 py-2">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => {
                const pending = a.status === 'PENDING';
                const busy = deciding === a.id;
                return (
                  <tr key={a.id} className="border-b border-border/60 align-top">
                    <td className="whitespace-nowrap px-2 py-3 text-xs text-muted-foreground">
                      {formatDate(a.createdAt, 'dd MMM yyyy, h:mm a')}
                      <div className="mt-0.5 text-[11px]">by {a.requestedByName}</div>
                    </td>
                    <td className="px-2 py-3 font-medium">{a.subject}</td>
                    <td className="px-2 py-3 text-muted-foreground">
                      <p className="max-w-[360px] whitespace-pre-wrap break-words">{a.message}</p>
                      {a.attachments && a.attachments.length > 0 && (
                        <div className="mt-2 flex max-w-[360px] flex-wrap gap-2">
                          {a.attachments.map((f) => {
                            const url = mediaUrl(f.url) ?? '';
                            const isImage = (f.contentType ?? '').startsWith('image/');
                            if (isImage) {
                              return (
                                <div key={f.id} className="group relative">
                                  <button
                                    type="button"
                                    onClick={() => setLightbox({ url, name: f.fileName })}
                                    title={`Preview ${f.fileName}`}
                                    className="block overflow-hidden rounded-lg border border-border transition hover:border-primary/40"
                                  >
                                    <img src={url} alt={f.fileName} className="h-16 w-16 object-cover" />
                                  </button>
                                  <a
                                    href={url}
                                    download={f.fileName}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={`Download ${f.fileName} (${(f.size / 1024).toFixed(0)} KB)`}
                                    className="absolute right-1 top-1 rounded-md bg-card/90 p-1 text-muted-foreground opacity-0 shadow-sm transition hover:text-primary group-hover:opacity-100"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                </div>
                              );
                            }
                            return (
                              <a
                                key={f.id}
                                href={url}
                                download={f.fileName}
                                target="_blank"
                                rel="noreferrer"
                                title={`Download ${f.fileName} (${(f.size / 1024).toFixed(0)} KB)`}
                                className="group flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs transition hover:border-primary/40"
                              >
                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="max-w-[120px] truncate font-medium text-foreground">{f.fileName}</span>
                                <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      {pending ? (
                        canApprove ? (
                          <div className="space-y-1.5">
                            <div className="flex gap-1.5">
                              <Button type="button" size="sm" disabled={busy} onClick={() => onDecide(a.id, 'APPROVED')}>
                                <Check className="h-4 w-4" /> Approve
                              </Button>
                              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onDecide(a.id, 'REJECTED')}>
                                <X className="h-4 w-4" /> Reject
                              </Button>
                            </div>
                            <Input
                              value={feedbackDraft[a.id] ?? ''}
                              placeholder="Feedback (optional)"
                              className="h-8 text-xs"
                              onChange={(e) => onFeedbackChange(a.id, e.target.value)}
                            />
                          </div>
                        ) : (
                          <ApprovalStatusBadge status={a.status} />
                        )
                      ) : (
                        <div className="space-y-1">
                          <ApprovalStatusBadge status={a.status} />
                          {a.decidedByName && (
                            <div className="text-[11px] text-muted-foreground">
                              by {a.decidedByName}
                              {a.decidedAt ? ` · ${formatDate(a.decidedAt, 'dd MMM')}` : ''}
                            </div>
                          )}
                          {/* Admin can re-open a wrong decision (e.g. a client
                              approved/rejected by mistake) to decide again. */}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => onReopen(a.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary transition hover:underline"
                            >
                              <RotateCcw className="h-3 w-3" /> Re-open
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">
                      <div className="flex items-start gap-1.5">
                        <p className="max-w-[300px] flex-1 whitespace-pre-wrap break-words">{a.feedback || '—'}</p>
                        {isAdmin && (
                          <button
                            type="button"
                            title="Delete approval request"
                            onClick={() => onRemove(a.id)}
                            className="shrink-0 text-muted-foreground transition hover:text-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Image lightbox — full-screen preview; download gives the original file. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 animate-fade-in"
          onClick={() => setLightbox(null)}
        >
          <div className="absolute right-4 top-4 flex gap-2">
            <a
              href={lightbox.url}
              download={lightbox.name}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Download original"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              title="Close"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <img
            src={lightbox.url}
            alt={lightbox.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1 text-sm font-medium">
        {label}
        {hint && (
          <Tooltip content={<span className="block max-w-[240px] leading-relaxed">{hint}</span>}>
            <button type="button" tabIndex={-1} className="text-muted-foreground hover:text-foreground" aria-label={hint}>
              <Info className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}

/** Native select with a leading icon/dot overlaid on the left. */
function IconSelect({
  leading,
  value,
  onChange,
  disabled,
  children,
}: {
  leading: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">{leading}</span>
      <Select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-10 pl-8">
        {children}
      </Select>
    </div>
  );
}

/** Date input styled like Planner: shows a placeholder or the formatted date. */
function DateField({
  value,
  placeholder,
  onChange,
  disabled,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.focus();
  };
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-input bg-card px-3 text-sm shadow-sm transition-colors hover:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn(!value && 'text-muted-foreground')}>{value ? formatDate(value) : placeholder}</span>
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </button>
      <input
        ref={ref}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute inset-0 h-0 w-0 opacity-0"
        tabIndex={-1}
      />
      {value && !disabled && (
        <button type="button" onClick={() => onChange('')} className="absolute right-9 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-rose-500">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
