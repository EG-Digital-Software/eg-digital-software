import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Download, Eye, FileText, Film, Globe, Image as ImageIcon, Link2, Play, Search, X } from 'lucide-react';
import { adminApi, type ArchiveFile, type Showcase, type ShowcaseArchive } from '@/api/resources';
import { PageHeader } from '@/components/shared/misc';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/shared/states';
import { SiteFrame } from '@/components/archive/SiteFrame';
import { SiteShot } from '@/components/archive/SiteShot';
import { UrlPanel } from '@/components/archive/UrlPanel';
import { isWaybackUrl, siteHostOf } from '@/lib/siteLinks';
import {
  hostOf,
  isHtmlFile,
  isZipFile,
  livePathOf,
  siteNameOf,
  useArchiveSite,
  type SiteState,
} from '@/lib/archiveSite';
import { customerName } from '@/lib/customer';
import { cn, downloadFile, formatDate, mediaUrl } from '@/lib/utils';

type View = 'showcase' | 'files';

/**
 * Preview — two tabs:
 *  • Website showcases: a client's old website (archived snapshot) next to the
 *    new one, page by page, for before-and-after marketing.
 *  • All archived files: every file put in any task's Archive tab.
 */
export default function PreviewPage() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'files' ? 'files' : 'showcase';
  const setView = (v: View) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === 'files') n.set('view', 'files');
        else n.delete('view');
        return n;
      },
      { replace: true }
    );

  return (
    <div className="ec-page">
      <PageHeader
        eyebrow="Admin"
        title="Preview"
        description="Every file archived on a task, in one place — and before-and-after website showcases for marketing."
        actions={
          <div className="segs" role="tablist" aria-label="Preview view">
            {(
              [
                ['showcase', 'Website showcases'],
                ['files', 'All archived files'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} className={`seg${view === id ? ' on' : ''}`} onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </div>
        }
      />
      {view === 'showcase' ? <ShowcasesView /> : <FilesView />}
    </div>
  );
}

/* ─────────────────────────── Website showcases ─────────────────────────── */

const archiveAsFile = (a: ShowcaseArchive) => ({ url: a.url, fileName: a.fileName, contentType: a.contentType, createdAt: a.createdAt });
const showcaseName = (s: Showcase) => customerName(s);
const showcaseDomain = (s: Showcase) =>
  s.newSiteUrl ? hostOf(s.newSiteUrl) : s.oldSiteUrl ? siteHostOf(s.oldSiteUrl) : s.oldArchive ? siteNameOf(s.oldArchive.fileName) : s.newArchive ? siteNameOf(s.newArchive.fileName) : '—';

function StatusChip({ status }: { status: Showcase['status'] }) {
  return (
    <span className={status === 'PUBLISHED' ? 'chip c-ok' : 'chip c-ns'} style={{ padding: '2px 8px', fontSize: 11 }}>
      {status === 'PUBLISHED' ? 'Published' : 'Draft'}
    </span>
  );
}

function ShowcasesView() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState('');
  const [status, setStatus] = useState('');

  const q = useQuery({ queryKey: ['admin', 'preview', 'showcases'], queryFn: adminApi.showcases });
  const { data: customerList = [] } = useQuery({ queryKey: ['admin', 'preview', 'customers'], queryFn: adminApi.previewCustomers });
  const showcases = useMemo(() => q.data ?? [], [q.data]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return showcases.filter(
      (x) =>
        (!customer || x.clientId === customer) &&
        (!status || x.status === status) &&
        (!s ||
          [showcaseName(x), showcaseDomain(x), x.title, x.taskNumber ?? '', x.taskTitle ?? '', x.oldSiteUrl ?? '', x.newSiteUrl ?? '']
            .some((v) => v.toLowerCase().includes(s)))
    );
  }, [showcases, search, customer, status]);

  const selectedId = params.get('showcase');
  const selected = shown.find((x) => x.id === selectedId) ?? shown[0] ?? null;
  const select = (id: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('showcase', id);
        return n;
      },
      { replace: true }
    );

  const customers = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of customerList) names.set(c.clientId, customerName(c));
    for (const s of showcases) if (!names.has(s.clientId)) names.set(s.clientId, customerName(s));
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [customerList, showcases]);

  return (
    <section className="glass up" style={{ animationDelay: '.12s', overflow: 'hidden' }}>
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center" style={{ borderBottom: '1px solid rgba(var(--w),.06)' }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search showcases"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client, website or task…"
            className="pl-9"
          />
        </div>
        <Select aria-label="Customer" value={customer} onChange={(e) => setCustomer(e.target.value)} className="lg:w-56">
          <option value="">All customers</option>
          {customers.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="lg:w-48">
          <option value="">All showcases</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
        </Select>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {q.isLoading ? (
          <LoadingBlock label="Loading showcases…" />
        ) : q.isError ? (
          <ErrorState onRetry={q.refetch} />
        ) : (
          <>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {shown.map((s) => (
                <ShowcaseCard key={s.id} showcase={s} on={s.id === selected?.id} onPick={() => select(s.id)} />
              ))}
            </div>

            {!shown.length && (
              <p className="text-center text-sm text-muted-foreground">
                {showcases.length
                  ? 'No websites match — try a different search or filter.'
                  : 'No websites yet. Add the old and new website links in a task’s Archive tab — they show here side by side.'}
              </p>
            )}

            {selected && (
              <ShowcaseViewer key={selected.id} showcase={selected} />
            )}
          </>
        )}
      </div>

    </section>
  );
}

