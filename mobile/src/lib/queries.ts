import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { focusManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useScope } from '../context/ScopeContext';
import { CHAT_POLL_MS, LIST_POLL_MS } from '../config';
import type { Task, TaskBoard } from '../api/types';

// Pause polling while the app is in the background; refetch on return.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (s) => handleFocus(s === 'active'));
  return () => sub.remove();
});

/** A task plus the column (or, for team members, the customer) it sits under. */
export type BoardTask = Task & { groupName: string };

export function useBoard() {
  const { api, scopeKey } = useScope();
  const q = useQuery({
    queryKey: ['board', scopeKey],
    queryFn: () => api!.board(),
    enabled: !!api,
    refetchInterval: LIST_POLL_MS,
  });
  const tasks = useMemo<BoardTask[]>(
    () => (q.data?.buckets ?? []).flatMap((b) => b.tasks.map((t) => ({ ...t, groupName: b.name }))),
    [q.data]
  );
  return { ...q, tasks };
}

/**
 * One task, polled while its screen is open so new chat messages appear
 * (the web dialog polls every 2s). Seeded from the board so it opens instantly.
 */
export function useTask(taskId: string, { poll = true }: { poll?: boolean } = {}) {
  const { api, scopeKey } = useScope();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['task', scopeKey, taskId],
    queryFn: () => api!.getTask(taskId),
    enabled: !!api,
    refetchInterval: poll ? CHAT_POLL_MS : false,
    initialData: () =>
      qc
        .getQueryData<TaskBoard>(['board', scopeKey])
        ?.buckets.flatMap((b) => b.tasks)
        .find((t) => t.id === taskId),
    initialDataUpdatedAt: () => qc.getQueryState(['board', scopeKey])?.dataUpdatedAt,
  });

  // Keep the board list in step with the freshest copy of this task.
  useEffect(() => {
    const fresh = q.data;
    if (!fresh) return;
    qc.setQueryData<TaskBoard>(['board', scopeKey], (board) =>
      board
        ? { ...board, buckets: board.buckets.map((b) => ({ ...b, tasks: b.tasks.map((t) => (t.id === fresh.id ? fresh : t)) })) }
        : board
    );
  }, [q.data, qc, scopeKey]);

  return q;
}

/** Replace the cached copy of a task after a mutation returns it. */
export function useSetTask() {
  const { scopeKey } = useScope();
  const qc = useQueryClient();
  return (task: Task) => qc.setQueryData(['task', scopeKey, task.id], task);
}

export function useRefetchTask(taskId: string) {
  const { scopeKey } = useScope();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['task', scopeKey, taskId] });
}
