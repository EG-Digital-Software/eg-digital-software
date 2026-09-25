import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { notificationApi } from '@/api/notifications';
import { useAuth } from '@/store/auth';

/**
 * Drives the little red "something new here" dot on sidebar tabs.
 *
 * A tab lights up when there is a notification (the same feed behind the top-bar
 * bell) whose link falls under that tab's route and is newer than the last time
 * the user opened that tab. "Last opened" is tracked per user in localStorage, so
 * this needs no backend and never touches the bell's own read/unread state.
 * Navigating to a tab clears its dot.
 */
const STORAGE_KEY = 'sidebar-tab-seen';

type SeenMap = Record<string, string>; // route -> ISO timestamp last opened

function storageKey(userId: string) {
  return `${STORAGE_KEY}:${userId}`;
}

function loadSeen(userId: string): SeenMap {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

export function useTabAlerts(routes: string[]) {
  const userId = useAuth((s) => s.user?.id) ?? 'anon';
  const location = useLocation();

  // Shares the ['notifications'] cache with the top-bar bell — no extra fetch.
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationApi.list,
    refetchInterval: 30_000,
  });
  const items = data?.items ?? [];

  const [seen, setSeen] = useState<SeenMap>(() => loadSeen(userId));
  useEffect(() => {
    setSeen(loadSeen(userId));
  }, [userId]);

  // Newest notification (epoch ms) whose link sits under each route.
  const latest = useMemo(() => {
    const map: Record<string, number> = {};
    for (const n of items) {
      if (!n.link) continue;
      const at = new Date(n.createdAt).getTime();
      if (Number.isNaN(at)) continue;
      for (const route of routes) {
        if (n.link === route || n.link.startsWith(`${route}/`) || n.link.startsWith(route)) {
          if (!map[route] || at > map[route]) map[route] = at;
        }
      }
    }
    return map;
  }, [items, routes]);

  const markSeen = useCallback(
    (route: string) => {
      setSeen((prev) => {
        const stamp = new Date(latest[route] ?? Date.now()).toISOString();
        if (prev[route] === stamp) return prev; // no change → avoid a render loop
        const next = { ...prev, [route]: stamp };
        try {
          localStorage.setItem(storageKey(userId), JSON.stringify(next));
        } catch {
          /* private mode / quota — dot just won't persist */
        }
        return next;
      });
    },
    [latest, userId]
  );

  // Opening a tab (or a page under it) clears that tab's dot.
  useEffect(() => {
    const active = routes.find(
      (route) => location.pathname === route || location.pathname.startsWith(`${route}/`)
    );
    if (active) markSeen(active);
    // markSeen is stable enough; re-run when the route or the newest items change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, latest]);

  const hasAlert = useCallback(
    (route: string) => {
      const at = latest[route];
      if (!at) return false;
      const seenAt = seen[route] ? new Date(seen[route]).getTime() : 0;
      return at > seenAt;
    },
    [latest, seen]
  );

  return { hasAlert };
}
