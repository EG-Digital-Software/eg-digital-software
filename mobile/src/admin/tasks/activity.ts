import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { taskActivityByTask, type ActivityTask, type AdminTask } from '../../api/admin/tasks';
import type { TaskApproval } from '../../api/types';
import { useAuth } from '../../context/AuthContext';

/**
 * "New activity" seen-state for the admin boards — the phone's copy of the web's
 * lib/taskSeen.ts. Per user and customer board: task id → the activity signature
 * when the admin last opened it. Kept on the device only (the web keeps its copy
 * in the browser), so nothing is written to the database.
 */

type SeenMap = Record<string, string>;
const maps: Record<string, SeenMap> = {};
const loading: Record<string, Promise<void>> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const storageKey = (meId: string, clientId: string) => `admin-taskRowSeen:v2:${meId}:${clientId}`;

function ensureLoaded(meId: string, clientId: string) {
  const k = storageKey(meId, clientId);
  if (maps[k] || k in loading) return loading[k] ?? Promise.resolve();
  loading[k] = AsyncStorage.getItem(k)
    .then((raw) => {
      maps[k] = raw ? (JSON.parse(raw) as SeenMap) : {};
    })
    .catch(() => {
      maps[k] = {};
    })
    .finally(() => emit());
  return loading[k]!;
}

function useVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const l = () => setV((x) => x + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}

// ─── Activity signature (same rules as the web) ──────────

export type ActivityMeta = { sig: string; lastActor: string | null; lastTs: string };

export function activityMeta(t: ActivityTask): ActivityMeta {
  const events: { ts: string; actor: string | null }[] = [];
  if (t.createdAt) events.push({ ts: t.createdAt, actor: t.createdById ?? null });
  for (const c of t.comments ?? []) events.push({ ts: c.createdAt, actor: c.authorId });
  for (const n of t.notes ?? []) events.push({ ts: n.createdAt, actor: n.authorId });
  for (const a of t.attachments ?? []) events.push({ ts: a.createdAt, actor: a.uploadedById ?? null });
  for (const ap of t.approvals ?? []) {
    events.push({ ts: ap.createdAt, actor: ap.requestedById ?? null });
    if (ap.decidedAt) events.push({ ts: ap.decidedAt, actor: ap.decidedById ?? null });
  }
  let last = events[0];
  for (const e of events) if (e.ts > (last?.ts ?? '')) last = e;
  const sig = `${events.length}:${last?.ts ?? ''}:${(t.approvals ?? []).map((a) => a.status).join(',')}`;
  return { sig, lastActor: last?.actor ?? null, lastTs: last?.ts ?? '' };
}

const isUnseen = (id: string, m: ActivityMeta, seen: SeenMap | undefined, meId: string | undefined) => m.lastActor !== meId && seen?.[id] !== m.sig;

export type NewSince = { ts: string; statuses: string | null };

/** Reads a seen-signature (`count:lastTs:statuses`) back into a NewSince. */
export function newSinceFromSig(sig: string | undefined): NewSince {
  if (!sig) return { ts: '', statuses: null };
  const a = sig.indexOf(':');
  const b = sig.lastIndexOf(':');
  if (a < 0 || b <= a) return { ts: '', statuses: null };
  return { ts: sig.slice(a + 1, b), statuses: sig.slice(b + 1) };
}

// ─── One board ────────────────────────────────────────────

/** Seen-state of one customer's board for the signed-in admin. */
export function useBoardSeen(clientId: string) {
  const meId = useAuth().user?.id;
  useVersion();
  useEffect(() => {
    if (meId) void ensureLoaded(meId, clientId);
  }, [meId, clientId]);
  const k = meId ? storageKey(meId, clientId) : '';
  const seen = maps[k];
  const ready = !!seen;
  return {
    ready,
    /** Activity on this task the admin hasn't opened (and didn't make). */
    isUpdated: (t: ActivityTask) => ready && isUnseen(t.id, activityMeta(t), seen, meId),
    /** Where its unseen activity starts (null when there is none). */
    newSince: (t: ActivityTask): NewSince | null => (ready && isUnseen(t.id, activityMeta(t), seen, meId) ? newSinceFromSig(seen?.[t.id]) : null),
    /** Record the task's current activity as seen. */
    markOpened: (t: ActivityTask) => {
      if (!ready || !k) return;
      const sig = activityMeta(t).sig;
      if (maps[k]![t.id] === sig) return;
      maps[k] = { ...maps[k], [t.id]: sig };
      AsyncStorage.setItem(k, JSON.stringify(maps[k])).catch(() => undefined);
      emit();
    },
  };
}

// ─── All customers (picker dots) ─────────────────────────