function ShowcaseCard({ showcase: s, on, onPick }: { showcase: Showcase; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={cn(
        'flex flex-col gap-2.5 rounded-xl bg-card p-3 text-left shadow-sm transition',
        on ? 'border-2 border-primary' : 'border border-border hover:border-primary/40'
      )}
    >
      <div className="grid grid-cols-2 gap-1.5">
        <ThumbBox url={s.oldSiteUrl} archive={s.oldArchive} tone="before" />
        <ThumbBox url={s.newSiteUrl} archive={s.newArchive} tone="after" />
      </div>
      <div className="truncate text-[15px] font-semibold text-foreground" data-private>
        {showcaseName(s)}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{showcaseDomain(s)}</span>
        {s.taskNumber ? <span className="mono shrink-0">{s.taskNumber}</span> : <StatusChip status={s.status} />}
      </div>
    </button>
  );
}

/** A BEFORE/AFTER thumbnail: a screenshot of the link, or the archived copy's picture. */
function ThumbBox({ url, archive, tone }: { url?: string | null; archive?: ShowcaseArchive | null; tone: 'before' | 'after' }) {
  const site = useArchiveSite(!url && archive ? archiveAsFile(archive) : null);
  const archiveThumb = site.status === 'ready' && site.manifest.thumb ? site.base + encodeURI(site.manifest.thumb) : null;
  return (
    <div
      className={cn(
        'relative h-[92px] overflow-hidden rounded-lg border',
        tone === 'before' ? 'border-border bg-secondary/70' : 'border-primary/20 bg-primary/10'
      )}
    >
      {url ? (
        <SiteShot url={url} />
      ) : archiveThumb ? (
        <img src={archiveThumb} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
      ) : null}
      <span
        className={cn(
          'absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-[0.06em]',
          tone === 'before'
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/80 dark:text-white'
            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/80 dark:text-white'
        )}
      >
        {tone === 'before' ? 'BEFORE' : 'AFTER'}
      </span>
    </div>
  );
}

const MODES = [
  ['old', 'Old'],
  ['new', 'New'],
  ['side', 'Side by side'],
] as const;
type Mode = (typeof MODES)[number][0];

