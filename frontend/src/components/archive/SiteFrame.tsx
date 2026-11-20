import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ExternalLink, Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FrameBadgeTone = 'archived' | 'live' | 'before' | 'after';

const BADGE: Record<FrameBadgeTone, string> = {
  archived: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  before: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  live: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  after: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
};

export function FrameBadge({ tone, children, className }: { tone: FrameBadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide', BADGE[tone], className)}>
      {children}
    </span>
  );
}

/**
 * A browser-window frame around a website: dots, Back, an address bar with a
 * status badge, an optional row of page shortcuts, then the page itself.
 *
 * Archived snapshots load sandboxed WITHOUT same-origin, so the saved site's
 * scripts can run but can't reach the portal. Each archived page carries a
 * tiny bridge (added when the ZIP is unpacked) that reports which page is
 * showing and steps back on request — that's how the address bar and Back
 * button follow clicks inside the site.
 */
export function SiteFrame({
  src,
  address,
  badge,
  leadingBadge,
  live = false,
  siteBase,
  onNavigate,
  pages,
  currentPage,
  onPickPage,
  pagesLead,
  height = 560,
  children,
  className,
  openUrl,
}: {
  /** Shows an "open in a new tab" button for this address. */
  openUrl?: string | null;
  /** Page to load in the frame; omit to show `children` instead. */
  src?: string | null;
  address: string;
  /** Badge at the end of the address bar (e.g. ARCHIVED). */
  badge?: { tone: FrameBadgeTone; label: string };
  /** Badge before the address bar (e.g. BEFORE / AFTER). */
  leadingBadge?: { tone: FrameBadgeTone; label: string };
  /** A live external site (not an archived snapshot). */
  live?: boolean;
  /** Archived site folder URL — turns the bridge's page reports into site-relative paths. */
  siteBase?: string;
  onNavigate?: (relPath: string) => void;
  pages?: { path: string; title: string }[];
  currentPage?: string;
  onPickPage?: (path: string) => void;
  /** Left side of the pages row (e.g. a page count). */
  pagesLead?: ReactNode;
  height?: number | string;
  children?: ReactNode;
  className?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The src whose page has shown — the loading veil lifts as soon as the page's
  // content is in (the bridge reports it), not after every image has arrived.
  const [shown, setShown] = useState<string | null>(null);
  const loading = !!src && shown !== src;

  // Follow navigation inside an archived snapshot.
  useEffect(() => {
    if (!src) return;
    let basePath = '';
    try {
      basePath = siteBase ? new URL(siteBase, window.location.href).pathname : '';
    } catch {
      basePath = '';
    }
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as { egSite?: string; path?: string } | null;
      if (!d || d.egSite !== 'nav' || typeof d.path !== 'string') return;
      setShown(src);
      if (!basePath || !onNavigate) return;
      let path = d.path;
      try {
        path = decodeURIComponent(path);
      } catch {
        /* keep raw */
      }
      const base = decodeURIComponent(basePath);
      if (path.startsWith(base)) onNavigate(path.slice(base.length));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [src, siteBase, onNavigate]);

  const goBack = () => {
    // Archived pages step back via their bridge; a live cross-origin site can't be driven.
    frameRef.current?.contentWindow?.postMessage({ egSite: 'back' }, '*');
  };

  return (
    <div className={cn('flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-sm', className)}>
      <div className="flex items-center gap-2.5 border-b border-border bg-secondary/60 px-3.5 py-2.5">
        {leadingBadge ? (
          <FrameBadge tone={leadingBadge.tone}>{leadingBadge.label}</FrameBadge>
        ) : (
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        {!live && src && (
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            title="Back"
            className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex h-[30px] min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-background px-3 text-[13px] text-muted-foreground">
          <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate" title={address}>
            {address}
          </span>
          {badge && <FrameBadge tone={badge.tone} className="ml-auto">{badge.label}</FrameBadge>}
        </div>
        {(openUrl ?? (live ? src : null)) && (
          <a
            href={(openUrl ?? src)!}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the live site in a new tab"
            className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {pages && pages.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          {pagesLead ?? <span />}
          <nav aria-label="Pages" className="flex flex-wrap gap-1">
            {pages.map((p) => {
              const on = p.path === currentPage;
              return (
                <button
                  key={p.path}
                  type="button"
                  onClick={() => onPickPage?.(p.path)}
                  aria-current={on ? 'page' : undefined}
                  title={p.path}
                  className={cn(
                    'min-h-[34px] max-w-[200px] truncate rounded-lg px-3.5 text-sm transition',
                    on ? 'bg-primary font-semibold text-primary-foreground' : 'font-medium text-muted-foreground hover:bg-secondary'
                  )}
                >
                  {p.title}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      <div className="relative bg-white" style={{ height }}>
        {src ? (
          <iframe
            key={src}
            ref={frameRef}
            src={src}
            title={address}
            className="absolute inset-0 h-full w-full border-0"
            // Archived: scripts run, but in an opaque origin (no portal cookies or storage).
            sandbox={
              live
                ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox'
                : 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox'
            }
            referrerPolicy="no-referrer"
            onLoad={() => setShown(src)}
          />
        ) : (
          children
        )}
        {loading && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/85 text-sm text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
            Loading website…
          </div>
        )}
      </div>
    </div>
  );
}