/** Which customers have task activity this admin hasn't opened. */
export function useAdminTaskActivity() {
  const meId = useAuth().user?.id;
  const version = useVersion();
  const q = useQuery({ queryKey: ['admin-tasks', 'activity'], queryFn: taskActivityByTask, enabled: !!meId, refetchInterval: 20_000 });
  const clientIds = useMemo(() => [...new Set((q.data ?? []).map((t) => t.clientId))], [q.data]);
  useEffect(() => {
    if (meId) clientIds.forEach((c) => void ensureLoaded(meId, c));
  }, [meId, clientIds]);
  const companies = useMemo(() => {
    const out = new Set<string>();
    if (!meId) return out;
    for (const t of q.data ?? []) {
      const seen = maps[storageKey(meId, t.clientId)];
      if (!seen) continue;
      if (isUnseen(t.id, activityMeta(t), seen, meId)) out.add(t.clientId);
    }
    return out;
    // `version` re-reads the seen maps when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, meId, version]);
  return { any: companies.size > 0, companyHasNew: (clientId: string) => companies.has(clientId) };
}

// ─── What's new ───────────────────────────────────────────

export type WhatsNewTarget = 'chat' | 'details' | 'files' | 'approvals' | 'access' | 'archive' | null;
export interface WhatsNewItem {
  key: string;
  icon: 'sparkles-outline' | 'chatbubble-outline' | 'document-text-outline' | 'key-outline' | 'attach' | 'archive-outline' | 'time-outline' | 'checkmark-circle-outline' | 'close-circle-outline' | 'refresh';
  title: string;
  by?: string;
  target: WhatsNewTarget;
}

const names = (list: (string | null | undefined)[]) => [...new Set(list.filter(Boolean) as string[])].join(', ');
type Ap = TaskApproval & { requestedById?: string; decidedById?: string | null };

/** Everything someone else did on a task since `since` — one short line per kind. */
export function whatsNewItems(task: AdminTask, since: NewSince, meId: string | undefined): WhatsNewItem[] {
  const isNew = (ts?: string | null, actor?: string | null) => !!ts && ts > since.ts && actor !== meId;
  const items: WhatsNewItem[] = [];
  const group = (key: string, icon: WhatsNewItem['icon'], one: string, many: string, by: (string | null | undefined)[], target: WhatsNewTarget) => {
    if (by.length) items.push({ key, icon, title: by.length === 1 ? one : `${by.length} ${many}`, by: names(by), target });
  };

  if (isNew(task.createdAt, task.createdById)) items.push({ key: 'task', icon: 'sparkles-outline', title: 'New task added', target: null });
  const notes = task.notes ?? [];
  group('chat', 'chatbubble-outline', 'New message', 'new messages', task.comments.filter((c) => isNew(c.createdAt, c.authorId)).map((c) => c.authorName), 'chat');
  group('notes', 'document-text-outline', 'New note added', 'new notes added',
    notes.filter((n) => (n.kind ?? 'NOTE') === 'NOTE' && isNew(n.createdAt, n.authorId)).map((n) => n.authorName), 'details');
  group('access', 'key-outline', 'New access point added', 'new access points added',
    notes.filter((n) => n.kind === 'ACCESS_POINT' && isNew(n.createdAt, n.authorId)).map((n) => n.authorName), 'access');
  group('files', 'attach', 'New file uploaded', 'new files uploaded',
    task.attachments.filter((f) => isNew(f.createdAt, f.uploadedById)).map((f) => f.uploadedByName), 'files');
  group('archive', 'archive-outline', 'New archive file uploaded', 'new archive files uploaded',
    (task.archive ?? []).filter((f) => isNew(f.createdAt, f.uploadedById)).map((f) => f.uploadedByName), 'archive');

  const approvals = (task.approvals ?? []) as Ap[];
  const rootNo = new Map(approvals.filter((a) => !a.parentId).sort((x, y) => x.createdAt.localeCompare(y.createdAt)).map((a, i) => [a.id, i + 1]));
  const label = (a: Ap) => {
    if (!a.parentId) return `Approval #${rootNo.get(a.id) ?? '?'}`;
    const subs = approvals.filter((x) => x.parentId === a.parentId).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    return `Resubmission #${rootNo.get(a.parentId) ?? '?'}.${subs.findIndex((x) => x.id === a.id) + 1}`;
  };
  for (const a of [...approvals].sort((x, y) => x.createdAt.localeCompare(y.createdAt))) {
    if (isNew(a.createdAt, a.requestedById)) {
      items.push({ key: `ap-new-${a.id}`, icon: 'time-outline', title: `New ${a.parentId ? 'resubmission' : 'approval request'} (${label(a)})`, by: a.requestedByName, target: 'approvals' });
    }
    if (a.status !== 'PENDING' && isNew(a.decidedAt, a.decidedById)) {
      items.push({
        key: `ap-dec-${a.id}`,
        icon: a.status === 'APPROVED' ? 'checkmark-circle-outline' : 'close-circle-outline',
        title: `${label(a)} ${a.status === 'APPROVED' ? 'approved' : 'rejected'}`,
        by: a.decidedByName ?? undefined,
        target: 'approvals',
      });
    }
  }
  const statuses = approvals.map((a) => a.status).join(',');
  if (!items.some((i) => i.target === 'approvals') && since.statuses !== null && since.statuses !== statuses) {
    items.push({ key: 'ap-status', icon: 'refresh', title: 'Approval status changed', target: 'approvals' });
  }
  return items;
}
