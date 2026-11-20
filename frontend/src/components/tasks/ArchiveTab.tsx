import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileText,
  Film,
  ExternalLink,
  Globe,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { TaskAttachment, TaskSiteLinks } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SiteFrame } from '@/components/archive/SiteFrame';
import { SiteShot } from '@/components/archive/SiteShot';
import { UrlPanel } from '@/components/archive/UrlPanel';
import { cleanSiteUrl, siteHostOf } from '@/lib/siteLinks';
import {
  isHtmlFile,
  isImageFile,
  isPdfFile,
  isVideoFile,
  isZipFile,
  livePathOf,
  siteNameOf,
  useArchiveSite,
  type SiteState,
} from '@/lib/archiveSite';
import { cn, downloadOnClick, formatDate, mediaUrl } from '@/lib/utils';

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Kind = 'website' | 'page' | 'image' | 'video' | 'pdf' | 'file';
const kindOf = (f: TaskAttachment): Kind =>
  isZipFile(f)
    ? 'website'
    : isHtmlFile(f)
      ? 'page'
      : isImageFile(f)
        ? 'image'
        : isVideoFile(f)
          ? 'video'
          : isPdfFile(f)
            ? 'pdf'
            : 'file';
const KIND_LABEL: Record<Kind, string> = {
  website: 'WEBSITE',
  page: 'WEB PAGE',
  image: 'IMAGE',
  video: 'VIDEO',
  pdf: 'PDF',
  file: 'FILE',
};

