import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, errorMessage } from '../../api/client';
import { fileUrl, type PickedFile } from '../../api/tasks';
import type { AccessPointData, AdminTask } from '../../api/admin/tasks';
import type { TaskApproval, TaskAttachment } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { useScope } from '../../context/ScopeContext';
import { formatSize, formatStamp, isImage } from '../../lib/format';
import { Btn, Card, EmptyCard, Loading, Muted, Pill, T, type PillKind } from '../../ui';
import { colors } from '../../theme';
import { DateRow, Input, Label, SelectRow, SmallBtn, confirmDestroy, fmtDay, pickFiles, todayInput, useAdminApi, useRefreshBoard } from './common';
import { PromptSheet } from './BoardScreen';

const onErr = (title: string) => (e: unknown) => Alert.alert(title, errorMessage(e));
const openFile = (url: string) => void Linking.openURL(fileUrl(url)).catch(() => Alert.alert('Could not open this file'));

function FileRow({ f, first, sub, onDelete, onRename }: { f: TaskAttachment; first?: boolean; sub?: string; onDelete?: () => void; onRename?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <Pressable onPress={() => openFile(f.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        {isImage(f.contentType, f.fileName) ? (
          <Image source={{ uri: fileUrl(f.url) }} style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: colors.soft }} />
        ) : (
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={(f.contentType ?? '').startsWith('video/') ? 'videocam-outline' : 'document-outline'} size={18} color={colors.green} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w="s" size={14} numberOfLines={1}>
            {f.fileName}
          </T>
          <Muted size={12} numberOfLines={1}>
            {sub ?? `${f.uploadedByName ? `${f.uploadedByName} · ` : ''}${formatStamp(f.createdAt)}${f.size ? ` · ${formatSize(f.size)}` : ''}`}
          </Muted>
        </View>
      </Pressable>
      {onRename ? (
        <Pressable onPress={onRename} hitSlop={8} accessibilityLabel={`Rename ${f.fileName}`}>
          <Ionicons name="create-outline" size={19} color={colors.muted} />
        </Pressable>
      ) : null}
      {onDelete ? (
        <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel={`Delete ${f.fileName}`}>
          <Ionicons name="trash-outline" size={19} color={colors.redFg} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Attachments ──────────────────────────────────────────

export function FilesPanel({ clientId, task }: { clientId: string; task: AdminTask }) {
  const { api: shared } = useScope();
  const api = useAdminApi(clientId);
  const refresh = useRefreshBoard();
  const [progress, setProgress] = useState<number | null>(null);
  const files = [...task.attachments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const upload = useMutation({
    mutationFn: async (list: PickedFile[]) => {
      for (const f of list) {
        setProgress(0);
        await shared!.addAttachment(task.id, f, setProgress);
      }
    },
    onSettled: () => {
      setProgress(null);
      refresh(task.id);
    },
    onError: onErr('Upload failed'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAttachment(task.id, id),
    onSuccess: () => refresh(task.id),
    onError: onErr('Could not delete the file'),
  });

  return (
    <>
      <Btn
        title={progress !== null ? `Uploading… ${progress}%` : 'Add attachment'}
        icon="cloud-upload-outline"
        variant="dashed"
        loading={upload.isPending && progress === null}
        disabled={upload.isPending}
        onPress={() => pickFiles((l) => upload.mutate(l), { multiple: true })}
        style={{ marginTop: 16 }}
      />
      <Card style={{ marginTop: 14 }}>
        {files.length === 0 ? (
          <Muted size={14} style={{ padding: 16 }}>
            No attachments yet.
          </Muted>
        ) : (
          files.map((f, i) => (
            <FileRow
              key={f.id}
              f={f}
              first={i === 0}
              onDelete={() => confirmDestroy('Delete attachment?', `Delete "${f.fileName}" from this task?`, () => remove.mutate(f.id))}
            />
          ))
        )}
      </Card>
    </>
  );
}

// ─── Archive (admin media store) ──────────────────────────

export function ArchivePanel({ clientId, task }: { clientId: string; task: AdminTask }) {
  const api = useAdminApi(clientId);
  const refresh = useRefreshBoard();
  const [prompt, setPrompt] = useState<{ title: string; value: string; action: string; onSave: (v: string) => void } | null>(null);
  const files = [...(task.archive ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const done = () => refresh(task.id);

  const upload = useMutation({
    mutationFn: async (list: PickedFile[]) => {
      for (const f of list) await api.addArchive(task.id, f);
    },
    onSettled: done,
    onError: onErr('Upload failed'),
  });
  const rename = useMutation({ mutationFn: (v: { id: string; name: string }) => api.renameArchive(task.id, v.id, v.name), onSuccess: done, onError: onErr('Rename failed') });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteArchive(task.id, id), onSuccess: done, onError: onErr('Delete failed') });

  return (
    <>
      <Muted size={13} style={{ marginTop: 14 }}>
        Original-quality files kept for this task. The client and team can view them; only admins add or change them.
      </Muted>
      <Btn
        title={upload.isPending ? 'Uploading…' : 'Upload to archive'}
        icon="archive-outline"
        variant="dashed"
        loading={upload.isPending}
        onPress={() => pickFiles((l) => upload.mutate(l), { multiple: true })}
        style={{ marginTop: 12 }}
      />
      <Card style={{ marginTop: 14 }}>
        {files.length === 0 ? (
          <Muted size={14} style={{ padding: 16 }}>
            No archived files yet.
          </Muted>
        ) : (
          files.map((f, i) => (
            <FileRow
              key={f.id}
              f={f}
              first={i === 0}
              onRename={() => setPrompt({ title: 'Rename file', value: f.fileName, action: 'Save', onSave: (name) => name !== f.fileName && rename.mutate({ id: f.id, name }) })}
              onDelete={() => confirmDestroy('Delete archived file?', `Delete "${f.fileName}" permanently?`, () => remove.mutate(f.id))}
            />
          ))
        )}
      </Card>
      <PromptSheet prompt={prompt} onClose={() => setPrompt(null)} />
    </>
  );
}

// ─── Approvals ────────────────────────────────────────────

type Approval = TaskApproval & { updatedAt?: string; resubmitReopenedAt?: string | null };
const APPROVAL_PILL: Record<string, { kind: PillKind; label: string }> = {
  PENDING: { kind: 'warn', label: 'Pending' },
  APPROVED: { kind: 'ok', label: 'Approved' },
  REJECTED: { kind: 'red', label: 'Rejected' },
};
/** The team may resubmit within 48h of a rejection (or of an admin re-opening the window). */
const RESUBMIT_WINDOW_MS = 48 * 60 * 60 * 1000;
const resubmitDeadline = (a: Approval) =>
  Math.max(new Date(a.decidedAt ?? a.updatedAt ?? a.createdAt).getTime(), a.resubmitReopenedAt ? new Date(a.resubmitReopenedAt).getTime() : 0) + RESUBMIT_WINDOW_MS;
const timeLeft = (ms: number) => {
  const mins = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
};

function ApprovalForm({
  title,
  initialSubject = '',
  busy,
  progress,
  onSend,
  onCancel,
}: {
  title: string;
  initialSubject?: string;
  busy: boolean;
  progress: number | null;
  onSend: (v: { subject: string; message: string; files: PickedFile[] }) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const can = !!(subject.trim() || message.trim() || files.length) && !busy;
  const send = async () => {
    try {
      await onSend({ subject: subject.trim(), message: message.trim(), files });
      setSubject('');
      setMessage('');
      setFiles([]);
    } catch {
      // The error alert comes from the mutation; keep the form.
    }
  };
  return (
    <Card style={{ padding: 14, marginTop: 14 }}>
      <T w="s" size={15}>
        {title}
      </T>
      <Label>Subject</Label>
      <Input value={subject} onChangeText={setSubject} placeholder="What needs approval?" maxLength={200} />
      <Label>Message</Label>
      <Input value={message} onChangeText={setMessage} placeholder="Details for the reviewer" multiline maxLength={5000} />
      {files.map((f, i) => (
        <View key={`${f.uri}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Ionicons name="attach" size={16} color={colors.muted} />
          <T size={13} style={{ flex: 1 }} numberOfLines={1}>
            {f.name}
          </T>
          <Pressable onPress={() => setFiles((l) => l.filter((_, j) => j !== i))} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.faint} />
          </Pressable>
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <SmallBtn title="Attach files" icon="attach" onPress={() => pickFiles((l) => setFiles((x) => [...x, ...l]), { multiple: true })} />
        {onCancel ? <SmallBtn title="Cancel" onPress={onCancel} /> : null}
      </View>
      <Btn title={progress !== null ? `Uploading… ${progress}%` : 'Send for approval'} icon="send" loading={busy && progress === null} disabled={!can} onPress={send} style={{ marginTop: 12 }} />
    </Card>
  );
}

export function ApprovalsPanel({ clientId, task }: { clientId: string; task: AdminTask }) {
  const api = useAdminApi(clientId);
  const refresh = useRefreshBoard();
  const done = () => refresh(task.id);
  const [progress, setProgress] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [resubmitFor, setResubmitFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const submit = useMutation({
    mutationFn: (v: { subject: string; message: string; files: PickedFile[] }) => api.submitApproval(task.id, v, setProgress),
    onSuccess: done,
    onError: onErr('Not sent'),
    onSettled: () => setProgress(null),
  });
  const resubmit = useMutation({
    mutationFn: (v: { id: string; subject: string; message: string; files: PickedFile[] }) => api.resubmitApproval(task.id, v.id, v, setProgress),
    onSuccess: () => {
      setResubmitFor(null);
      done();
    },
    onError: onErr('Not sent'),
    onSettled: () => setProgress(null),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; status: 'APPROVED' | 'REJECTED'; feedback: string | null }) => api.decideApproval(task.id, v.id, v),
    onSuccess: done,
    onError: onErr('Not saved'),
  });
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: done, onError: onErr('Something went wrong') });

  const approvals = (task.approvals ?? []) as Approval[];
  const roots = approvals.filter((a) => !a.parentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rootNo = new Map([...roots].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((a, i) => [a.id, i + 1]));
  const kids = (id: string) => approvals.filter((a) => a.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const entry = (a: Approval, label: string, latest: boolean, root: Approval) => {
    const pill = APPROVAL_PILL[a.status] ?? APPROVAL_PILL.PENDING!;
    const deadline = latest && a.status === 'REJECTED' ? resubmitDeadline(a) : null;
    const open = deadline !== null && deadline > now;
    return (
      <View key={a.id} style={{ paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T w="s" size={12.5} color={colors.green} style={{ flex: 1 }}>
            {label}
          </T>
          <Pill kind={pill.kind} label={pill.label} />
        </View>
        {a.subject ? (
          <T w="s" size={15} style={{ marginTop: 4 }}>
            {a.subject}
          </T>
        ) : null}
        {a.message ? (
          <T size={14} style={{ marginTop: 4, lineHeight: 20 }}>
            {a.message}
          </T>
        ) : null}
        <Muted size={12} style={{ marginTop: 4 }}>
          {formatStamp(a.createdAt)} · by {a.requestedByName}
        </Muted>
        {(a.attachments ?? []).length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {(a.attachments ?? []).map((f) =>
              isImage(f.contentType, f.fileName) ? (
                <Pressable key={f.id} onPress={() => openFile(f.url)}>
                  <Image source={{ uri: fileUrl(f.url) }} style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: colors.soft }} />
                </Pressable>
              ) : (
                <Pressable key={f.id} onPress={() => openFile(f.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.line, maxWidth: '100%' }}>
                  <Ionicons name="document-outline" size={15} color={colors.green} />
                  <T size={12.5} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {f.fileName}
                  </T>
                </Pressable>
              )
            )}
          </View>
        ) : null}
        {a.status !== 'PENDING' ? (
          <View style={{ marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: colors.soft2 }}>
            <Muted size={12}>
              {a.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {a.decidedByName ?? '—'}
              {a.decidedAt ? ` · ${formatStamp(a.decidedAt)}` : ''}
            </Muted>
            {a.feedback ? (
              <T size={13.5} style={{ marginTop: 4 }}>
                {a.feedback}
              </T>
            ) : null}
          </View>
        ) : (
          <>
            {a.feedback ? (
              <Muted size={13} style={{ marginTop: 8 }}>
                Feedback: {a.feedback}
              </Muted>
            ) : (
              <Input
                value={feedback[a.id] ?? ''}
                onChangeText={(v) => setFeedback((f) => ({ ...f, [a.id]: v }))}
                placeholder="Feedback (optional)"
                multiline
                style={{ marginTop: 10, minHeight: 60 }}
              />
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <SmallBtn
                title="Approve"
                icon="checkmark"
                tone="good"
                disabled={decide.isPending}
                onPress={() => decide.mutate({ id: a.id, status: 'APPROVED', feedback: a.feedback ?? (feedback[a.id]?.trim() || null) })}
              />
              <SmallBtn
                title="Reject"
                icon="close"
                tone="danger"
                disabled={decide.isPending}
                onPress={() => decide.mutate({ id: a.id, status: 'REJECTED', feedback: a.feedback ?? (feedback[a.id]?.trim() || null) })}
              />
            </View>
          </>
        )}
        {deadline !== null ? (
          <Muted size={12.5} style={{ marginTop: 8 }}>
            {open ? `Resubmission open for ${timeLeft(deadline - now)}` : 'The 48-hour resubmission window has closed.'}
          </Muted>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {a.status !== 'PENDING' ? (
            <SmallBtn
              title="Re-open"
              icon="refresh"
              onPress={() =>
                Alert.alert('Re-open this request?', 'It goes back to pending so it can be decided again.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Re-open', onPress: () => act.mutate(() => api.reopenApproval(task.id, a.id)) },
                ])
              }
            />
          ) : null}
          {deadline !== null && open && resubmitFor !== root.id ? <SmallBtn title="Resubmit" icon="return-down-forward" tone="primary" onPress={() => setResubmitFor(root.id)} /> : null}
          {deadline !== null && !open ? (
            <SmallBtn title="Re-open resubmission (48h)" icon="time-outline" onPress={() => act.mutate(() => api.reopenResubmitWindow(task.id, a.id))} />
          ) : null}
          <SmallBtn
            title="Delete"
            icon="trash-outline"
            tone="danger"
            onPress={() => confirmDestroy('Delete this request?', 'The request and its files are removed for everyone.', () => act.mutate(() => api.deleteApproval(task.id, a.id)))}
          />
        </View>
      </View>
    );
  };

  return (
    <>
      <ApprovalForm title="New approval request" busy={submit.isPending} progress={submit.isPending ? progress : null} onSend={(v) => submit.mutateAsync(v)} />
      {roots.length === 0 ? (
        <EmptyCard icon="shield-checkmark-outline" title="No approval requests yet" style={{ marginTop: 14 }} />
      ) : (
        roots.map((r) => {
          const children = kids(r.id);
          const no = rootNo.get(r.id);
          const latest = children[children.length - 1] ?? r;
          return (
            <Card key={r.id} style={{ paddingHorizontal: 14, paddingBottom: 14, marginTop: 14 }}>
              {entry(r, `Approval #${no}`, latest.id === r.id, r)}
              {children.map((c, i) => (
                <View key={c.id} style={{ marginTop: 12, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.greenIndicator }}>
                  {entry(c, `Resubmission #${no}.${i + 1}`, latest.id === c.id, r)}
                </View>
              ))}
              {resubmitFor === r.id ? (
                <ApprovalForm
                  title="Resubmit"
                  initialSubject={r.subject}
                  busy={resubmit.isPending}
                  progress={resubmit.isPending ? progress : null}
                  onSend={(v) => resubmit.mutateAsync({ id: r.id, ...v })}
                  onCancel={() => setResubmitFor(null)}
                />
              ) : null}
            </Card>
          );
        })
      )}
    </>
  );
}

// ─── Access Point (PIN-locked credentials) ────────────────

const ACCESS_ACTION: Record<string, string> = {
  UNLOCKED: 'Opened',
  ADDED: 'Added',
  EDITED: 'Edited',
  DELETED: 'Deleted',
  PIN_FAILED: 'Wrong PIN',
};

export function AccessPanel({ clientId, task }: { clientId: string; task: AdminTask }) {
  const api = useAdminApi(clientId);
  const refresh = useRefreshBoard();
  const { user } = useAuth();
  const [pin, setPin] = useState('');
  const [key, setKey] = useState<string | null>(null);
  const [data, setData] = useState<AccessPointData | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [showLog, setShowLog] = useState(false);

  const unlock = useMutation({
    mutationFn: () => api.unlockAccessPoint(task.id, pin.trim()),
    onSuccess: (r) => {
      setKey(r.key);
      setData({ entries: r.entries, log: r.log });
      setPin('');
    },
    onError: (e) =>
      Alert.alert(
        e instanceof ApiError && e.status === 423 ? 'Locked for now' : 'Could not open',
        errorMessage(e)
      ),
  });
  // Run a change with the key, then reload the entries and log.
  const change = useMutation({
    mutationFn: async (fn: (k: string) => Promise<unknown>) => {
      await fn(key!);
      return api.getAccessPoint(task.id, key!);
    },
    onSuccess: (d) => {
      setData(d);
      refresh(task.id);
    },
    onError: (e) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 423)) {
        setKey(null);
        setData(null);
      }
      Alert.alert('Not saved', errorMessage(e));
    },
  });

  if (!key || !data) {
    return (
      <Card style={{ padding: 16, marginTop: 16, alignItems: 'center' }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Ionicons name="key-outline" size={24} color={colors.green} />
        </View>
        <T w="s" size={16}>
          Access Point is locked
        </T>
        <Muted size={13} style={{ textAlign: 'center', marginTop: 4 }}>
          Enter your own PIN to see the logins and access details for this task. It locks again when you leave this tab.
        </Muted>
        <Input
          value={pin}
          onChangeText={setPin}
          placeholder="Your PIN"
          secureTextEntry
          keyboardType="number-pad"
          maxLength={12}
          onSubmitEditing={() => pin.trim() && unlock.mutate()}
          style={{ alignSelf: 'stretch', marginTop: 14, textAlign: 'center', letterSpacing: 6 }}
        />
        <Btn title="Unlock" icon="lock-open-outline" loading={unlock.isPending} disabled={!pin.trim()} onPress={() => unlock.mutate()} style={{ alignSelf: 'stretch', marginTop: 12 }} />
        <Muted size={12} style={{ textAlign: 'center', marginTop: 10 }}>
          No PIN yet? Set one in your account on the web portal.
        </Muted>
      </Card>
    );
  }

  const entries = [...data.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <Ionicons name="lock-open-outline" size={16} color={colors.okFg} />
        <T w="s" size={13} color={colors.okFg} style={{ flex: 1 }}>
          Unlocked
        </T>
        <SmallBtn
          title="Lock"
          icon="lock-closed-outline"
          onPress={() => {
            setKey(null);
            setData(null);
          }}
        />
      </View>
      <Card style={{ padding: 14, marginTop: 10 }}>
        <Input value={draft} onChangeText={setDraft} placeholder="Add access details (URL, username, password…)" multiline />
        <Btn
          title="Add entry"
          icon="add"
          style={{ marginTop: 10 }}
          loading={change.isPending && !editing}
          disabled={!draft.trim()}
          onPress={() => change.mutate((k) => api.addAccessEntry(task.id, k, draft.trim()), { onSuccess: () => setDraft('') })}
        />
      </Card>
      {entries.length === 0 ? (
        <Muted size={13} style={{ marginTop: 12, textAlign: 'center' }}>
          No entries yet.
        </Muted>
      ) : (
        entries.map((n) => (
          <Card key={n.id} style={{ padding: 14, marginTop: 10 }}>
            {editing?.id === n.id ? (
              <>
                <Input value={editing.body} onChangeText={(v) => setEditing({ id: n.id, body: v })} multiline autoFocus />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <SmallBtn
                    title="Save"
                    tone="primary"
                    disabled={!editing.body.trim() || change.isPending}
                    onPress={() => change.mutate((k) => api.editAccessEntry(task.id, k, n.id, editing.body.trim()), { onSuccess: () => setEditing(null) })}
                  />
                  <SmallBtn title="Cancel" onPress={() => setEditing(null)} />
                </View>
              </>
            ) : (
              <>
                <T size={14} selectable style={{ lineHeight: 20 }}>
                  {n.body}
                </T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Muted size={12} style={{ flex: 1 }}>
                    {n.authorId === user?.id ? 'You' : n.authorName} · {formatStamp(n.createdAt)}
                  </Muted>
                  <Pressable onPress={() => setEditing({ id: n.id, body: n.body })} hitSlop={8} accessibilityLabel="Edit entry">
                    <Ionicons name="create-outline" size={18} color={colors.muted} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDestroy('Delete entry?', 'Remove these access details?', () => change.mutate((k) => api.deleteAccessEntry(task.id, k, n.id)))}
                    hitSlop={8}
                    accessibilityLabel="Delete entry"
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.redFg} />
                  </Pressable>
                </View>
              </>
            )}
          </Card>
        ))
      )}
      <Pressable onPress={() => setShowLog((s) => !s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 }}>
        <Ionicons name={showLog ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
        <T w="s" size={14}>
          Activity record ({data.log.length})
        </T>
      </Pressable>
      {showLog ? (
        <Card style={{ marginTop: 8 }}>
          {data.log.map((l, i) => (
            <View key={l.id} style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <T size={13.5}>
                <T w="s" size={13.5} color={l.action === 'PIN_FAILED' ? colors.redFg : colors.fg}>
                  {ACCESS_ACTION[l.action] ?? l.action}
                </T>{' '}
                · {l.userName}
              </T>
              <Muted size={12}>
                {formatStamp(l.createdAt)}
                {l.detail ? ` · ${l.detail}` : ''}
              </Muted>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

// ─── Hours (time entries against purchased hours) ─────────

export function HoursPanel({ clientId, task }: { clientId: string; task: AdminTask }) {
  const api = useAdminApi(clientId);
  const { user } = useAuth();
  const products = useQuery({ queryKey: ['admin-tasks', clientId, 'hour-products', task.id], queryFn: () => api.hourProducts(task.id) });
  const entries = useQuery({ queryKey: ['admin-tasks', clientId, 'time-entries', task.id], queryFn: () => api.timeEntries(task.id) });
  const [productId, setProductId] = useState('');
  const [date, setDate] = useState(todayInput());
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const reload = () => {
    void products.refetch();
    void entries.refetch();
  };

  const add = useMutation({
    mutationFn: () => api.addTimeEntry(task.id, { customerProductId: productId, workDate: date, hours: Number(hours.replace(',', '.')), note: note.trim() || null }),
    onSuccess: () => {
      setHours('');
      setNote('');
      reload();
    },
    onError: onErr('Not saved'),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteTimeEntry(task.id, id), onSuccess: reload, onError: onErr('Not deleted') });

  const list = products.data ?? [];
  const chosen = productId || (list.length === 1 ? list[0]!.id : '');
  const h = Number(hours.replace(',', '.'));
  const valid = !!chosen && !!date && h > 0 && h <= 24;
  const total = (entries.data ?? []).reduce((n, e) => n + e.hours, 0);

  return (
    <>
      <Label style={{ marginTop: 16 }}>Purchased hours</Label>
      {products.isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Muted size={13}>This customer has no approved hours products, so no time can be logged yet.</Muted>
      ) : (
        <Card>
          {list.map((p, i) => (
            <View key={p.id} style={{ paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <T w="s" size={14} style={{ flex: 1 }} numberOfLines={1}>
                  {p.product}
                </T>
                <T w="b" size={14} color={p.balanceHours < 0 ? colors.redFg : colors.okFg}>
                  {p.balanceHours}h left
                </T>
              </View>
              <Muted size={12}>
                {p.usedHours}h used of {p.totalHours}h · bought {fmtDay(p.purchasedAt.slice(0, 10))}
              </Muted>
            </View>
          ))}
        </Card>
      )}

      {list.length ? (
        <Card style={{ padding: 14, marginTop: 14 }}>
          <T w="s" size={15}>
            Log time
          </T>
          <Label>Hours from</Label>
          <SelectRow value={chosen} onChange={setProductId} placeholder="Pick purchased hours" options={list.map((p) => ({ value: p.id, label: `${p.product} (${p.balanceHours}h left)` }))} />
          <Label>Work date</Label>
          <DateRow value={date} onChange={setDate} clearable={false} />
          <Label>Hours</Label>
          <Input value={hours} onChangeText={setHours} placeholder="e.g. 1.5" keyboardType="decimal-pad" />
          <Label>Note</Label>
          <Input value={note} onChangeText={setNote} placeholder="What was done (optional)" multiline maxLength={1000} />
          <Btn title="Add time" icon="time-outline" loading={add.isPending} disabled={!valid} onPress={() => add.mutate()} style={{ marginTop: 12 }} />
        </Card>
      ) : null}

      <Label style={{ marginTop: 18 }}>{`Time logged${total ? ` · ${Math.round(total * 100) / 100}h` : ''}`}</Label>
      {entries.isLoading ? (
        <Loading />
      ) : (entries.data ?? []).length === 0 ? (
        <Muted size={13}>No time logged on this task yet.</Muted>
      ) : (
        <Card>
          {(entries.data ?? []).map((e, i) => (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <View style={{ flex: 1 }}>
                <T w="s" size={14}>
                  {e.hours}h · {fmtDay(e.workDate.slice(0, 10))}
                </T>
                <Muted size={12} numberOfLines={2}>
                  {e.product ?? 'Hours'} · {e.authorId === user?.id ? 'You' : e.authorName}
                  {e.note ? ` · ${e.note}` : ''}
                </Muted>
              </View>
              <Pressable
                onPress={() => confirmDestroy('Delete time entry?', `Remove ${e.hours}h logged on ${fmtDay(e.workDate.slice(0, 10))}? The hours go back to the balance.`, () => remove.mutate(e.id))}
                hitSlop={8}
                accessibilityLabel="Delete time entry"
              >
                {remove.isPending && remove.variables === e.id ? <ActivityIndicator size="small" color={colors.muted} /> : <Ionicons name="trash-outline" size={18} color={colors.redFg} />}
              </Pressable>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}
