import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Task } from '../api/types';

/**
 * Per-device "read up to" marker for each task chat: the id of the last
 * message the user has seen. Kept on the phone only (the web app likewise keeps
 * its seen-state in the browser) — nothing is written to the database.
 */
type SeenMap = Record<string, string>;

let storageKey: string | null = null;
let seen: SeenMap = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadSeen(userId: string | null) {
  storageKey = userId ? `eg:seen:${userId}` : null;
  seen = {};
  if (storageKey) {
    try {
      seen = JSON.parse((await AsyncStorage.getItem(storageKey)) ?? '{}') as SeenMap;
    } catch {
      seen = {};
    }
  }
  emit();
}

export function markSeen(task: Task) {
  const last = task.comments[task.comments.length - 1];
  if (!last || seen[task.id] === last.id) return;
  seen = { ...seen, [task.id]: last.id };
  emit();
  if (storageKey) AsyncStorage.setItem(storageKey, JSON.stringify(seen)).catch(() => undefined);
}

/** Messages from other people after the user's read marker on this device. */
export function unreadCount(task: Task, meId?: string): number {
  const marker = seen[task.id];
  let from: number;
  if (!marker) {
    // Never opened on this device: only flag the latest few, so a fresh install
    // doesn't light up every old conversation.
    from = Math.max(0, task.comments.length - 3);
  } else {
    const idx = task.comments.findIndex((c) => c.id === marker);
    from = idx >= 0 ? idx + 1 : 0;
  }
  return task.comments.slice(from).filter((c) => c.authorId !== meId).length;
}

/** Re-render when read markers change. */
export function useSeenVersion() {
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
