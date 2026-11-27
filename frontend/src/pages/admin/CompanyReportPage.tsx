import { useEffect, useRef } from 'react';
import reportHtml from '@/assets/reports/eg-eloma-report.html?raw';
import { api, apiErrorMessage } from '@/api/client';
import type { ApiEnvelope } from '@/types';
import { mediaUrl } from '@/lib/utils';

const BASE = '/admin/marketing/social';
const get = async <T,>(p: Promise<{ data: ApiEnvelope<T> }>) => (await p).data.data;

/** Post pictures stored locally come back as "/uploads/…" — make them absolute for the frame. */
function withMediaUrls(result: unknown): unknown {
  const r = result as { data?: Record<string, { posts?: { img?: string | null }[] }> } | null;
  if (!r?.data) return result;
  const data = Object.fromEntries(
    Object.entries(r.data).map(([k, v]) => [k, { ...v, posts: (v.posts ?? []).map((p) => ({ ...p, img: mediaUrl(p.img) ?? null })) }])
  );
  return { ...r, data };
}

/**
 * Marketing and Cloud admin tabs — EG Eloma's own report (eg-eloma-report.html,
 * one self-contained page with its own design, kept as supplied) runs in a frame.
 * `view` picks which part opens: the Marketing report or Azure Performance.
 *
 * Marketing: the frame asks the portal over postMessage for Eloma Group's own
 * social accounts and figures (Admin → Marketing API); the portal answers with
 * the signed-in admin's session. Never a client's data.
 */
export default function CompanyReportPage({ view }: { view: 'mkt' | 'azure' }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = reportHtml.replace('<body>', `<body data-view="${view}">`);

  useEffect(() => {
    if (view !== 'mkt') return;
    const onMessage = async (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      const m = e.data as { __mk?: boolean; id?: number; type?: string; payload?: Record<string, unknown> } | null;
      if (!win || e.source !== win || !m?.__mk || typeof m.id !== 'number') return;
      const p = m.payload ?? {};
      try {
        let result: unknown;
        switch (m.type) {
          case 'load':
            result = await get(api.get(BASE));
            break;
          case 'sync':
            result = await get(api.post(`${BASE}/sync`, {}, { timeout: 180_000 }));
            break;
          case 'connect':
            result = await get(api.post(`${BASE}/connect/${encodeURIComponent(String(p.provider ?? ''))}`, {}));
            break;
          case 'link': {
            const { company, provider, ...body } = p;
            result = await get(
              api.put(`${BASE}/links/${encodeURIComponent(String(company ?? ''))}/${encodeURIComponent(String(provider ?? ''))}`, body, { timeout: 180_000 })
            );
            break;
          }
          case 'disconnect':
            result = await get(api.delete(`${BASE}/connections/${encodeURIComponent(String(p.id ?? ''))}`));
            break;
          default:
            throw new Error('Unknown request');
        }
        win.postMessage({ __mkr: true, id: m.id, ok: true, result: withMediaUrls(result) }, '*');
      } catch (err) {
        win.postMessage({ __mkr: true, id: m.id, ok: false, error: apiErrorMessage(err) }, '*');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [view]);

  return (
    <div className="ec-page">
      <iframe
        ref={frame}
        key={view}
        title={view === 'azure' ? 'Cloud report' : 'Marketing report'}
        srcDoc={html}
        className="w-full rounded-xl border border-border bg-white"
        style={{ height: 'calc(100dvh - 120px)', minHeight: 560 }}
      />
    </div>
  );
}
