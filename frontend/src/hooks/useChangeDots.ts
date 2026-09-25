import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store/auth';
import { sectionSeenApi, type SeenState } from '@/api/sectionSeen';

const KEY = ['section-seen'] as const;

/**
 * Client side of the red change-dots. Loads the viewer's acknowledged signatures
 * plus the server-computed sidebar-tab signatures, and exposes:
 *
 *  - `isTabNew(route)`  — a sidebar tab has changes the user hasn't opened yet.
 *  - `isNew(key, sig)`  — a section/row (whose signature the page computes from
 *                         its own data) has changed since last acknowledged.
 *  - `markSeen` / `markTabSeen` — acknowledge, clearing the dot (optimistic +
 *                         batched POST, so opening a page doesn't spam the API).
 *
 * Acknowledgements live server-side (SectionSeen), so a dot cleared on one device
 * clears on the user's other devices too.
 */
export function useChangeDots(tabRoutes?: string[]) {
  const qc = useQueryClient();
  const authed = useAuth((s) => !!s.accessToken);
  const location = useLocation();

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: sectionSeenApi.state,
    enabled: authed,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const seen = data?.seen ?? {};
  const tabs = data?.tabs ?? {};

  const pending = useRef<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    const items = Object.entries(pending.current).map(([key, sig]) => ({ key, sig }));
    pending.current = {};
    if (items.length === 0) return;
    sectionSeenApi
      .mark(items)
      .then(() => qc.invalidateQueries({ queryKey: KEY }))
      .catch(() => {
        /* transient — the next open will re-acknowledge */
      });
  }, [qc]);

  const markSeen = useCallback(
    (key: string, sig?: string | null) => {
      if (!sig) return;
      const cur = qc.getQueryData<SeenState>(KEY);
      if (cur?.seen[key] === sig) return; // already acknowledged → no work, no loop
      qc.setQueryData<SeenState>(KEY, (prev) => {
        const base = prev ?? { seen: {}, tabs: {} };
        return { ...base, seen: { ...base.seen, [key]: sig } };
      });
      pending.current[key] = sig;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [qc, flush]
  );

  const isNew = useCallback(
    (key: string, sig?: string | null) => !!sig && seen[key] !== sig,
    [seen]
  );
  const isTabNew = useCallback(
    (route: string) => {
      const sig = tabs[route];
      return !!sig && seen[route] !== sig;
    },
    [tabs, seen]
  );
  const markTabSeen = useCallback((route: string) => markSeen(route, tabs[route]), [tabs, markSeen]);

  // When sidebar routes are supplied, opening a tab (or a page under it) clears
  // that tab's dot automatically.
  useEffect(() => {
    if (!tabRoutes) return;
    const active = tabRoutes.find(
      (r) => location.pathname === r || location.pathname.startsWith(`${r}/`)
    );
    if (active) markTabSeen(active);
    // markSeen guards against redundant writes, so re-running on tab refetch is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, tabs, tabRoutes]);

  return { seen, tabs, isNew, isTabNew, markSeen, markTabSeen };
}
