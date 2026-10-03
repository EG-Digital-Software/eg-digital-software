import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/store/auth';
import { adminApi } from '@/api/resources';
import type { TaskApi } from '@/api/tasks';

// ── "New activity" seen-state, shared by the task board and the sidebar ──────
// What a user has already seen is kept per user in localStorage: one map per
// board (task id → activity signature at the time it was opened). Writes go
// through writeSeen() so other components in this tab (the sidebar Tasks dot)
// hear about them; the native `storage` event covers other tabs.

const SEEN_EVENT = 'task-seen-change';

export function writeSeen(key: string, value: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
  // Deferred: callers may write from inside a state updater, where updating
  // another component synchronously isn't allowed.
  queueMicrotask(() => window.dispatchEvent(new Event(SEEN_EVENT)));
}

export function readSeen(key: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/** Bumps whenever any seen-map changes (this tab or another), so readers re-read. */
function useSeenVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(SEEN_EVENT, bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener(SEEN_EVENT, bump);
      window.removeEventListener('storage', bump);
    };
  }, []);
  return version;
}

export const taskRowSeenKey = (meId: string | undefined, scopeKey: string) => `taskRowSeen:v2:${meId ?? 'anon'}:${scopeKey}`;

/** The activity fields of a task — what the board and the admin activity feed both carry. */
export interface ActivityTask {
  id: string;
  createdAt?: string;
  createdById?: string | null;
  comments?: { createdAt: string; authorId: string }[];
  notes?: { createdAt: string; authorId: string }[];
  attachments?: { createdAt: string; uploadedById?: string | null }[];
  approvals?: { createdAt: string; requestedById: string; decidedAt?: string | null; decidedById?: string | null; status: string }[];
}

export type TaskActivityMeta = Record<string, { sig: string; lastActor: string | null; lastTs: string }>;

/**
 * For each task: a signature of its activity (task creation + comments, notes,
 * attachments, approval requests/decisions), WHO did the most recent one and
 * when. Every event carries an actor, so everyone except the person who made
 * the change can be notified.
 */
export function taskActivityMeta(tasks: ActivityTask[]): TaskActivityMeta {
  const map: TaskActivityMeta = {};
  for (const t of tasks) {
    const events: { ts: string; actor: string | null }[] = [];
    if (t.createdAt) events.push({ ts: t.createdAt, actor: t.createdById ?? null });
    for (const c of t.comments ?? []) events.push({ ts: c.createdAt, actor: c.authorId });
    for (const n of t.notes ?? []) events.push({ ts: n.createdAt, actor: n.authorId });
    for (const a of t.attachments ?? []) events.push({ ts: a.createdAt, actor: a.uploadedById ?? null });
    for (const ap of t.approvals ?? []) {
      events.push({ ts: ap.createdAt, actor: ap.requestedById });
      if (ap.decidedAt) events.push({ ts: ap.decidedAt, actor: ap.decidedById ?? null });
    }
    let last = events[0];
    for (const e of events) if (e.ts > (last?.ts ?? '')) last = e;
    // Approval statuses are folded in so reopen/decision also changes the sig.
    const sig = `${events.length}:${last?.ts ?? ''}:${(t.approvals ?? []).map((a) => a.status).join(',')}`;
    map[t.id] = { sig, lastActor: last?.actor ?? null, lastTs: last?.ts ?? '' };
  }
  return map;
}

/**
 * True when a task has activity this user hasn't opened: its signature changed
 * since they last opened it, or they never opened it at all — unless the latest
 * change was their own.
 */
export function isTaskUnseen(
  id: string,
  m: TaskActivityMeta[string],
  seen: Record<string, string> | null,
  meId: string | undefined
) {
  if (m.lastActor === meId) return false;
  return seen?.[id] !== m.sig;
}

/**
 * Sidebar dot for the client/employee portals: true while any task on the
 * user's board has activity they haven't opened (same rule as the red dot on
 * the task rows). Shares the board query with the Tasks page.
 */
export function useBoardHasNewActivity(api: TaskApi, scopeKey: string, enabled = true) {
  const meId = useAuth((s) => s.user?.id);
  const { data: board } = useQuery({
    queryKey: ['tasks', scopeKey],
    queryFn: () => api.board(),
    enabled: enabled && !!meId,
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
  });
  const version = useSeenVersion();
  return useMemo(() => {
    if (!enabled || !meId || !board) return false;
    const meta = taskActivityMeta(board.buckets.flatMap((b) => b.tasks));
    const seen = readSeen(taskRowSeenKey(meId, scopeKey));
    return Object.entries(meta).some(([id, m]) => isTaskUnseen(id, m, seen, meId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, enabled, meId, scopeKey, version]);
}

/**
 * Admin: which companies have tasks with activity this admin hasn't opened,
 * whoever made it (client or employee). Drives the sidebar Tasks dot and the
 * per-company dot on the Tasks picker; a company clears only once every
 * flagged task in it has been opened.
 */
export function useAdminTaskActivity() {
  const meId = useAuth((s) => s.user?.id);
  const { data: tasks } = useQuery({
    queryKey: ['admin', 'task-activity', 'tasks'],
    queryFn: () => adminApi.taskActivityByTask(),
    enabled: !!meId,
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
  });
  const version = useSeenVersion();
  const companies = useMemo(() => {
    const out = new Set<string>();
    if (!meId || !tasks) return out;
    const byClient = new Map<string, ActivityTask[]>();
    for (const t of tasks) byClient.set(t.clientId, [...(byClient.get(t.clientId) ?? []), t]);
    for (const [clientId, list] of byClient) {
      // Admin boards are scoped per customer by clientId (see TaskBoard scopeKey).
      const seen = readSeen(taskRowSeenKey(meId, clientId));
      const meta = taskActivityMeta(list);
      if (Object.entries(meta).some(([id, m]) => isTaskUnseen(id, m, seen, meId))) out.add(clientId);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, meId, version]);
  return { any: companies.size > 0, companyHasNew: (clientId: string) => companies.has(clientId) };
}
