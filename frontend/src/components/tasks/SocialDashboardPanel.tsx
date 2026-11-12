import { useEffect, useRef } from 'react';
import dashboardHtml from './social-dashboard.html?raw';
import type { taskApi } from '@/api/tasks';
import { apiErrorMessage } from '@/api/client';
import { mediaUrl } from '@/lib/utils';

type TaskApi = ReturnType<typeof taskApi>;

/** Post pictures stored locally come back as "/uploads/…" — make them absolute for the frame. */
function withMediaUrls(result: unknown): unknown {
  const r = result as { posts?: { img?: string | null }[] } | null;
  if (!r || !Array.isArray(r.posts)) return result;
  return { ...r, posts: r.posts.map((p) => ({ ...p, img: mediaUrl(p.img) ?? null })) };
}

/**
 * Social Media Dashboard tab — the dashboard page (social-dashboard.html, kept as
 * one self-contained page with its own design) runs in a frame. It has no data
 * of its own: it asks the portal for everything over postMessage, and the portal
 * answers by calling the API with the signed-in user's session. Figures come
 * from the customer's connected accounts or from what the team entered.
 */
export default function SocialDashboardPanel({ api, taskId }: { api: TaskApi; taskId: string }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      const m = e.data as { __sd?: boolean; id?: number; type?: string; payload?: Record<string, unknown> } | null;
      if (!win || e.source !== win || !m?.__sd || typeof m.id !== 'number') return;
      const p = m.payload ?? {};
      try {
        let result: unknown;
        switch (m.type) {
          case 'load':
            result = await api.socialDashboard(taskId);
            break;
          case 'sync':
            result = await api.syncSocial(taskId);
            break;
          case 'save':
            result = await api.saveSocialDashboard(taskId, p);
            break;
          case 'saveMetrics':
            result = await api.saveSocialMetrics(taskId, Array.isArray(p.rows) ? p.rows : []);
            break;
          case 'connect':
            result = await api.connectSocial(taskId, String(p.provider ?? ''));
            break;
          case 'select': {
            const { id, ...body } = p;
            result = await api.selectSocialAccounts(taskId, String(id ?? ''), body);
            break;
          }
          case 'disconnect':
            result = await api.disconnectSocial(taskId, String(p.id ?? ''));
            break;
          default:
            throw new Error('Unknown request');
        }
        win.postMessage({ __sdr: true, id: m.id, ok: true, result: withMediaUrls(result) }, '*');
      } catch (err) {
        win.postMessage({ __sdr: true, id: m.id, ok: false, error: apiErrorMessage(err) }, '*');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [api, taskId]);

  return (
    <iframe
      ref={frame}
      key={taskId}
      title="Social Media Dashboard"
      srcDoc={dashboardHtml}
      // Runs edge to edge: cancels the task body's side padding (p-4 / sm:p-6).
      className="-mx-4 mt-5 block w-[calc(100%+2rem)] border-y border-border bg-white sm:-mx-6 sm:w-[calc(100%+3rem)]"
      style={{ height: '78vh', minHeight: 520 }}
    />
  );
}
