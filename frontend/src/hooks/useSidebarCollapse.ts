import { useEffect, useState } from 'react';

const KEY = 'sidebarCollapsed';

/**
 * Desktop sidebar collapse state, shared across every portal shell and remembered
 * between visits. Toggling slides the sidebar out and reclaims its width; the
 * mobile drawer is unaffected (it has its own open state).
 */
export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore storage failures (private mode, etc.) */
    }
  }, [collapsed]);

  return { collapsed, toggle: () => setCollapsed((c) => !c) };
}
