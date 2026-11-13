import { useEffect, useRef } from 'react';
import reportHtml from './report-dashboard.html?raw';
import type { ReportKind, taskApi } from '@/api/tasks';
import { apiErrorMessage } from '@/api/client';

type TaskApi = ReturnType<typeof taskApi>;

const TITLE: Record<ReportKind, string> = {
  seo: 'SEO Dashboard',
  local: 'Local Listing',
  azure: 'Azure Performance',
};

/**
 * SEO Dashboard, Local Listing and Azure Performance tabs — one report page
 * (report-dashboard.html, self-contained with its own design) runs in a frame
 * and shows the report named by `kind`. It has no data of its own: it asks the
 * portal over postMessage, and the portal answers by calling the API with the
 * signed-in user's session. Everything shown was entered by the team.
 */
export default function ReportDashboardPanel({ api, taskId, kind }: { api: TaskApi; taskId: string; kind: ReportKind }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      const m = e.data as { __rd?: boolean; id?: number; type?: string; payload?: Record<string, unknown> } | null;
      if (!win || e.source !== win || !m?.__rd || typeof m.id !== 'number') return;
      try {
        let result: unknown;
        switch (m.type) {
          case 'load':
            result = await api.reportDashboard(taskId, kind);
            break;
          case 'save':
            result = await api.saveReportDashboard(taskId, kind, m.payload ?? {});
            break;
          default:
            throw new Error('Unknown request');
        }
        win.postMessage({ __rdr: true, id: m.id, ok: true, result }, '*');
      } catch (err) {
        win.postMessage({ __rdr: true, id: m.id, ok: false, error: apiErrorMessage(err) }, '*');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [api, taskId, kind]);

  return (
    <iframe
      ref={frame}
      key={`${taskId}:${kind}`}
      title={TITLE[kind]}
      srcDoc={reportHtml}
      className="mt-5 w-full rounded-xl border border-border bg-white"
      style={{ height: '78vh', minHeight: 520 }}
    />
  );
}
