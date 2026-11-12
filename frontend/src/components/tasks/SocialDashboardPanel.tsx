import { useMemo } from 'react';
import dashboardHtml from './social-dashboard.html?raw';

/**
 * Social Media Dashboard tab — the standalone dashboard page, shown as it is
 * inside the task. The page is kept untouched in social-dashboard.html; only
 * three things are adjusted when it is loaded here:
 *  - its own mock tab bar is hidden (the task form already has the tabs),
 *  - figures entered through "Update data" are kept per task, and
 *  - a client does not get the team-only view or the "Update data" button.
 */
function buildDocument(taskId: string, isClient: boolean): string {
  const hide = ['#tabs', '#shareBtn', ...(isClient ? ['.viewbar', '#updateBtn'] : [])];
  const style = `<style>${hide.join(',')}{display:none!important}</style>`;
  // The id only ever feeds a storage key; keep it to characters safe inside the script.
  const key = taskId.replace(/[^A-Za-z0-9_-]/g, '');
  return dashboardHtml
    .replace("const KEY='egeloma-dashboard-v2'", `const KEY='egeloma-dashboard-v2:${key}'`)
    .replace("const IKEY='egeloma-insights-v1'", `const IKEY='egeloma-insights-v1:${key}'`)
    .replace('</head>', `${style}</head>`);
}

export default function SocialDashboardPanel({ taskId, isClient }: { taskId: string; isClient: boolean }) {
  const doc = useMemo(() => buildDocument(taskId, isClient), [taskId, isClient]);
  return (
    <iframe
      title="Social Media Dashboard"
      srcDoc={doc}
      className="mt-5 w-full rounded-xl border border-border bg-white"
      style={{ height: '78vh', minHeight: 520 }}
    />
  );
}
