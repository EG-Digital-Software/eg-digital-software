// ── "New feature" announcements in the task form ─────────────────────────────
// When a new feature ships in the task form (a tab, a tool), add it here. Each
// user sees it once in the task's "What's new" box — "New feature "Time Sheet"
// added — by admin" — and then it is remembered as seen for them (localStorage,
// per user). Entries older than SHOW_DAYS are no longer announced.

export type FeatureTab = 'details' | 'attachments' | 'approval' | 'access' | 'performance' | 'archive' | 'timesheet';

export interface FeatureUpdate {
  /** Stable id — never reuse or change it, or users see it again. */
  id: string;
  /** Shown in quotes: New feature "<name>" added. */
  name: string;
  /** Release date (YYYY-MM-DD). */
  addedAt: string;
  /** Tab the "View" link opens, if the feature lives on one. */
  tab?: FeatureTab;
}

export const FEATURE_UPDATES: FeatureUpdate[] = [
  { id: 'task-timesheet', name: 'Time Sheet', addedAt: '2026-10-19', tab: 'timesheet' },
];

const SHOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const seenKey = (meId: string) => `featureSeen:v1:${meId}`;

function readSeenIds(meId: string): string[] {
  try {
    const raw = localStorage.getItem(seenKey(meId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Recent features this user hasn't been told about yet, newest first. */
export function unseenFeatures(meId: string | undefined): FeatureUpdate[] {
  if (!meId) return [];
  const seen = new Set(readSeenIds(meId));
  const cutoff = Date.now() - SHOW_DAYS * DAY_MS;
  return FEATURE_UPDATES.filter((f) => !seen.has(f.id) && new Date(f.addedAt).getTime() >= cutoff).sort((a, b) =>
    b.addedAt.localeCompare(a.addedAt)
  );
}

/** Remember these features as announced to this user. */
export function markFeaturesSeen(meId: string | undefined, ids: string[]) {
  if (!meId || ids.length === 0) return;
  try {
    const next = [...new Set([...readSeenIds(meId), ...ids])];
    localStorage.setItem(seenKey(meId), JSON.stringify(next));
  } catch {
    /* ignore — it will just be announced again */
  }
}
