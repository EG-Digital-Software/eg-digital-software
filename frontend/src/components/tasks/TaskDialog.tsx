import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Check,
  Plus,
  Paperclip,
  Tag,
  UserPlus,
  X,
  Send,
  Download,
  Info,
  Calendar,
  Repeat2,
  MessageSquareText,
  Circle,
} from 'lucide-react';
import type {
  AssignableUser,
  Task,
  TaskBucket,
  TaskLabel,
  TaskPriority,
  TaskProgress,
} from '@/types';
import type { TaskApi, TaskInput } from '@/api/tasks';
import { apiErrorMessage } from '@/api/client';
import { useAuth } from '@/store/auth';
import { cn, formatDate, initials, mediaUrl } from '@/lib/utils';
import { PRIORITY_META, PRIORITY_ORDER, PROGRESS_META, PROGRESS_ORDER, labelColor } from '@/lib/tasks';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/misc';
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
  labels: TaskLabel[];
  assignableUsers: AssignableUser[];
  api: TaskApi;
  scopeKey: string;
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

const REPEAT_OPTIONS = ['Does not repeat', 'Daily', 'Weekly', 'Monthly', 'Yearly'];

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
  labels,
  assignableUsers,
  api,
  scopeKey,
  readOnly = false,
}: Props) {
  const qc = useQueryClient();
  const isEdit = mode === 'edit';
  const disabled = readOnly;
  const meId = useAuth((s) => s.user?.id);

  const [draft, setDraft] = useState<Draft>(() => draftFromTask(task, createBucketId, buckets[0]?.id ?? ''));
  const [tab, setTab] = useState<'details' | 'attachments'>('details');
  const [repeat, setRepeat] = useState('Does not repeat');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [comment, setComment] = useState('');
  const [showChat, setShowChat] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(draftFromTask(task, createBucketId, buckets[0]?.id ?? ''));
      setTab('details');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, mode, createBucketId]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks', scopeKey] });

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
    mutationFn: (body: string) => api.addComment(task!.id, body),
    onSuccess: () => { setComment(''); invalidate(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const removeComment = useMutation({ mutationFn: (id: string) => api.deleteComment(task!.id, id), onSuccess: () => invalidate() });
  const uploadFile = useMutation({
    mutationFn: (file: File) => api.addAttachment(task!.id, file),
    onSuccess: () => { invalidate(); toast.success('Attachment added'); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const removeFile = useMutation({ mutationFn: (id: string) => api.deleteAttachment(task!.id, id), onSuccess: () => invalidate() });

  function update(partial: Partial<Draft>, persist?: TaskInput) {
    setDraft((d) => ({ ...d, ...partial }));
    if (isEdit && persist) patch.mutate(persist);
  }
  function toggleAssignee(u: AssignableUser) {
    const has = draft.assignees.some((a) => a.userId === u.userId);
    const assignees = has ? draft.assignees.filter((a) => a.userId !== u.userId) : [...draft.assignees, u];
    update({ assignees }, { assignees });
  }
  function toggleLabel(id: string) {
    const labelIds = draft.labelIds.includes(id) ? draft.labelIds.filter((x) => x !== id) : [...draft.labelIds, id];
    update({ labelIds }, { labelIds });
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
  const chatVisible = isEdit && showChat;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('!max-w-none gap-0 overflow-hidden p-0', chatVisible ? '!w-[min(1040px,96vw)]' : '!w-[min(640px,96vw)]')}>
        <DialogTitle className="sr-only">Task</DialogTitle>

        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-semibold text-primary">Tasks</span>
          {isEdit && (
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
          )}
        </div>

        <div className="flex h-[80vh] min-h-0">
          {/* ── Left: details ─────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6">
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

            {/* Add label */}
            <div className="mt-4 flex items-center gap-2">
              <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-wrap items-center gap-1.5">
                {draft.labelIds.map((id) => {
                  const l = labels.find((x) => x.id === id);
                  if (!l) return null;
                  return (
                    <span key={id} className={cn('inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium', labelColor(l.color).chip)}>
                      {l.name}
                      {!disabled && <button type="button" onClick={() => toggleLabel(id)}><X className="h-3 w-3 opacity-70 hover:opacity-100" /></button>}
                    </span>
                  );
                })}
                {!disabled && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="text-sm text-muted-foreground hover:text-primary">
                        {draft.labelIds.length ? '+ Label' : 'Add label'}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
                      <DropdownMenuLabel>Labels</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {labels.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Create labels from the board toolbar</div>}
                      {labels.map((l) => {
                        const checked = draft.labelIds.includes(l.id);
                        return (
                          <DropdownMenuItem key={l.id} onSelect={(e) => { e.preventDefault(); toggleLabel(l.id); }}>
                            <span className={cn('h-3 w-3 rounded-full', labelColor(l.color).solid)} />
                            <span className="flex-1 truncate">{l.name}</span>
                            {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

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
                      {!disabled && (
                        <button type="button" onClick={() => toggleAssignee(a)} className="absolute -right-1 -top-1 hidden rounded-full bg-card shadow group-hover:block">
                          <X className="h-3 w-3 text-muted-foreground hover:text-rose-500" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {!disabled && (
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
                  Attachments{task && task.attachments.length > 0 ? ` (${task.attachments.length})` : ''}
                </TabPill>
              )}
            </div>

            {tab === 'details' ? (
              <div className="mt-5 space-y-5">
                {/* Field grid */}
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Field label="Status">
                    <IconSelect
                      leading={<span className={cn('h-2.5 w-2.5 rounded-full', PROGRESS_META[draft.progress].dot)} />}
                      value={draft.progress}
                      disabled={disabled}
                      onChange={(v) => update({ progress: v as TaskProgress }, { progress: v as TaskProgress })}
                    >
                      {PROGRESS_ORDER.map((p) => <option key={p} value={p}>{PROGRESS_META[p].label}</option>)}
                    </IconSelect>
                  </Field>
                  <Field label="Priority">
                    <IconSelect
                      leading={<span className={cn('h-2.5 w-2.5 rounded-full', PRIORITY_META[draft.priority].bar)} />}
                      value={draft.priority}
                      disabled={disabled}
                      onChange={(v) => update({ priority: v as TaskPriority }, { priority: v as TaskPriority })}
                    >
                      {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                    </IconSelect>
                  </Field>

                  <Field label="Start date">
                    <DateField value={draft.startDate} placeholder="Set start date" disabled={disabled}
                      onChange={(v) => update({ startDate: v }, { startDate: toIso(v) || null })} />
                  </Field>
                  <Field label="Due date">
                    <DateField value={draft.dueDate} placeholder="Set due date" disabled={disabled}
                      onChange={(v) => update({ dueDate: v }, { dueDate: toIso(v) || null })} />
                  </Field>

                  <Field label="Repeat" hint>
                    <IconSelect leading={<Repeat2 className="h-3.5 w-3.5 text-muted-foreground" />} value={repeat} disabled={disabled} onChange={setRepeat}>
                      {REPEAT_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </IconSelect>
                  </Field>
                  <Field label="Bucket" hint>
                    <Select value={draft.bucketId} disabled={disabled} className="h-10" onChange={(e) => update({ bucketId: e.target.value }, { bucketId: e.target.value })}>
                      {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                </div>

                {/* Checklist */}
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Checklist</h4>
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
                        className="h-8 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
                        onChange={(e) => setNewChecklistItem(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())} />
                      {newChecklistItem.trim() && <Button type="button" size="sm" variant="secondary" onClick={addChecklistItem}><Plus className="h-4 w-4" /></Button>}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Notes</h4>
                  <Textarea
                    value={draft.description}
                    disabled={disabled}
                    placeholder="Type a description or add notes here"
                    className="min-h-[120px] border-0 bg-secondary/40 px-3 focus-visible:ring-1"
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    onBlur={() => isEdit && task && draft.description !== (task.description ?? '') && patch.mutate({ description: draft.description || null })}
                  />
                </div>
              </div>
            ) : (
              /* Attachments tab */
              <div className="mt-5 space-y-2">
                {task?.attachments.map((f) => (
                  <div key={f.id} className="group flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{f.fileName}</span>
                    <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                    <a href={mediaUrl(f.url)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><Download className="h-4 w-4" /></a>
                    <button type="button" onClick={() => removeFile.mutate(f.id)} className="opacity-0 transition group-hover:opacity-100"><X className="h-4 w-4 text-muted-foreground hover:text-rose-500" /></button>
                  </div>
                ))}
                {task && task.attachments.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No attachments yet.</p>}
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile.mutate(f); e.target.value = ''; }} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadFile.isPending}>
                  <Paperclip className="mr-1.5 h-4 w-4" /> {uploadFile.isPending ? 'Uploading…' : 'Add attachment'}
                </Button>
              </div>
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
          {chatVisible && task && (
            <div className="flex w-[320px] shrink-0 flex-col border-l border-border bg-secondary/20">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold">Task chat</h3>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {task.comments.length === 0 && <p className="pt-8 text-center text-xs text-muted-foreground">No messages yet. Start the conversation.</p>}
                {task.comments.map((c) => {
                  const mine = !!meId && c.authorId === meId;
                  return (
                    <div key={c.id} className={cn('group flex gap-2', mine && 'flex-row-reverse')}>
                      {!mine && (
                        <Avatar className="mt-4 h-7 w-7 shrink-0"><AvatarFallback className="text-[10px]">{initials(c.authorName)}</AvatarFallback></Avatar>
                      )}
                      <div className={cn('min-w-0 max-w-[85%]', mine && 'text-right')}>
                        <div className={cn('mb-1 flex items-center gap-2 text-[11px]', mine ? 'justify-end' : '')}>
                          {!mine && <span className="font-semibold text-primary">{c.authorName}</span>}
                          <span className="text-muted-foreground">{formatDate(c.createdAt)}</span>
                        </div>
                        <div className={cn('inline-block rounded-2xl px-3 py-2 text-left text-sm', mine ? 'bg-primary/10' : 'bg-card shadow-sm')}>
                          <p className="whitespace-pre-wrap break-words">{c.body}</p>
                        </div>
                        <button type="button" onClick={() => removeComment.mutate(c.id)} className="ml-2 text-[11px] text-muted-foreground opacity-0 transition hover:text-rose-500 group-hover:opacity-100">Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2">
                  <Textarea
                    value={comment}
                    placeholder="Type a message"
                    rows={1}
                    className="min-h-[24px] resize-none border-0 p-0 text-sm shadow-none focus-visible:ring-0"
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (comment.trim()) addComment.mutate(comment.trim()); } }}
                  />
                  <button type="button" onClick={() => comment.trim() && addComment.mutate(comment.trim())} disabled={addComment.isPending || !comment.trim()} className="mb-0.5 text-primary disabled:text-muted-foreground/40">
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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

function Field({ label, hint, children }: { label: string; hint?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1 text-sm font-medium">
        {label}
        {hint && <Info className="h-3.5 w-3.5 text-muted-foreground" />}
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