/** Mock browser window used as a website card's thumbnail. */
function BrowserThumb({ label }: { label: string }) {
  return (
    <div className="flex h-[132px] flex-col overflow-hidden rounded-lg border border-border bg-secondary/60">
      <div className="flex h-[18px] items-center gap-1 bg-border/70 px-2" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-3 text-center">
        <Globe className="h-5 w-5 text-muted-foreground" />
        <span className="line-clamp-2 text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

const isSiteKind = (k: Kind) => k === 'website' || k === 'page';

/** A website card shows a picture from its home page once its copy is built. */
function SiteThumb({ file }: { file: TaskAttachment }) {
  const site = useArchiveSite(file);
  const thumb = site.status === 'ready' && site.manifest.thumb ? site.base + encodeURI(site.manifest.thumb) : null;
  if (!thumb) return <BrowserThumb label={siteNameOf(file.fileName)} />;
  return (
    <div className="flex h-[132px] flex-col overflow-hidden rounded-lg border border-border bg-secondary/60">
      <div className="flex h-[18px] shrink-0 items-center gap-1 bg-border/70 px-2" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
      </div>
      <img src={thumb} alt="" className="min-h-0 w-full flex-1 object-cover object-top" loading="lazy" />
    </div>
  );
}

function Thumb({ file, kind, isAdmin }: { file: TaskAttachment; kind: Kind; isAdmin: boolean }) {
  const url = mediaUrl(file.url) ?? '';
  if (isSiteKind(kind)) return <SiteThumb file={file} />;
  return (
    <div className="flex h-[132px] items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary/60">
      {kind === 'image' ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : kind === 'video' ? (
        <video
          src={url}
          className="h-full w-full object-cover"
          muted
          preload="metadata"
          controlsList={isAdmin ? undefined : 'nodownload'}
        />
      ) : (
        <FileText className="h-10 w-10 text-muted-foreground" />
      )}
    </div>
  );
}

/** "Old site · 5 pages" for a ready website, else the file size. */
function CardMeta({ file, kind }: { file: TaskAttachment; kind: Kind }) {
  const site = useArchiveSite(isSiteKind(kind) ? file : null);
  const text = !isSiteKind(kind)
    ? humanSize(file.size)
    : site.status === 'ready'
      ? site.manifest.pageCount > 1
        ? `Old site · ${site.manifest.pageCount} pages`
        : 'Old site · saved page'
      : site.status === 'building' || site.status === 'loading'
        ? 'Preparing snapshot…'
        : `${kind === 'page' ? 'HTML' : 'ZIP'} · ${humanSize(file.size)}`;
  return <span className="text-xs text-muted-foreground">{text}</span>;
}

/**
 * Archive tab. Admins upload any file, image, video or saved website (ZIP),
 * rename, delete and download it; the client and team view the same items
 * read-only. A website ZIP opens as a clickable snapshot in a browser frame.
 */
export function ArchiveTab({
  files,
  isAdmin,
  uploading,
  onUpload,
  onRename,
  onDelete,
  onRebuild,
  rebuildingId,
  rebuildFailedId,
  siteLinks,
  onSaveLinks,
  savingLinks,
}: {
  files: TaskAttachment[];
  /** Old/new website links for this task (shown here and side by side on Preview). */
  siteLinks?: TaskSiteLinks | null;
  onSaveLinks?: (links: { oldSiteUrl: string | null; newSiteUrl: string | null }) => void;
  savingLinks?: boolean;
  isAdmin: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRename: (id: string, fileName: string) => void;
  onDelete: (id: string) => void;
  onRebuild: (id: string) => void;
  rebuildingId?: string;
  /** The item whose last build request was refused — stop waiting for it. */
  rebuildFailedId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const links = linkItems(siteLinks);
  const [selectedId, setSelectedId] = useState<string | null>(() => links[0]?.id ?? files[0]?.id ?? null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Items the admin asked to (re)build — their viewer keeps checking until ready.
  const [watching, setWatching] = useState<string[]>([]);
  const selected = files.find((f) => f.id === selectedId) ?? null;
  const selectedLink = links.find((l) => l.id === selectedId) ?? null;

  const commitRename = (id: string) => {
    const v = renameValue.trim();
    if (v) onRename(id, v);
    setRenaming(null);
  };

  return (
    <div className="mt-5 flex flex-col gap-5">
      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-3.5">
          <p className="text-[13px] text-muted-foreground">
            Store any file, image, video or archived website. Files are kept at original quality — only you can edit, delete or
            download them.
          </p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="min-h-[44px] shrink-0 px-[18px]">
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      )}

      {isAdmin && onSaveLinks && (
        <WebsiteLinksForm
          key={`${siteLinks?.oldSiteUrl ?? ''}|${siteLinks?.newSiteUrl ?? ''}`}
          links={siteLinks}
          saving={!!savingLinks}
          onSave={(v) => {
            onSaveLinks(v);
            if (!selectedId) setSelectedId(v.oldSiteUrl ? 'link:old' : v.newSiteUrl ? 'link:new' : null);
          }}
        />
      )}

      <div className="flex flex-wrap items-start gap-5">
        <aside aria-label="Archived items" className="flex min-w-0 max-w-[340px] flex-[1_1_280px] flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Archived items ({files.length + links.length})
          </h2>

          {links.map((l) => (
            <LinkCard key={l.id} link={l} on={l.id === selectedId} onPick={() => setSelectedId(l.id)} />
          ))}

          {files.length === 0 && links.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {isAdmin ? 'No archived items yet. Upload one to get started.' : 'Nothing has been archived for this task yet.'}
            </p>
          )}

          {files.map((f) => {
            const kind = kindOf(f);
            const on = f.id === selectedId;
            return (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                onClick={() => setSelectedId(f.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setSelectedId(f.id);
                  }
                }}
                className={cn(
                  'flex cursor-pointer flex-col gap-2.5 rounded-xl bg-card p-3 text-left shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'border-2 border-primary' : 'border border-border hover:border-primary/40'
                )}
              >
                <Thumb file={f} kind={kind} isAdmin={isAdmin} />
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-[3px] text-[11px] font-semibold text-primary">{KIND_LABEL[kind]}</span>
                  <CardMeta file={f} kind={kind} />
                </div>

                {renaming === f.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      value={renameValue}
                      autoFocus
                      className="h-8 text-sm"
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(f.id);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                    <button type="button" title="Save name" className="p-1 text-muted-foreground hover:text-primary" onClick={() => commitRename(f.id)}>
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="truncate text-[15px] font-semibold text-foreground" title={f.fileName}>
                    {kind === 'website' || kind === 'page' ? siteNameOf(f.fileName) : f.fileName}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {kind === 'website' || kind === 'page' ? 'Captured' : 'Added'} {formatDate(f.createdAt)}
                    {f.uploadedByName ? ` · Uploaded by ${f.uploadedByName}` : ''}
                  </span>
                  {isAdmin && (
                    <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {confirmDelete === f.id ? (
                        <>
                          <button
                            type="button"
                            className="rounded px-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            onClick={() => {
                              onDelete(f.id);
                              setConfirmDelete(null);
                              if (selectedId === f.id) setSelectedId(null);
                            }}
                          >
                            Delete
                          </button>
                          <button type="button" className="rounded px-1.5 text-xs text-muted-foreground hover:bg-secondary" onClick={() => setConfirmDelete(null)}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <>
                          <a
                            href={mediaUrl(f.url)}
                            download={f.fileName}
                            onClick={downloadOnClick(mediaUrl(f.url) ?? '', f.fileName)}
                            className="text-muted-foreground hover:text-primary"
                            title="Download (original quality)"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-primary"
                            title="Rename"
                            onClick={() => {
                              setRenaming(f.id);
                              setRenameValue(f.fileName);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" className="text-muted-foreground hover:text-rose-500" title="Delete" onClick={() => setConfirmDelete(f.id)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isAdmin && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Tip: upload the site as a ZIP (from SingleFile or HTTrack). It opens here as a clickable snapshot.
            </p>
          )}
        </aside>

        <section aria-label="Archived item viewer" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
          {selectedLink ? (
            <LinkViewer key={selectedLink.id} link={selectedLink} onClose={() => setSelectedId(null)} />
          ) : selected ? (
            <Viewer
              key={selected.id}
              file={selected}
              isAdmin={isAdmin}
              onClose={() => setSelectedId(null)}
              onRebuild={() => {
                setWatching((w) => (w.includes(selected.id) ? w : [...w, selected.id]));
                onRebuild(selected.id);
              }}
              rebuilding={rebuildingId === selected.id}
              watch={watching.includes(selected.id) && rebuildFailedId !== selected.id}
            />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-[14px] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Select an archived item to preview it here.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Full-screen toggle for one element (attach `setEl` as its ref). */
function useFullscreen() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(!!el && document.fullscreenElement === el);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [el]);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el?.requestFullscreen?.();
  };
  return { setEl, on, toggle };
}

function Viewer({
  file,
  isAdmin,
  onClose,
  onRebuild,
  rebuilding,
  watch,
}: {
  file: TaskAttachment;
  isAdmin: boolean;
  onClose: () => void;
  onRebuild: () => void;
  rebuilding: boolean;
  watch: boolean;
}) {
  const kind = kindOf(file);
  const site = useArchiveSite(isSiteKind(kind) ? file : null, watch);
  const { setEl: setFsEl, on: fsOn, toggle: toggleFs } = useFullscreen();
  const url = mediaUrl(file.url) ?? '';
  const name = kind === 'website' || kind === 'page' ? siteNameOf(file.fileName) : file.fileName;
  const isSite = kind === 'website' || kind === 'page';

  const btn =
    'inline-flex min-h-[40px] items-center gap-1.5 rounded-[10px] border border-border bg-card px-3.5 text-[13px] font-medium text-foreground transition hover:bg-secondary';

  return (
    <div ref={setFsEl} className={cn('flex flex-col gap-3', fsOn && 'bg-background p-4')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-lg font-bold text-foreground">{isSite ? `${name} — previous website` : name}</h2>
          <span className="text-[13px] text-muted-foreground">
            {isSite
              ? 'Read-only snapshot. Links inside the site still work.'
              : `${humanSize(file.size)} · added ${formatDate(file.createdAt)}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={toggleFs}>
            {fsOn ? <Minimize2 className="h-[15px] w-[15px]" /> : <Maximize2 className="h-[15px] w-[15px]" />}
            {fsOn ? 'Exit full screen' : 'Full screen'}
          </button>
          {isAdmin && (
            <a href={url} download={file.fileName} onClick={downloadOnClick(url, file.fileName)} className={btn}>
              <Download className="h-[15px] w-[15px]" />
              {kind === 'website' ? 'Download ZIP' : kind === 'page' ? 'Download HTML' : 'Download'}
            </a>
          )}
          {!fsOn && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close viewer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-border bg-card text-foreground transition hover:bg-secondary"
            >
              <X className="h-[15px] w-[15px]" />
            </button>
          )}
        </div>
      </div>

      <ViewerBody
        file={file}
        kind={kind}
        name={name}
        site={site}
        url={url}
        isAdmin={isAdmin}
        height={fsOn ? 'calc(100vh - 150px)' : 560}
        onRebuild={onRebuild}
        rebuilding={rebuilding}
      />
    </div>
  );
}

function ViewerBody({
  file,
  kind,
  name,
  site,
  url,
  isAdmin,
  height,
  onRebuild,
  rebuilding,
}: {
  file: TaskAttachment;
  kind: Kind;
  name: string;
  site: SiteState;
  url: string;
  isAdmin: boolean;
  height: number | string;
  onRebuild: () => void;
  rebuilding: boolean;
}) {
  const [page, setPage] = useState<string | null>(null);
  // Where the frame is right now (follows clicks inside the site) vs. what was picked.
  const [current, setCurrent] = useState<string | null>(null);

  if (isSiteKind(kind)) {
    if (site.status === 'ready') {
      const pick = page ?? site.manifest.entry;
      const showing = current ?? pick;
      const label = site.manifest.pages.find((p) => p.path === showing)?.title;
      return (
        <SiteFrame
          src={site.base + encodeURI(pick)}
          address={`${name}${livePathOf(showing)}`}
          badge={{ tone: 'archived', label: 'ARCHIVED' }}
          siteBase={site.base}
          onNavigate={setCurrent}
          pages={site.manifest.pages}
          currentPage={showing}
          onPickPage={(p) => {
            setPage(p);
            setCurrent(null);
          }}
          pagesLead={
            <span className="text-xs text-muted-foreground">
              {label ? `${label} · ` : ''}
              {site.manifest.pageCount} page{site.manifest.pageCount === 1 ? '' : 's'}
            </span>
          }
          height={height}
        />
      );
    }
    const preparing = site.status === 'loading' || site.status === 'building' || rebuilding;
    // A saved page archived before fast copies existed: show it as it is (it can
    // be slow when it carries its images inline), and let the admin speed it up.
    if (kind === 'page' && !preparing) {
      return (
        <div className="flex flex-col gap-2">
          {isAdmin && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <span>
                This page is {humanSize(file.size)} with its images packed inside, so it opens slowly. Make a fast copy — the
                original file stays as it is.
              </span>
              <Button type="button" size="sm" onClick={onRebuild}>
                <RefreshCw className="mr-2 h-4 w-4" /> Make it load fast
              </Button>
            </div>
          )}
          <SiteFrame src={url} address={name} badge={{ tone: 'archived', label: 'ARCHIVED' }} height={height} />
        </div>
      );
    }
    return (
      <SiteFrame address={`${name}/`} badge={{ tone: 'archived', label: 'ARCHIVED' }} height={height}>
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          {preparing ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-lg font-bold text-foreground">Preparing the website snapshot…</span>
              <span className="max-w-[460px] text-[13px] text-muted-foreground">
                Images are being moved out of the page so it loads fast. Large sites can take a minute — this opens on its
                own when it is ready.
              </span>
            </>
          ) : (
            <>
              <Globe className="h-6 w-6 text-muted-foreground" />
              <span className="text-lg font-bold text-foreground">This ZIP isn't open as a website yet</span>
              <span className="max-w-[460px] text-[13px] text-muted-foreground">
                {isAdmin
                  ? 'If it holds a saved website (with an index.html page), open it as a clickable snapshot.'
                  : 'An admin can open it as a clickable snapshot.'}
              </span>
              {isAdmin && (
                <Button type="button" onClick={onRebuild} className="mt-1">
                  <RefreshCw className="mr-2 h-4 w-4" /> Open as website
                </Button>
              )}
            </>
          )}
        </div>
      </SiteFrame>
    );
  }

  return (
    <div className="flex items-center justify-center overflow-hidden rounded-[14px] border border-border bg-secondary/40" style={{ height }}>
      {kind === 'image' ? (
        <img src={url} alt={file.fileName} className="max-h-full max-w-full object-contain" />
      ) : kind === 'video' ? (
        <video src={url} className="max-h-full max-w-full" controls preload="metadata" controlsList={isAdmin ? undefined : 'nodownload'} />
      ) : kind === 'pdf' ? (
        <iframe src={url} title={file.fileName} className="h-full w-full border-0 bg-white" />
      ) : (
        <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
          {file.contentType?.startsWith('audio/') ? <Film className="h-10 w-10" /> : <FileText className="h-10 w-10" />}
          <span className="font-medium text-foreground">{file.fileName}</span>
          <span>{isAdmin ? 'No preview for this file type — download it to open.' : 'No preview for this file type.'}</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Website links ─────────────────────────── */

interface LinkItem {
  id: 'link:old' | 'link:new';
  side: 'old' | 'new';
  url: string;
}

function linkItems(links?: TaskSiteLinks | null): LinkItem[] {
  const out: LinkItem[] = [];
  if (links?.oldSiteUrl) out.push({ id: 'link:old', side: 'old', url: links.oldSiteUrl });
  if (links?.newSiteUrl) out.push({ id: 'link:new', side: 'new', url: links.newSiteUrl });
  return out;
}

const isWebUrl = (v: string) => v === '' || /^https?:\/\/[^\s]+$/i.test(v);

/** Admin: the task's old and new website links. */
function WebsiteLinksForm({
  links,
  saving,
  onSave,
}: {
  links?: TaskSiteLinks | null;
  saving: boolean;
  onSave: (v: { oldSiteUrl: string | null; newSiteUrl: string | null }) => void;
}) {
  const [oldUrl, setOldUrl] = useState(links?.oldSiteUrl ?? '');
  const [newUrl, setNewUrl] = useState(links?.newSiteUrl ?? '');
  const dirty = oldUrl.trim() !== (links?.oldSiteUrl ?? '') || newUrl.trim() !== (links?.newSiteUrl ?? '');
  const bad = !isWebUrl(oldUrl.trim()) || !isWebUrl(newUrl.trim());
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (bad || !dirty) return;
        onSave({ oldSiteUrl: oldUrl.trim() || null, newSiteUrl: newUrl.trim() || null });
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Website links</h3>
        <span className="text-xs text-muted-foreground">Shown here and side by side on the Preview page.</span>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="min-w-0">
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Old website link</span>
          <Input
            value={oldUrl}
            onChange={(e) => setOldUrl(e.target.value)}
            placeholder="https://web.archive.org/web/2023/https://example.com.au"
            inputMode="url"
          />
        </label>
        <label className="min-w-0">
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">New website link</span>
          <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://www.example.com.au" inputMode="url" />
        </label>
        <Button type="submit" disabled={saving || bad || !dirty} className="min-h-[40px]">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          {saving ? 'Saving…' : 'Save links'}
        </Button>
      </div>
      <p className={cn('text-[11px]', bad ? 'text-rose-600' : 'text-muted-foreground')}>
        {bad
          ? 'Enter full website addresses, starting with https://'
          : 'If the old site is no longer live, find it on web.archive.org and paste that link. Clear a box and save to remove it.'}
      </p>
    </form>
  );
}

function LinkCard({ link, on, onPick }: { link: LinkItem; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={cn(
        'flex flex-col gap-2.5 rounded-xl bg-card p-3 text-left shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring',
        on ? 'border-2 border-primary' : 'border border-border hover:border-primary/40'
      )}
    >
      <div className="flex h-[132px] flex-col overflow-hidden rounded-lg border border-border bg-secondary/60">
        <div className="flex h-[18px] shrink-0 items-center gap-1 bg-border/70 px-2" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        </div>
        <div className="min-h-0 flex-1">
          <SiteShot url={link.url} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-[3px] text-[11px] font-semibold',
            link.side === 'old'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
          )}
        >
          {link.side === 'old' ? 'OLD WEBSITE' : 'NEW WEBSITE'}
        </span>
        <span className="text-xs text-muted-foreground">Link</span>
      </div>
      <div className="truncate text-[15px] font-semibold text-foreground" title={link.url}>
        {siteHostOf(link.url)}
      </div>
      <div className="truncate text-xs text-muted-foreground">{link.side === 'old' ? 'Previous website' : 'Current website'}</div>
    </button>
  );
}

function LinkViewer({ link, onClose }: { link: LinkItem; onClose: () => void }) {
  const { setEl: setFsEl, on: fsOn, toggle: toggleFs } = useFullscreen();
  const host = siteHostOf(link.url);
  const btn =
    'inline-flex min-h-[40px] items-center gap-1.5 rounded-[10px] border border-border bg-card px-3.5 text-[13px] font-medium text-foreground transition hover:bg-secondary';
  return (
    <div ref={setFsEl} className={cn('flex flex-col gap-3', fsOn && 'bg-background p-4')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-lg font-bold text-foreground">
            {host} — {link.side === 'old' ? 'previous website' : 'new website'}
          </h2>
          <span className="text-[13px] text-muted-foreground">Live website — links inside it work.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={toggleFs}>
            {fsOn ? <Minimize2 className="h-[15px] w-[15px]" /> : <Maximize2 className="h-[15px] w-[15px]" />}
            {fsOn ? 'Exit full screen' : 'Full screen'}
          </button>
          <a href={cleanSiteUrl(link.url)} target="_blank" rel="noopener noreferrer" className={btn}>
            <ExternalLink className="h-[15px] w-[15px]" /> Open site
          </a>
          {!fsOn && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close viewer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-border bg-card text-foreground transition hover:bg-secondary"
            >
              <X className="h-[15px] w-[15px]" />
            </button>
          )}
        </div>
      </div>
      <UrlPanel
        url={link.url}
        badge={link.side === 'old' ? { tone: 'before', label: 'OLD' } : { tone: 'after', label: 'NEW' }}
        height={fsOn ? 'calc(100vh - 150px)' : 560}
      />
    </div>
  );
}