function ShowcaseViewer({ showcase: s }: { showcase: Showcase }) {
  const [mode, setMode] = useState<Mode>('side');
  const [page, setPage] = useState<string | null>(null);
  const [pathDraft, setPathDraft] = useState('/');
  const [path, setPath] = useState('/');
  const boxRef = useRef<HTMLElement>(null);
  const [presenting, setPresenting] = useState(false);
  useEffect(() => {
    const sync = () => setPresenting(!!boxRef.current && document.fullscreenElement === boxRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const oldSite = useArchiveSite(s.oldArchive ? archiveAsFile(s.oldArchive) : null);
  // (useArchiveSite covers both ZIPs and saved HTML pages.)
  const newSnap = useArchiveSite(!s.newSiteUrl && s.newArchive ? archiveAsFile(s.newArchive) : null);

  // Pages to compare: the old site's pages (or the new snapshot's).
  const pages =
    oldSite.status === 'ready' ? oldSite.manifest.pages : newSnap.status === 'ready' ? newSnap.manifest.pages : [];
  const current = page ?? pages[0]?.path ?? 'index.html';
  // With archived pages, compare those; with links only, compare the page path typed in.
  const livePath = pages.length ? livePathOf(current) : path;
  const hasLinks = !!(s.oldSiteUrl || s.newSiteUrl);

  const copyLink = async () => {
    const link = `${window.location.origin}/admin/preview?showcase=${s.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied — it opens this showcase for anyone signed in to the admin portal');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const height = presenting ? 'calc(100vh - 230px)' : 520;
  const dates = [
    s.oldSiteUrl && isWaybackUrl(s.oldSiteUrl) ? 'Old site from web.archive.org' : null,
    !s.oldSiteUrl && s.oldArchive ? `Old site archived ${formatDate(s.oldArchive.createdAt)}` : null,
    s.newLaunchedAt ? `New site launched ${formatDate(s.newLaunchedAt)}` : null,
  ].filter(Boolean);
  const btn =
    'inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition hover:bg-secondary';

  return (
    <section
      ref={boxRef}
      aria-label="Showcase viewer"
      className={cn('flex flex-col gap-4 rounded-[14px] border border-border bg-secondary/20 p-5', presenting && 'overflow-auto bg-background')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-xl font-bold text-foreground">
            <span data-private>{showcaseName(s)}</span> — {s.taskTitle ?? s.title}
          </h2>
          <span className="text-[13px] text-muted-foreground">
            {[s.taskNumber, ...dates].filter(Boolean).join(' · ') || 'Old vs new website'}
            {s.taskNumber ? ' · links set in the task’s Archive tab' : ''}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segs" role="tablist" aria-label="Compare mode">
            {MODES.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={mode === id} className={`seg${mode === id ? ' on' : ''}`} onClick={() => setMode(id)}>
                {label}
              </button>
            ))}
          </div>
          {!presenting && (
            <button type="button" className={btn} onClick={copyLink}>
              <Link2 className="h-[15px] w-[15px]" /> Copy share link
            </button>
          )}
          <button
            type="button"
            className="btn bp"
            style={{ minHeight: 44 }}
            onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void boxRef.current?.requestFullscreen?.())}
          >
            {presenting ? <X /> : <Play />} {presenting ? 'Exit' : 'Present'}
          </button>
        </div>
      </div>

      {pages.length === 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {pages.length === 0 && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const p = pathDraft.trim();
                setPath(p ? (p.startsWith('/') ? p : `/${p}`) : '/');
              }}
            >
              <label className="text-xs font-semibold text-muted-foreground" htmlFor={`path-${s.id}`}>
                Page
              </label>
              <Input
                id={`path-${s.id}`}
                value={pathDraft}
                onChange={(e) => setPathDraft(e.target.value)}
                placeholder="/about"
                className="h-9 w-48"
              />
              <Button type="submit" size="sm" variant="outline">
                Compare
              </Button>
            </form>
          )}
          {hasLinks && <span className="text-xs text-muted-foreground">Type a page (e.g. /about) to open it on both sites.</span>}
        </div>
      )}

      {pages.length > 0 && (
        <nav aria-label="Pages to compare" className="flex flex-wrap gap-1.5">
          {pages.map((p) => {
            const on = p.path === current;
            return (
              <button
                key={p.path}
                type="button"
                onClick={() => setPage(p.path)}
                aria-current={on ? 'page' : undefined}
                title={livePathOf(p.path)}
                className={cn(
                  'min-h-[36px] max-w-[220px] truncate rounded-full border px-3.5 text-[13px] transition',
                  on ? 'border-primary bg-primary font-semibold text-primary-foreground' : 'border-border bg-card font-medium text-muted-foreground hover:bg-secondary'
                )}
              >
                {p.title}
              </button>
            );
          })}
        </nav>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: mode === 'side' ? 'repeat(auto-fit, minmax(320px, 1fr))' : 'minmax(0, 1fr)' }}>
        {mode !== 'new' && <OldPanel showcase={s} site={oldSite} page={current} livePath={livePath} height={height} />}
        {mode !== 'old' && (
          <NewPanel showcase={s} snap={newSnap} oldPage={current} livePath={livePath} height={height} />
        )}
      </div>
    </section>
  );
}

function PanelNote({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 p-5 text-center">
      <Globe className="h-6 w-6 text-muted-foreground" />
      <span className="text-lg font-bold text-foreground">{title}</span>
      <span className="max-w-[320px] text-xs text-muted-foreground">{text}</span>
    </div>
  );
}

function siteNote(site: SiteState, label: string) {
  if (site.status === 'loading' || site.status === 'building')
    return <PanelNote title="Preparing snapshot…" text={`The ${label} site's ZIP is being unpacked — this opens on its own.`} />;
  return (
    <PanelNote
      title={`${label === 'old' ? 'Old' : 'New'} site not open yet`}
      text="Open the task’s Archive tab and click “Open as website” on this ZIP."
    />
  );
}

function OldPanel({
  showcase: s,
  site,
  page,
  livePath,
  height,
}: {
  showcase: Showcase;
  site: SiteState;
  page: string;
  livePath: string;
  height: number | string;
}) {
  const domain = s.oldArchive ? siteNameOf(s.oldArchive.fileName) : '—';
  const before = { tone: 'before' as const, label: 'BEFORE' };
  if (s.oldSiteUrl) return <UrlPanel url={s.oldSiteUrl} path={livePath} badge={before} height={height} />;
  if (!s.oldArchive) {
    return (
      <SiteFrame address={s.oldArchiveId ? 'Archived file was deleted' : 'No old site chosen'} leadingBadge={before} height={height}>
        <PanelNote
          title={s.oldArchiveId ? 'The archived old site was deleted' : 'No old site in this showcase'}
          text="Edit the showcase to add the old website’s link or an archived copy."
        />
      </SiteFrame>
    );
  }
  if (isHtmlFile(s.oldArchive) && site.status === 'missing') {
    return <SiteFrame src={mediaUrl(s.oldArchive.url)} address={`${domain} · archived`} leadingBadge={before} height={height} />;
  }
  if (site.status !== 'ready') {
    return (
      <SiteFrame address={`${domain}${livePath} · archived`} leadingBadge={before} height={height}>
        {siteNote(site, 'old')}
      </SiteFrame>
    );
  }
  const path = site.manifest.pages.some((p) => p.path === page) ? page : site.manifest.entry;
  return (
    <SiteFrame
      src={site.base + encodeURI(path)}
      address={`${domain}${livePathOf(path)} · archived`}
      leadingBadge={before}
      siteBase={site.base}
      height={height}
    />
  );
}

function NewPanel({
  showcase: s,
  snap,
  oldPage,
  livePath,
  height,
}: {
  showcase: Showcase;
  snap: SiteState;
  oldPage: string;
  livePath: string;
  height: number | string;
}) {
  const after = { tone: 'after' as const, label: 'AFTER' };
  if (s.newSiteUrl) return <UrlPanel url={s.newSiteUrl} path={livePath} badge={after} height={height} />;
  if (!s.newArchive) {
    return (
      <SiteFrame address="No new site chosen" leadingBadge={after} height={height}>
        <PanelNote title="No new site in this showcase" text="Edit the showcase to add the new website’s address." />
      </SiteFrame>
    );
  }
  const domain = siteNameOf(s.newArchive.fileName);
  if (isHtmlFile(s.newArchive) && snap.status === 'missing') {
    return <SiteFrame src={mediaUrl(s.newArchive.url)} address={`${domain} · snapshot`} leadingBadge={after} height={height} />;
  }
  if (snap.status !== 'ready') {
    return (
      <SiteFrame address={`${domain}${livePath} · snapshot`} leadingBadge={after} height={height}>
        {siteNote(snap, 'new')}
      </SiteFrame>
    );
  }
  // Same page as the old side, matched by how its address reads.
  const match =
    snap.manifest.pages.find((p) => p.path === oldPage)?.path ??
    snap.manifest.pages.find((p) => livePathOf(p.path) === livePath)?.path ??
    snap.manifest.entry;
  return (
    <SiteFrame
      src={snap.base + encodeURI(match)}
      address={`${domain}${livePathOf(match)} · snapshot`}
      leadingBadge={after}
      siteBase={snap.base}
      height={height}
    />
  );
}

/* ─────────────────────────── All archived files ─────────────────────────── */

type FileType = 'all' | 'website' | 'image' | 'video' | 'other';

const isImage = (t?: string | null) => !!t && t.startsWith('image/');
const isVideo = (t?: string | null) => !!t && t.startsWith('video/');
const typeOf = (f: ArchiveFile): Exclude<FileType, 'all'> =>
  isZipFile(f) || isHtmlFile(f) ? 'website' : isImage(f.contentType) ? 'image' : isVideo(f.contentType) ? 'video' : 'other';

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function FilesView() {
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState('');
  const [type, setType] = useState<FileType>('all');
  const [openSite, setOpenSite] = useState<ArchiveFile | null>(null);
  const { data: files = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'preview', 'archive'],
    queryFn: adminApi.archiveFiles,
  });
  const { data: customerList = [] } = useQuery({
    queryKey: ['admin', 'preview', 'customers'],
    queryFn: adminApi.previewCustomers,
  });

  // Every active customer, plus any customer that only appears through its files.
  const customers = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of customerList) names.set(c.clientId, customerName(c));
    for (const f of files) if (!names.has(f.clientId)) names.set(f.clientId, customerName(f));
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [customerList, files]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter(
      (f) =>
        (!customer || f.clientId === customer) &&
        (type === 'all' || typeOf(f) === type) &&
        (!q ||
          [f.fileName, f.taskNumber, f.taskTitle, customerName(f), f.uploadedByName ?? ''].some((s) => s.toLowerCase().includes(q)))
    );
  }, [files, search, customer, type]);

  return (
    <section className="glass up" style={{ animationDelay: '.12s', overflow: 'hidden' }}>
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center" style={{ borderBottom: '1px solid rgba(var(--w),.06)' }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file, task, customer or uploader…"
            className="pl-9"
          />
        </div>
        <Select value={customer} onChange={(e) => setCustomer(e.target.value)} className="lg:w-56">
          <option value="">All customers</option>
          {customers.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value as FileType)} className="lg:w-40">
          <option value="all">All files</option>
          <option value="website">Websites</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="other">Documents</option>
        </Select>
      </div>

      <div className="p-4">
        {isLoading ? (
          <LoadingBlock label="Loading archived files…" />
        ) : isError ? (
          <ErrorState onRetry={refetch} />
        ) : !shown.length ? (
          <EmptyState
            icon={<Archive />}
            title={files.length ? 'No files match' : 'Nothing archived yet'}
            description={files.length ? 'Try a different search or filter.' : "Files put in a task's Archive tab will appear here automatically."}
          />
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {shown.length} file{shown.length === 1 ? '' : 's'}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((f) => (
                <ArchiveCard key={f.id} file={f} onOpenSite={() => setOpenSite(f)} />
              ))}
            </div>
          </>
        )}
      </div>

      {openSite && <SiteDialog file={openSite} onClose={() => setOpenSite(null)} />}
    </section>
  );
}

function ArchiveCard({ file: f, onOpenSite }: { file: ArchiveFile; onOpenSite: () => void }) {
  const url = mediaUrl(f.url) ?? '';
  const kind = typeOf(f);
  const Icon = kind === 'website' ? Globe : kind === 'image' ? ImageIcon : kind === 'video' ? Film : FileText;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {kind === 'website' ? (
        <button type="button" onClick={onOpenSite} className="flex aspect-video flex-col items-center justify-center gap-1.5 bg-secondary/50" title="Open website">
          <Globe className="h-9 w-9 text-muted-foreground" />
          <span className="max-w-[90%] truncate text-xs text-muted-foreground">{siteNameOf(f.fileName)}</span>
        </button>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="flex aspect-video items-center justify-center bg-secondary/50" title="Open">
          {kind === 'image' ? (
            <img src={url} alt={f.fileName} className="h-full w-full object-cover" loading="lazy" />
          ) : kind === 'video' ? (
            <video src={url} className="h-full w-full object-cover" preload="metadata" muted />
          ) : (
            <FileText className="h-10 w-10 text-muted-foreground" />
          )}
        </a>
      )}

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-sm font-medium" title={f.fileName}>
            {f.fileName}
          </span>
        </div>
        <div className="truncate text-xs text-muted-foreground" title={`${f.taskNumber} · ${f.taskTitle}`}>
          <span className="mono">{f.taskNumber}</span> · {f.taskTitle}
        </div>
        <div className="truncate text-xs text-muted-foreground" title={customerName(f)} data-private>
          {customerName(f)}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {humanSize(f.size)} · {formatDate(f.createdAt)}
          {f.uploadedByName ? ` · ${f.uploadedByName}` : ''}
        </div>

        <div className="mt-auto flex gap-2 pt-1.5">
          {kind === 'website' ? (
            <button type="button" onClick={onOpenSite} className="btn bg flex-1 justify-center" style={{ fontSize: 12 }}>
              <Globe /> Open website
            </button>
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className="btn bg flex-1 justify-center" style={{ fontSize: 12 }}>
              <Eye /> View
            </a>
          )}
          <button type="button" className="btn bp flex-1 justify-center" style={{ fontSize: 12 }} onClick={() => downloadFile(url, f.fileName)}>
            <Download /> Download
          </button>
        </div>
      </div>
    </div>
  );
}

/** An archived website opened from the All archived files tab. */
function SiteDialog({ file, onClose }: { file: ArchiveFile; onClose: () => void }) {
  const site = useArchiveSite(file);
  const [page, setPage] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const name = siteNameOf(file.fileName);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!w-[min(1240px,96vw)] !max-w-none">
        <DialogTitle>{name} — archived website</DialogTitle>
        <DialogDescription>
          {file.taskNumber} · {file.taskTitle}. Read-only snapshot — links inside the site still work.
        </DialogDescription>
        <div className="mt-2">
          {isHtmlFile(file) && site.status === 'missing' ? (
            <SiteFrame src={mediaUrl(file.url)} address={name} badge={{ tone: 'archived', label: 'ARCHIVED' }} height="70vh" />
          ) : site.status === 'ready' ? (
            <SiteFrame
              src={site.base + encodeURI(page ?? site.manifest.entry)}
              address={`${name}${livePathOf(current ?? page ?? site.manifest.entry)}`}
              badge={{ tone: 'archived', label: 'ARCHIVED' }}
              siteBase={site.base}
              onNavigate={setCurrent}
              pages={site.manifest.pages}
              currentPage={current ?? page ?? site.manifest.entry}
              onPickPage={(p) => {
                setPage(p);
                setCurrent(null);
              }}
              pagesLead={<span className="text-xs text-muted-foreground">{site.manifest.pageCount} pages</span>}
              height="64vh"
            />
          ) : (
            <SiteFrame address={`${name}/`} badge={{ tone: 'archived', label: 'ARCHIVED' }} height="50vh">
              {siteNote(site, 'old')}
            </SiteFrame>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
