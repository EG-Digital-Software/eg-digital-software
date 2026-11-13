import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Film,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ContentCalendar, ContentPost, ContentPostInput, ContentPostStatus, TaskApi } from '@/api/tasks';
import { apiErrorMessage } from '@/api/client';
import { cn, mediaUrl } from '@/lib/utils';

/**
 * Content Calendar tab (only on tasks where an admin or team member ticks it).
 *
 * The team plans posts on a monthly calendar — a design from the task's
 * Attachments plus caption — and sends each to the client for approval. Once
 * approved, a post is scheduled and published at its time to the customer's
 * connected Facebook Page / Instagram account (auto-publish), or published
 * straight away. Everything shown comes from the API; nothing is sample data.
 */

// ─── Look (from the Content Calendar design) ──────────────

const STATUS: Record<ContentPostStatus, { label: string; bg: string; fg: string }> = {
  DRAFT: { label: 'Draft', bg: '#EEF0F3', fg: '#4A5361' },
  AWAITING_APPROVAL: { label: 'Awaiting approval', bg: '#FDF0D9', fg: '#8A4B00' },
  CHANGES_REQUESTED: { label: 'Changes requested', bg: '#FDE7E5', fg: '#A8261B' },
  APPROVED: { label: 'Approved', bg: '#E3F3EA', fg: '#17663F' },
  SCHEDULED: { label: 'Scheduled', bg: '#E6EDFD', fg: '#1E40AF' },
  PUBLISHING: { label: 'Publishing…', bg: '#E6EDFD', fg: '#1E40AF' },
  PUBLISHED: { label: 'Published', bg: '#E3F3EA', fg: '#17663F' },
  FAILED: { label: 'Failed', bg: '#FDE7E5', fg: '#A8261B' },
};
const SUMMARY_ORDER: ContentPostStatus[] = ['PUBLISHED', 'SCHEDULED', 'APPROVED', 'AWAITING_APPROVAL', 'DRAFT', 'FAILED'];
const PLATFORM: Record<string, { short: string; name: string; color: string }> = {
  fb: { short: 'FB', name: 'Facebook', color: '#1F3B73' },
  ig: { short: 'IG', name: 'Instagram', color: '#8A2C5A' },
  li: { short: 'in', name: 'LinkedIn', color: '#0B5394' },
  tt: { short: 'TT', name: 'TikTok', color: '#161B26' },
  gbp: { short: 'G', name: 'Google Business Profile', color: '#3D6B4F' },
};

/** Platforms shown in the calendar but not connectable yet (their connection is set up later). */
const UPCOMING: { key: string; title: string; detail: string }[] = [
  { key: 'li', title: 'LinkedIn Company Page', detail: 'Connect to publish posts to the LinkedIn company page.' },
  { key: 'tt', title: 'TikTok Business', detail: 'Connect to publish videos and Reels-style content to TikTok.' },
  { key: 'gbp', title: 'Google Business Profile', detail: 'Connect to publish updates and offers to the Google listing.' },
];
const NAVY = '#0F1F33';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_TZ = 'Australia/Sydney';

// ─── Time zones (no library: Intl does the work) ──────────

function partsIn(tz: string, ms: number) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour === 24 ? 0 : o.hour, mi: o.minute, s: o.second };
}
function offsetMs(tz: string, ms: number) {
  const p = partsIn(tz, ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}
/** "2026-11-12" + "18:00" in `tz` → ISO (UTC). */
function zonedToIso(date: string, time: string, tz: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let res = guess - offsetMs(tz, guess);
  const again = guess - offsetMs(tz, res);
  if (again !== res) res = again;
  return new Date(res).toISOString();
}
const pad = (n: number) => String(n).padStart(2, '0');
/** ISO → { date: "YYYY-MM-DD", time: "HH:mm" } in `tz`. */
function isoToZoned(iso: string, tz: string) {
  const p = partsIn(tz, new Date(iso).getTime());
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}
function tzShort(tz: string, at = Date.now()) {
  try {
    return new Intl.DateTimeFormat('en-AU', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(at)).find((p) => p.type === 'timeZoneName')?.value ?? tz;
  } catch {
    return tz;
  }
}
function tzLabel(tz: string) {
  const off = offsetMs(tz, Date.now()) / 3600_000;
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const hm = Number.isInteger(abs) ? `${abs}` : `${Math.floor(abs)}:${pad(Math.round((abs % 1) * 60))}`;
  return `${tz} (${tzShort(tz)}, UTC${sign}${hm})`;
}
function fmtTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).replace(/\s?([ap])m/i, (_, a: string) => ` ${a.toUpperCase()}M`);
}
function fmtDateTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}
function fmtStamp(iso: string) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}
/** Activity meta is stored as "Name · ISO"; show the time readably. */
function fmtMeta(meta: string) {
  const i = meta.lastIndexOf(' · ');
  if (i < 0) return meta;
  const iso = meta.slice(i + 3);
  return Number.isNaN(Date.parse(iso)) ? meta : `${meta.slice(0, i)} · ${fmtStamp(iso)}`;
}
const fmtSize = (n?: number | null) => (!n ? '' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Width/height of an image or video, read in the browser. */
function measure(url: string, type: string | null): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const done = (w: number, h: number) => resolve(w && h ? { w, h } : null);
    const timer = setTimeout(() => resolve(null), 15000);
    if (type?.startsWith('video/')) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { clearTimeout(timer); done(v.videoWidth, v.videoHeight); };
      v.onerror = () => { clearTimeout(timer); resolve(null); };
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => { clearTimeout(timer); done(img.naturalWidth, img.naturalHeight); };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = url;
    }
  });
}

/** The current time, refreshed every half minute (keeps render pure). */
function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(id);
  }, [every]);
  return now;
}

// ─── Small pieces ─────────────────────────────────────────

function Pill({ status }: { status: ContentPostStatus }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

function PlatformBadge({ k, size = 'sm' }: { k: string; size?: 'sm' | 'lg' }) {
  const p = PLATFORM[k] ?? { short: k.toUpperCase(), color: '#161B26' };
  return (
    <span
      aria-hidden="true"
      className={cn('inline-grid shrink-0 place-items-center font-bold text-white', size === 'sm' ? 'rounded px-1 text-[9px] leading-[14px]' : 'h-8 w-8 rounded-lg text-xs')}
      style={{ background: p.color }}
    >
      {p.short}
    </span>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('rounded-2xl border border-[#E4E7EC] bg-white p-5', className)}>{children}</div>;
}

function Btn({
  children,
  onClick,
  primary,
  danger,
  disabled,
  busy,
  className,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        primary ? 'border-[#0F1F33] bg-[#0F1F33] text-white hover:bg-[#1b304b]' : danger ? 'border-[#A8261B] bg-[#A8261B] text-white hover:bg-[#8f1f16]' : 'border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F6F7F9]',
        className
      )}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

const inputCls = 'w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm text-[#161B26] outline-none focus:border-[#0F1F33] focus:ring-2 focus:ring-[#0F1F33]/10 disabled:bg-[#F6F7F9] disabled:text-[#5A6372]';

function Thumb({ post, className }: { post: ContentPost; className?: string }) {
  const m = post.media;
  if (m && m.type?.startsWith('image/')) {
    return <img src={mediaUrl(m.url)} alt="" className={cn('object-cover', className)} loading="lazy" />;
  }
  return (
    <span aria-hidden="true" className={cn('grid place-items-center bg-[#E8EDF4]', className)}>
      {m ? <Film className="h-3.5 w-3.5 text-[#5A6372]" /> : <ImageIcon className="h-3.5 w-3.5 text-[#5A6372]" />}
    </span>
  );
}

// ─── Panel ────────────────────────────────────────────────

type Selection = { id: string | null; date?: string; picked: boolean };

/** One of the three parts of the tab, with its heading (as in the design). */
function Part({ n, title, hint, innerRef, children }: { n: number; title: string; hint?: string; innerRef: React.RefObject<HTMLElement | null>; children: React.ReactNode }) {
  return (
    <section ref={innerRef} className="scroll-mt-4 rounded-2xl bg-[#F6F7F9] p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[#E4E7EC] pb-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#5A6372]">{n} · {title}</h2>
        {hint && <span className="text-xs text-[#98A2B3]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export default function ContentCalendarPanel({ api, taskId }: { api: TaskApi; taskId: string }) {
  const qc = useQueryClient();
  const key = ['content-calendar', taskId] as const;
  const q = useQuery({
    queryKey: key,
    queryFn: () => api.contentCalendar(taskId),
    // Follow a post while it publishes; otherwise refresh now and then for the client's decisions.
    refetchInterval: (query) => (query.state.data?.posts.some((p) => p.status === 'PUBLISHING') ? 3000 : 20000),
  });
  const [sel, setSel] = useState<Selection>({ id: null, picked: false });
  const calRef = useRef<HTMLElement>(null);
  const postRef = useRef<HTMLElement>(null);
  const accRef = useRef<HTMLElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const go = (ref: React.RefObject<HTMLElement | null>) => window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);

  if (q.isLoading) return <div className="mt-5 py-16 text-center text-sm text-muted-foreground">Loading content calendar…</div>;
  if (q.isError || !q.data) {
    return (
      <div className="mt-5 rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
        {apiErrorMessage(q.error) || 'The content calendar could not be loaded.'}{' '}
        <button className="font-semibold text-primary underline" onClick={() => q.refetch()}>Try again</button>
      </div>
    );
  }
  const data = q.data;

  // Until someone picks a post, part 2 shows the one that needs attention most:
  // waiting for approval, then failed, then the next one coming up.
  let postId = sel.id;
  if (!sel.picked) {
    const nowIso = new Date(q.dataUpdatedAt || 0).toISOString();
    const first = (st: ContentPostStatus) => data.posts.find((p) => p.status === st);
    postId =
      (first('AWAITING_APPROVAL') ?? first('FAILED') ?? data.posts.find((p) => p.scheduledAt && p.scheduledAt >= nowIso && p.status !== 'PUBLISHED') ?? data.posts[data.posts.length - 1])?.id ?? null;
  }
  if (postId && !data.posts.some((p) => p.id === postId)) postId = null;
  const open = (id: string | null, date?: string) => {
    setSel({ id, date, picked: true });
    go(postRef);
  };

  const nav = [
    { n: 1, label: 'Content calendar', ref: calRef },
    { n: 2, label: 'Post detail & scheduling', ref: postRef },
    { n: 3, label: 'Connected accounts & log', ref: accRef },
  ];

  return (
    <div className="mt-5 flex flex-col gap-5 text-[#161B26]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <nav aria-label="Content Calendar parts" className="flex flex-wrap gap-2">
        {nav.map((x) => (
          <button key={x.n} type="button" onClick={() => go(x.ref)} className="rounded-[10px] border border-[#E4E7EC] bg-white px-4 py-2.5 text-sm text-[#344054] hover:border-[#0F1F33]">
            {x.n} · {x.label}
          </button>
        ))}
      </nav>

      <Part n={1} title="Content calendar with publish status" innerRef={calRef}>
        <CalendarView data={data} api={api} taskId={taskId} onOpen={open} onAccounts={() => go(accRef)} refresh={refresh} />
      </Part>

      <Part n={2} title="Post detail & scheduling" hint={data.canEdit ? 'Click a post on the calendar to open it here, or Add post' : 'Click a post on the calendar to open it here'} innerRef={postRef}>
        {postId || (data.canEdit && sel.picked) || (data.canEdit && data.posts.length === 0) ? (
          <PostView
            key={postId ?? `new-${sel.date ?? ''}`}
            data={data}
            api={api}
            taskId={taskId}
            postId={postId}
            initialDate={postId ? undefined : sel.date}
            onBack={() => go(calRef)}
            onDeleted={() => { setSel({ id: null, picked: false }); go(calRef); }}
            onCreated={(id) => setSel({ id, picked: true })}
            onAccounts={() => go(accRef)}
            refresh={refresh}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-[#D0D5DD] bg-white px-6 py-12 text-center text-sm text-[#5A6372]">
            {data.posts.length ? 'Click a post on the calendar to see its design, caption, schedule and activity here.' : 'No posts planned yet. The EG Eloma team will add posts here for your approval.'}
          </div>
        )}
      </Part>

      <Part n={3} title="Access Point: connected accounts" innerRef={accRef}>
        <AccountsView data={data} api={api} taskId={taskId} refresh={refresh} />
      </Part>
    </div>
  );
}

// ─── Calendar ─────────────────────────────────────────────

function CalendarView({
  data,
  api,
  taskId,
  onOpen,
  onAccounts,
  refresh,
}: {
  data: ContentCalendar;
  api: TaskApi;
  taskId: string;
  onOpen: (id: string | null, date?: string) => void;
  onAccounts: () => void;
  refresh: () => void;
}) {
  const tz = DEFAULT_TZ;
  const today = isoToZoned(new Date().toISOString(), tz).date;
  const [month, setMonth] = useState(() => today.slice(0, 7)); // YYYY-MM
  const [y, m] = month.split('-').map(Number);

  const auto = useMutation({
    mutationFn: (on: boolean) => api.setContentAutoPublish(taskId, on),
    onSuccess: (r) => { toast.success(`Auto-publish ${r.autoPublish ? 'on' : 'off'}`); refresh(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  // Posts by day (in each post's own time zone), and posts without a date.
  const byDay = useMemo(() => {
    const out: Record<string, ContentPost[]> = {};
    for (const p of data.posts) {
      if (!p.scheduledAt) continue;
      const d = isoToZoned(p.scheduledAt, p.timeZone || tz).date;
      (out[d] ??= []).push(p);
    }
    return out;
  }, [data.posts, tz]);
  const undated = data.posts.filter((p) => !p.scheduledAt);

  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(y, m - 1, 1));
    const start = new Date(first.getTime() - first.getUTCDay() * 86400_000);
    const last = new Date(Date.UTC(y, m, 0));
    const end = new Date(last.getTime() + (6 - last.getUTCDay()) * 86400_000);
    const out: { date: string; num: number; inMonth: boolean }[][] = [];
    for (let t = start.getTime(); t <= end.getTime(); t += 7 * 86400_000) {
      out.push(
        Array.from({ length: 7 }, (_, i) => {
          const d = new Date(t + i * 86400_000);
          return { date: d.toISOString().slice(0, 10), num: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 };
        })
      );
    }
    return out;
  }, [y, m]);

  const monthPosts = data.posts.filter((p) => p.scheduledAt && isoToZoned(p.scheduledAt, p.timeZone || tz).date.startsWith(month));
  const counts = SUMMARY_ORDER.map((s) => ({ s, n: monthPosts.filter((p) => p.status === s || (s === 'SCHEDULED' && p.status === 'PUBLISHING') || (s === 'DRAFT' && p.status === 'CHANGES_REQUESTED')).length }));
  const failed = data.posts.filter((p) => p.status === 'FAILED');
  const connIssue = data.connection?.status === 'EXPIRED';
  const now = useNow();
  const overdue = !data.autoPublish ? data.posts.filter((p) => p.status === 'SCHEDULED' && p.scheduledAt && Date.parse(p.scheduledAt) < now) : [];
  const waiting = data.posts.filter((p) => p.status === 'AWAITING_APPROVAL');
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="flex flex-col gap-5">
      {failed.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#F5C2BD] bg-[#FDE7E5] px-4 py-3.5 text-sm text-[#7A1A12]">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-[1_1_320px]">
            <strong>{failed.length === 1 ? '1 post failed to publish.' : `${failed.length} posts failed to publish.`}</strong>{' '}
            “{failed[0].title}”{failed[0].scheduledAt ? ` (${fmtDateTime(failed[0].scheduledAt, failed[0].timeZone)})` : ''}: {failed[0].lastError ?? 'Unknown error'}
          </span>
          <button type="button" className="font-semibold underline" onClick={() => onOpen(failed[0].id)}>Open post</button>
          {connIssue && <button type="button" className="font-semibold underline" onClick={onAccounts}>Reconnect Meta</button>}
        </div>
      )}
      {failed.length === 0 && connIssue && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#F5C2BD] bg-[#FDE7E5] px-4 py-3.5 text-sm text-[#7A1A12]">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="flex-1">The Meta connection has expired — scheduled posts cannot publish until it is reconnected.</span>
          <button type="button" className="font-semibold underline" onClick={onAccounts}>Reconnect Meta</button>
        </div>
      )}
      {overdue.length > 0 && (
        <div className="rounded-xl border border-[#F3D9A4] bg-[#FDF0D9] px-4 py-3 text-sm text-[#8A4B00]">
          Auto-publish is off — {overdue.length === 1 ? '1 scheduled post is' : `${overdue.length} scheduled posts are`} past their time and waiting. Turn auto-publish on or use Publish now.
        </div>
      )}
      {data.canApprove && waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#F3D9A4] bg-[#FDF0D9] px-4 py-3 text-sm text-[#8A4B00]">
          <span className="flex-1"><strong>{waiting.length === 1 ? '1 post is' : `${waiting.length} posts are`} waiting for your approval.</strong></span>
          <button type="button" className="font-semibold underline" onClick={() => onOpen(waiting[0].id)}>Review</button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="grid h-11 w-11 place-items-center rounded-[10px] border border-[#D0D5DD] bg-white hover:bg-[#F6F7F9]">
            <ChevronLeft className="h-[18px] w-[18px] text-[#344054]" />
          </button>
          <h2 className="mx-2 min-w-[150px] text-center text-xl font-semibold">{monthName}</h2>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="grid h-11 w-11 place-items-center rounded-[10px] border border-[#D0D5DD] bg-white hover:bg-[#F6F7F9]">
            <ChevronRight className="h-[18px] w-[18px] text-[#344054]" />
          </button>
          {month !== today.slice(0, 7) && (
            <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="ml-1 text-sm font-medium text-[#1E40AF] hover:underline">Today</button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-[13px]">
          {counts.map(({ s, n }) => (
            <span key={s} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-medium" style={{ background: STATUS[s].bg, color: STATUS[s].fg }}>
              {STATUS[s].label} <strong>{n}</strong>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => data.canEdit && auto.mutate(!data.autoPublish)}
            disabled={!data.canEdit || auto.isPending}
            aria-pressed={data.autoPublish}
            title={data.canEdit ? 'Approved, scheduled posts publish on their own at their time while this is on' : 'Set by the EG Eloma team'}
            className="inline-flex h-11 items-center gap-2.5 rounded-[10px] border border-[#D0D5DD] bg-white px-3.5 text-sm disabled:cursor-default"
          >
            <span aria-hidden="true" className="relative inline-block h-5 w-9 rounded-full transition" style={{ background: data.autoPublish ? '#17663F' : '#98A2B3' }}>
              <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: data.autoPublish ? 18 : 2 }} />
            </span>
            Auto-publish {data.autoPublish ? 'on' : 'off'}
          </button>
          <Btn onClick={onAccounts}><Link2 className="h-4 w-4" />Connected accounts</Btn>
          {data.canEdit && (
            <Btn primary onClick={() => onOpen(null)}><Plus className="h-4 w-4" />Add post</Btn>
          )}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="rounded-2xl border border-[#E4E7EC] bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#5A6372]">Not on the calendar yet (no date)</p>
          <div className="flex flex-wrap gap-2">
            {undated.map((p) => <PostChip key={p.id} post={p} onClick={() => onOpen(p.id)} />)}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[#E4E7EC] bg-white">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-7 border-b border-[#E4E7EC]">
            {DOW.map((d) => <div key={d} className="px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-[#5A6372]">{d}</div>)}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day) => {
                const posts = byDay[day.date] ?? [];
                const isToday = day.date === today;
                const canAdd = data.canEdit && day.date >= today;
                return (
                  <div
                    key={day.date}
                    className={cn('group flex min-h-[168px] flex-col gap-2 border-b border-r border-[#EEF0F3] p-2.5', day.inMonth ? 'bg-white' : 'bg-[#FAFAFB]')}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="grid h-[26px] w-[26px] place-items-center rounded-full text-[13px] font-semibold"
                        style={{ background: isToday ? NAVY : 'transparent', color: isToday ? '#fff' : day.inMonth ? '#161B26' : '#98A2B3' }}
                      >
                        {day.num}
                      </span>
                      {canAdd && (
                        <button
                          type="button"
                          aria-label={`Add post on ${day.date}`}
                          onClick={() => onOpen(null, day.date)}
                          className="grid h-6 w-6 place-items-center rounded-md text-[#5A6372] opacity-0 hover:bg-[#F6F7F9] focus:opacity-100 group-hover:opacity-100"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {posts.map((p) => <PostChip key={p.id} post={p} full onClick={() => onOpen(p.id)} />)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="text-[13px] text-[#5A6372]">
        Only posts with client approval are published. Times are in each post’s time zone (default {tzLabel(tz)}). Click any post to {data.canEdit ? 'edit its caption, platforms and schedule' : 'see it'}.
      </p>
    </div>
  );
}

function PostChip({ post, onClick, full }: { post: ContentPost; onClick: () => void; full?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex min-w-0 gap-2 rounded-[10px] border border-[#E4E7EC] bg-white p-2 text-left hover:border-[#98A2B3]', full ? 'w-full' : 'w-[200px]')}>
      <Thumb post={post} className="h-[42px] w-[34px] shrink-0 rounded-md" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-xs font-semibold">{post.title}</span>
        <span className="flex flex-wrap items-center gap-1 text-[11px] text-[#5A6372]">
          {post.scheduledAt ? fmtTime(post.scheduledAt, post.timeZone) : 'No date'}
          {post.platforms.map((k) => <PlatformBadge key={k} k={k} />)}
        </span>
        <Pill status={post.status} />
      </span>
    </button>
  );
}

// ─── Post detail ──────────────────────────────────────────

interface Form {
  title: string;
  caption: string;
  hashtags: string;
  firstComment: string;
  platforms: string[];
  date: string;
  time: string;
  timeZone: string;
}

function formFrom(p: ContentPost | undefined, initialDate?: string): Form {
  const tz = p?.timeZone || DEFAULT_TZ;
  const at = p?.scheduledAt ? isoToZoned(p.scheduledAt, tz) : null;
  return {
    title: p?.title ?? '',
    caption: p?.caption ?? '',
    hashtags: p?.hashtags ?? '',
    firstComment: p?.firstComment ?? '',
    platforms: p?.platforms ?? ['fb', 'ig'],
    date: at?.date ?? initialDate ?? '',
    time: at?.time ?? (initialDate ? '18:00' : ''),
    timeZone: tz,
  };
}

function PostView({
  data,
  api,
  taskId,
  postId,
  initialDate,
  onBack,
  onDeleted,
  onCreated,
  onAccounts,
  refresh,
}: {
  data: ContentCalendar;
  api: TaskApi;
  taskId: string;
  postId: string | null;
  initialDate?: string;
  onBack: () => void;
  onDeleted: () => void;
  onCreated: (id: string) => void;
  onAccounts: () => void;
  refresh: () => void;
}) {
  const post = postId ? data.posts.find((p) => p.id === postId) : undefined;
  const [form, setForm] = useState<Form>(() => formFrom(post, initialDate));
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow();
  // What was last saved/loaded; the form is dirty when it differs.
  const [baseline, setBaseline] = useState(() => JSON.stringify(formFrom(post, initialDate)));
  const dirty = JSON.stringify(form) !== baseline;

  // A decision or publish made elsewhere updates the post — take it in unless the form has unsaved edits.
  const serverForm = JSON.stringify(formFrom(post, initialDate));
  const [seenServer, setSeenServer] = useState(serverForm);
  if (serverForm !== seenServer) {
    setSeenServer(serverForm);
    if (!dirty) {
      setBaseline(serverForm);
      setForm(JSON.parse(serverForm) as Form);
    }
  }

  if (postId && !post) {
    return (
      <div className="py-12 text-center text-sm text-[#5A6372]">
        This post no longer exists. <button className="font-semibold text-[#1E40AF] underline" onClick={onBack}>Back to the calendar</button>
      </div>
    );
  }

  const status: ContentPostStatus = post?.status ?? 'DRAFT';
  const locked = !data.canEdit || status === 'PUBLISHING' || status === 'PUBLISHED';
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const scheduledIso = form.date && form.time ? zonedToIso(form.date, form.time, form.timeZone) : null;
  const message = [form.caption.trim(), form.hashtags.trim()].filter(Boolean).join('\n\n');
  const igOn = form.platforms.includes('ig');

  const body = (): ContentPostInput => ({
    title: form.title.trim(),
    caption: form.caption,
    hashtags: form.hashtags,
    firstComment: form.firstComment,
    platforms: form.platforms,
    scheduledAt: scheduledIso,
    timeZone: form.timeZone,
  });

  async function run(label: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(label);
    try {
      await fn();
      if (success) toast.success(success);
      refresh();
    } catch (e) {
      toast.error(apiErrorMessage(e));
      throw e;
    } finally {
      setBusy(null);
    }
  }

  /** Save the form; returns the post id. */
  async function save(quiet = false): Promise<string> {
    if (!form.title.trim()) {
      toast.error('Give the post a title');
      throw new Error('title');
    }
    if ((form.date && !form.time) || (!form.date && form.time)) {
      toast.error('Pick both a date and a time, or leave both empty');
      throw new Error('date');
    }
    if (!post) {
      const r = await api.createContentPost(taskId, body());
      setBaseline(JSON.stringify(form));
      if (!quiet) toast.success('Post added');
      await refresh();
      onCreated(r.id);
      return r.id;
    }
    await api.updateContentPost(taskId, post.id, body());
    setBaseline(JSON.stringify(form));
    if (!quiet) toast.success('Post saved');
    await refresh();
    return post.id;
  }

  const action = (label: string, a: 'request-approval' | 'schedule' | 'unschedule' | 'publish', success: string) =>
    run(label, async () => {
      const id = dirty || !post ? await save(true) : post.id;
      await api.contentPostAction(taskId, id, a);
    }, success).catch(() => undefined);

  async function pickDesign(att: ContentCalendar['attachments'][number]) {
    setPicking(false);
    await run('design', async () => {
      const dims = await measure(mediaUrl(att.url) ?? att.url, att.contentType);
      const id = post ? post.id : await save(true);
      await api.updateContentPost(taskId, id, { attachmentId: att.id, mediaWidth: dims?.w ?? null, mediaHeight: dims?.h ?? null });
    }, 'Design set').catch(() => undefined);
  }

  const checks = post?.checks ?? [];
  const failing = checks.filter((c) => !c.ok);
  const canSchedule = !!post && ['APPROVED', 'FAILED'].includes(status);
  const canPublish = !!post && ['APPROVED', 'SCHEDULED', 'FAILED'].includes(status);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E4E7EC] pb-5">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-[#5A6372] hover:text-[#161B26]">
            <ChevronLeft className="h-4 w-4" />Back to the calendar{data.customerName ? ` · ${data.customerName}` : ''}
          </button>
          <h2 className="mt-1.5 flex flex-wrap items-center gap-3 text-[22px] font-semibold">
            <span className="min-w-0 break-words">{form.title || (post ? post.title : 'New post')}</span>
            <Pill status={status} />
          </h2>
        </div>
        {data.canEdit && (
          <div className="flex flex-wrap gap-2">
            {!locked && <Btn onClick={() => run('save', () => save()).catch(() => undefined)} busy={busy === 'save'} disabled={!!busy || (!dirty && !!post)}>{post ? 'Save' : 'Save draft'}</Btn>}
            {(status === 'DRAFT' || status === 'CHANGES_REQUESTED') && (
              <Btn primary onClick={() => action('approval', 'request-approval', 'Sent to the client for approval')} busy={busy === 'approval'} disabled={!!busy}>Send for approval</Btn>
            )}
            {canPublish && (
              <Btn onClick={() => { if (window.confirm(`Publish “${form.title}” now to ${form.platforms.map((k) => PLATFORM[k]?.name ?? k).join(' and ')}? This posts on the client's real accounts.`)) void action('publish', 'publish', 'Publishing started'); }} busy={busy === 'publish'} disabled={!!busy || failing.length > 0}>
                {status === 'FAILED' ? 'Retry now' : 'Publish now'}
              </Btn>
            )}
            {canSchedule && (
              <Btn primary onClick={() => action('schedule', 'schedule', 'Post scheduled')} busy={busy === 'schedule'} disabled={!!busy || !scheduledIso || failing.length > 0}>Schedule post</Btn>
            )}
            {status === 'SCHEDULED' && (
              <Btn onClick={() => action('unschedule', 'unschedule', 'Post unscheduled')} busy={busy === 'unschedule'} disabled={!!busy}>Unschedule</Btn>
            )}
          </div>
        )}
      </div>

      {/* Client decision */}
      {post && status === 'AWAITING_APPROVAL' && (
        data.canApprove ? (
          <Card className="border-[#F3D9A4] bg-[#FFFBF2]">
            <h3 className="text-base font-semibold">Your approval</h3>
            <p className="mt-1 text-sm text-[#5A6372]">Check the design and caption below. Approved posts are published on the date shown; request changes if anything needs fixing.</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note for the team (optional)" className={cn(inputCls, 'mt-3 py-2.5')} maxLength={1000} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn primary onClick={() => run('approve', () => api.decideContentPost(taskId, post.id, true, note), 'Post approved').then(() => setNote('')).catch(() => undefined)} busy={busy === 'approve'} disabled={!!busy}>Approve</Btn>
              <Btn onClick={() => { if (!note.trim()) { toast.error('Tell the team what to change'); return; } run('reject', () => api.decideContentPost(taskId, post.id, false, note), 'Changes requested').then(() => setNote('')).catch(() => undefined); }} busy={busy === 'reject'} disabled={!!busy}>Request changes</Btn>
            </div>
          </Card>
        ) : (
          <div className="rounded-xl border border-[#F3D9A4] bg-[#FDF0D9] px-4 py-3 text-sm text-[#8A4B00]">Waiting for the client to approve this post. Editing the design or caption now is fine — the client sees the latest version.</div>
        )
      )}
      {post?.status === 'FAILED' && post.lastError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#F5C2BD] bg-[#FDE7E5] px-4 py-3 text-sm text-[#7A1A12]">
          <AlertTriangle className="h-5 w-5 shrink-0" /><span className="flex-1">{post.lastError}</span>
          {data.connection?.status === 'EXPIRED' && <button type="button" className="font-semibold underline" onClick={onAccounts}>Reconnect Meta</button>}
        </div>
      )}
      {post?.status === 'PUBLISHED' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#BFE3CF] bg-[#E3F3EA] px-4 py-3 text-sm text-[#17663F]">
          <span className="flex-1">Published{post.publishedAt ? ` ${fmtStamp(post.publishedAt)}` : ''}.{post.lastError ? ` ${post.lastError}` : ''}</span>
          {Object.entries(post.published).map(([k, url]) => url && (
            <a key={k} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline">View on {PLATFORM[k]?.name ?? k}<ArrowUpRight className="h-3.5 w-3.5" /></a>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-6">
        {/* Content */}
        <section aria-label="Post content" className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <Card className="flex flex-wrap gap-6">
            <div className="flex flex-none flex-col gap-2.5">
              <div className="grid h-[360px] w-[288px] place-items-center overflow-hidden rounded-[10px] bg-[#E8EDF4]">
                {post?.media ? (
                  post.media.type?.startsWith('video/') ? (
                    <video src={mediaUrl(post.media.url)} controls className="h-full w-full object-contain" />
                  ) : (
                    <img src={mediaUrl(post.media.url)} alt={post.media.name ?? 'Design'} className="h-full w-full object-contain" />
                  )
                ) : (
                  <div className="flex flex-col items-center gap-2.5 px-6 text-center text-[#344054]">
                    <ImageIcon className="h-10 w-10" strokeWidth={1.6} />
                    <span className="text-[13px] font-medium">No design yet</span>
                    {!locked && <span className="text-xs text-[#5A6372]">Pick one from the task’s Attachments</span>}
                  </div>
                )}
              </div>
              {post?.media && (
                <span className="max-w-[288px] truncate text-xs text-[#5A6372]">
                  {post.media.name}{post.media.width && post.media.height ? ` · ${post.media.width} × ${post.media.height}` : ''}{post.media.size ? ` · ${fmtSize(post.media.size)}` : ''}
                </span>
              )}
              {!locked && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPicking(true)} disabled={!!busy} className="h-10 flex-1 rounded-[10px] border border-[#D0D5DD] bg-white text-[13px] text-[#344054] hover:bg-[#F6F7F9] disabled:opacity-50">
                    {busy === 'design' ? 'Setting…' : post?.media ? 'Replace design' : 'Choose design'}
                  </button>
                  {post?.media && (
                    <button type="button" aria-label="Remove design" onClick={() => run('design', () => api.updateContentPost(taskId, post.id, { attachmentId: null }), 'Design removed').catch(() => undefined)} className="grid h-10 w-10 place-items-center rounded-[10px] border border-[#D0D5DD] bg-white text-[#5A6372] hover:bg-[#F6F7F9]">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">Title <span className="font-normal text-[#5A6372]">(for the calendar — not posted)</span></span>
                <input value={form.title} onChange={(e) => set({ title: e.target.value })} disabled={locked} maxLength={120} placeholder="e.g. Summer spritz kit" className={cn(inputCls, 'h-11')} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">Caption</span>
                <textarea value={form.caption} onChange={(e) => set({ caption: e.target.value })} disabled={locked} rows={7} maxLength={5000} className={cn(inputCls, 'resize-y py-3 leading-relaxed')} />
                <span className={cn('self-end text-xs', igOn && message.length > 2200 ? 'font-semibold text-[#A8261B]' : 'text-[#5A6372]')}>
                  {message.length.toLocaleString()} / {igOn ? '2,200' : '63,206'}
                </span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">Hashtags</span>
                <input value={form.hashtags} onChange={(e) => set({ hashtags: e.target.value })} disabled={locked} maxLength={1000} placeholder="#brand #topic" className={cn(inputCls, 'h-11')} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">First comment <span className="font-normal text-[#5A6372]">(optional)</span></span>
                <input value={form.firstComment} onChange={(e) => set({ firstComment: e.target.value })} disabled={locked} maxLength={1000} className={cn(inputCls, 'h-11')} />
              </label>
            </div>
          </Card>

          {post && (
            <Card>
              <h3 className="mb-3.5 text-base font-semibold">Pre-publish checks</h3>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {checks.map((c) => (
                  <li key={c.title} className="flex items-start gap-2.5 text-sm">
                    <span aria-hidden="true" className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[13px] font-bold" style={{ background: c.ok ? '#E3F3EA' : '#FDE7E5', color: c.ok ? '#17663F' : '#A8261B' }}>
                      {c.ok ? '✓' : '!'}
                    </span>
                    <span><strong className="font-semibold">{c.title}</strong><br /><span className="text-[13px] text-[#5A6372]">{c.detail}</span></span>
                  </li>
                ))}
              </ul>
              {dirty && <p className="mt-3 text-xs text-[#8A4B00]">Checks reflect the last save — save to re-check your edits.</p>}
            </Card>
          )}
        </section>

        {/* Settings */}
        <aside aria-label="Publishing settings" className="flex min-w-0 flex-[1_1_360px] flex-col gap-5">
          <Card>
            <h3 className="mb-3.5 text-base font-semibold">Publish to</h3>
            <div className="flex flex-col gap-2">
              {data.platforms.map((p) => {
                const on = form.platforms.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={on}
                    disabled={locked}
                    onClick={() => set({ platforms: on ? form.platforms.filter((k) => k !== p.key) : [...form.platforms, p.key] })}
                    className="flex min-h-14 items-center gap-3 rounded-[10px] border bg-white px-3 py-2 text-left disabled:cursor-default"
                    style={{ borderColor: on ? NAVY : '#E4E7EC' }}
                  >
                    <PlatformBadge k={p.key} size="lg" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      <span className="text-xs" style={{ color: p.canPublish ? '#5A6372' : '#8A4B00' }}>{p.note}</span>
                    </span>
                    <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-md border-[1.5px] text-[13px] font-bold text-white" style={{ borderColor: on ? NAVY : '#98A2B3', background: on ? NAVY : '#fff' }}>
                      {on ? '✓' : ''}
                    </span>
                  </button>
                );
              })}
              {UPCOMING.map((u) => (
                <div key={u.key} aria-disabled="true" className="flex min-h-14 items-center gap-3 rounded-[10px] border border-[#E4E7EC] bg-[#FAFAFB] px-3 py-2">
                  <PlatformBadge k={u.key} size="lg" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-[#5A6372]">{PLATFORM[u.key].name}</span>
                    <span className="text-xs text-[#8A4B00]">Not connected yet</span>
                  </span>
                  <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-md border-[1.5px] border-[#D0D5DD] bg-white" />
                </div>
              ))}
              {data.platforms.some((p) => !p.canPublish) && (
                <button type="button" onClick={onAccounts} className="self-start text-[13px] font-medium text-[#1E40AF] hover:underline">Manage connected accounts</button>
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-3.5">
            <h3 className="text-base font-semibold">Schedule</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold">Date</span>
                <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} disabled={locked} className={cn(inputCls, 'h-11 px-2.5')} />
              </label>
              <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold">Time</span>
                <input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} disabled={locked} className={cn(inputCls, 'h-11 px-2.5')} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold">Time zone</span>
              <select value={form.timeZone} onChange={(e) => set({ timeZone: e.target.value })} disabled={locked} className={cn(inputCls, 'h-11 px-2.5')}>
                {data.timeZones.map((z) => <option key={z} value={z}>{tzLabel(z)}</option>)}
              </select>
            </label>
            {scheduledIso && (
              <p className={cn('text-xs', Date.parse(scheduledIso) < now && status !== 'PUBLISHED' ? 'font-semibold text-[#A8261B]' : 'text-[#5A6372]')}>
                {Date.parse(scheduledIso) < now && status !== 'PUBLISHED' ? 'This time has passed — pick a future time to schedule. ' : ''}
                {status === 'SCHEDULED' ? (data.autoPublish ? 'Publishes on its own at ' : 'Auto-publish is off — due ') : 'Planned for '}
                {fmtDateTime(scheduledIso, form.timeZone)} ({tzShort(form.timeZone, Date.parse(scheduledIso))}).
              </p>
            )}
            {data.canEdit && canSchedule && !scheduledIso && <p className="text-xs text-[#5A6372]">Pick a date and time, then Schedule post.</p>}
          </Card>

          {post && (
            <Card>
              <h3 className="mb-3.5 text-base font-semibold">Activity</h3>
              <ol className="flex flex-col gap-3.5">
                {post.activity.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: t.kind === 'good' ? '#17663F' : t.kind === 'bad' ? '#A8261B' : t.kind === 'plan' ? '#1E40AF' : '#98A2B3' }} />
                    <span className="flex min-w-0 flex-col gap-0.5"><span className="break-words text-sm font-medium">{t.label}</span><span className="text-xs text-[#5A6372]">{fmtMeta(t.meta)}</span></span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          {post && data.canEdit && status !== 'PUBLISHING' && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(status === 'PUBLISHED' ? 'Remove this post from the calendar? It stays on Facebook/Instagram.' : 'Delete this post from the calendar?')) return;
                run('delete', () => api.deleteContentPost(taskId, post.id), 'Post removed').then(onDeleted).catch(() => undefined);
              }}
              className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-[#A8261B] hover:underline"
            >
              <Trash2 className="h-4 w-4" />{status === 'PUBLISHED' ? 'Remove from calendar' : 'Delete post'}
            </button>
          )}
        </aside>
      </div>

      {picking && (
        <DesignPicker
          api={api}
          taskId={taskId}
          attachments={data.attachments}
          currentUrl={post?.media?.url ?? null}
          onPick={pickDesign}
          onClose={() => setPicking(false)}
          refresh={refresh}
        />
      )}
    </div>
  );
}

function DesignPicker({
  api,
  taskId,
  attachments,
  currentUrl,
  onPick,
  onClose,
  refresh,
}: {
  api: TaskApi;
  taskId: string;
  attachments: ContentCalendar['attachments'];
  currentUrl: string | null;
  onPick: (a: ContentCalendar['attachments'][number]) => void;
  onClose: () => void;
  refresh: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<number | null>(null);

  async function upload(file: File) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast.error('Pick an image or a video');
      return;
    }
    setUploading(0);
    try {
      const att = await api.addAttachment(taskId, file, (p) => setUploading(p));
      await refresh();
      onPick({ id: att.id, fileName: att.fileName, url: att.url, size: att.size, contentType: att.contentType ?? file.type, createdAt: att.createdAt });
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Choose a design" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#E4E7EC] px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-[#161B26]">Choose a design</h3>
            <p className="text-[13px] text-[#5A6372]">Images and videos from this task’s Attachments tab.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F6F7F9]"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto p-5">
          {attachments.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#5A6372]">No images or videos in Attachments yet — upload one below.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {attachments.map((a) => (
                <button key={a.id} type="button" onClick={() => onPick(a)} className={cn('flex flex-col gap-1.5 rounded-xl border p-2 text-left hover:border-[#0F1F33]', a.url === currentUrl ? 'border-[#0F1F33] ring-2 ring-[#0F1F33]/15' : 'border-[#E4E7EC]')}>
                  <span className="grid aspect-[4/5] w-full place-items-center overflow-hidden rounded-lg bg-[#E8EDF4]">
                    {a.contentType?.startsWith('image/') ? <img src={mediaUrl(a.url)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Film className="h-6 w-6 text-[#5A6372]" />}
                  </span>
                  <span className="truncate text-xs font-medium text-[#161B26]">{a.fileName}</span>
                  <span className="text-[11px] text-[#5A6372]">{fmtSize(a.size)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[#E4E7EC] px-5 py-4">
          <span className="text-xs text-[#5A6372]">Instagram: JPEG, 4:5 to 1.91:1, under 8 MB · Videos: MP4/MOV</span>
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
          <Btn primary onClick={() => fileRef.current?.click()} busy={uploading !== null}>
            {uploading !== null ? `Uploading ${uploading}%` : <><Upload className="h-4 w-4" />Upload new</>}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Accounts & publishing log ────────────────────────────

function AccountsView({ data, api, taskId, refresh }: { data: ContentCalendar; api: TaskApi; taskId: string; refresh: () => void }) {
  const conn = data.connection;
  const [waiting, setWaiting] = useState(false);
  const qc = useQueryClient();

  // After the Facebook window opens, look for the new connection for a few minutes.
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: ['content-calendar', taskId] });
      if (Date.now() - started > 3 * 60_000) setWaiting(false);
    }, 4000);
    return () => window.clearInterval(id);
  }, [waiting, qc, taskId]);
  const connectedAt = conn?.connectedAt;
  const firstConnectedAt = useRef(connectedAt);
  useEffect(() => {
    if (waiting && connectedAt && connectedAt !== firstConnectedAt.current) {
      setWaiting(false);
      toast.success('Meta account connected');
    }
  }, [connectedAt, waiting]);

  const connect = useMutation({
    mutationFn: () => api.connectSocial(taskId, 'meta'),
    onSuccess: ({ url }) => {
      firstConnectedAt.current = conn?.connectedAt;
      const w = window.open(url, 'meta-connect', 'width=640,height=760');
      if (!w) window.location.assign(url);
      setWaiting(true);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const select = useMutation({
    mutationFn: (body: { pageId?: string | null; igId?: string | null }) => api.selectSocialAccounts(taskId, conn!.id, body),
    onSuccess: () => { toast.success('Accounts updated'); refresh(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const pages = conn?.assets.pages ?? [];
  const igs = pages.filter((p) => p.ig).map((p) => ({ ...p.ig!, page: p.name }));
  const sel = conn?.selected ?? {};
  const expired = conn?.status === 'EXPIRED';
  const now = useNow(60_000);
  const expiresSoon = conn?.tokenExpiresAt && Date.parse(conn.tokenExpiresAt) - now < 10 * 86400_000;
  const scopes = new Set((conn?.scopes ?? '').split(',').filter(Boolean));
  const missingPublish = conn && scopes.size > 0 && (!scopes.has('pages_manage_posts') || !scopes.has('instagram_content_publish'));

  const statusPill = (ok: boolean, label: string, tone: 'ok' | 'bad' | 'warn' | 'none') => {
    const c = { ok: ['#E3F3EA', '#17663F'], bad: ['#FDE7E5', '#A8261B'], warn: ['#FDF0D9', '#8A4B00'], none: ['#EEF0F3', '#4A5361'] }[tone];
    return <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: c[0], color: c[1] }} data-ok={ok}>{label}</span>;
  };

  const cards = (['fb', 'ig'] as const).map((k) => {
    const p = data.platforms.find((x) => x.key === k)!;
    const tone: 'ok' | 'bad' | 'warn' | 'none' = !conn || !p.connected ? 'none' : expired ? 'bad' : !p.canPublish || expiresSoon ? 'warn' : 'ok';
    const label = !conn || !p.connected ? 'Not connected' : expired ? 'Expired' : !p.canPublish ? 'No publish permission' : expiresSoon ? 'Expires soon' : 'Connected';
    return { k, p, tone, label };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[720px]">
          <h2 className="mb-1.5 text-xl font-semibold">Connected social accounts</h2>
          <p className="text-sm leading-relaxed text-[#5A6372]">
            The client approves access once on Facebook. Approved posts from the Content Calendar then publish automatically. No passwords are stored or shared — the same connection feeds the Social Media Dashboard.
          </p>
        </div>
        {data.metaConfigured ? (
          <Btn primary onClick={() => connect.mutate()} busy={connect.isPending}>
            <Link2 className="h-4 w-4" />{conn ? 'Reconnect Meta' : 'Connect Meta (Facebook & Instagram)'}
          </Btn>
        ) : (
          <span className="text-sm text-[#8A4B00]">Connecting Meta accounts is not set up on the server yet.</span>
        )}
      </div>
      {waiting && (
        <div className="flex items-center gap-2 rounded-xl border border-[#C9D6F5] bg-[#E6EDFD] px-4 py-3 text-sm text-[#1E40AF]">
          <Loader2 className="h-4 w-4 animate-spin" />Finish signing in with Facebook in the window that opened — this page updates on its own.
        </div>
      )}
      {missingPublish && (
        <div className="rounded-xl border border-[#F3D9A4] bg-[#FDF0D9] px-4 py-3 text-sm text-[#8A4B00]">
          This Meta connection was made before publishing was added, so it can read figures but not post. Press <strong>Reconnect Meta</strong> and allow posting to the Page and Instagram.
        </div>
      )}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {cards.map(({ k, p, tone, label }) => (
          <article key={k} className="flex flex-col gap-3.5 rounded-2xl border bg-white p-5" style={{ borderColor: tone === 'bad' ? '#F5C2BD' : '#E4E7EC' }}>
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-sm font-bold text-white" style={{ background: PLATFORM[k].color }}>{PLATFORM[k].short}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold">{k === 'fb' ? 'Facebook Page' : 'Instagram Business'}</h3>
                <p className="truncate text-[13px] text-[#5A6372]">{p.connected ? p.name.replace(/^[^·]+·\s*/, '') : 'Not connected'}</p>
              </div>
              {statusPill(tone === 'ok', label, tone)}
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: tone === 'bad' ? '#7A1A12' : '#5A6372' }}>
              {!conn
                ? `Connect to publish ${k === 'fb' ? 'posts to the Facebook Page' : 'feed posts and Reels to Instagram'}.`
                : expired
                  ? 'The connection expired. Scheduled posts cannot publish until it is reconnected.'
                  : `${p.note}. Connected by ${conn.connectedByName} on ${fmtStamp(conn.connectedAt)}${conn.tokenExpiresAt ? ` · access renews by ${new Date(conn.tokenExpiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.`}
            </p>
            {conn && k === 'fb' && pages.length > 0 && (
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-semibold">Page</span>
                <select value={sel.pageId ?? ''} disabled={select.isPending} onChange={(e) => select.mutate({ pageId: e.target.value || null })} className={cn(inputCls, 'h-10')}>
                  <option value="">None</option>
                  {pages.map((pg) => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
                </select>
              </label>
            )}
            {conn && k === 'ig' && igs.length > 0 && (
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-semibold">Instagram account</span>
                <select value={sel.igId ?? ''} disabled={select.isPending} onChange={(e) => select.mutate({ igId: e.target.value || null })} className={cn(inputCls, 'h-10')}>
                  <option value="">None</option>
                  {igs.map((ig) => <option key={ig.id} value={ig.id}>@{ig.username} ({ig.page})</option>)}
                </select>
              </label>
            )}
            {conn && k === 'ig' && igs.length === 0 && <p className="text-xs text-[#8A4B00]">No Instagram professional account is linked to the Pages this login can manage.</p>}
          </article>
        ))}
        {UPCOMING.map((u) => (
          <article key={u.key} className="flex flex-col gap-3.5 rounded-2xl border border-[#E4E7EC] bg-white p-5">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-sm font-bold text-white" style={{ background: PLATFORM[u.key].color }}>{PLATFORM[u.key].short}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold">{u.title}</h3>
                <p className="truncate text-[13px] text-[#5A6372]">Not connected</p>
              </div>
              {statusPill(false, 'Not connected', 'none')}
            </div>
            <p className="text-[13px] leading-relaxed text-[#5A6372]">{u.detail}</p>
            <div className="mt-auto flex flex-wrap items-center gap-2">
              <button type="button" disabled title="This connection is not set up yet" className="h-10 cursor-not-allowed rounded-[10px] border border-[#D0D5DD] bg-white px-3.5 text-[13px] font-semibold text-[#98A2B3]">
                Connect
              </button>
              <span className="text-xs text-[#98A2B3]">Available soon</span>
            </div>
          </article>
        ))}
      </div>

      <section aria-label="Recent publishing activity" className="overflow-hidden rounded-2xl border border-[#E4E7EC] bg-white">
        <h3 className="border-b border-[#E4E7EC] px-5 py-4 text-base font-semibold">Publishing log</h3>
        {data.log.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[#5A6372]"><CalendarDays className="mx-auto mb-2 h-6 w-6" />Nothing has been published from this calendar yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#5A6372]">
                  <th scope="col" className="px-5 py-3 font-semibold">Post</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Platform</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Time ({tzShort(DEFAULT_TZ)})</th>
                  <th scope="col" className="px-5 py-3 font-semibold">By</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Result</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Link</th>
                </tr>
              </thead>
              <tbody>
                {data.log.map((r) => (
                  <tr key={r.id} className="border-t border-[#EEF0F3] align-top">
                    <td className="px-5 py-3.5 font-medium">{r.post}</td>
                    <td className="px-5 py-3.5">{PLATFORM[r.platform]?.name ?? r.platform}</td>
                    <td className="px-5 py-3.5 text-[#5A6372]">{fmtDateTime(r.at, DEFAULT_TZ)}</td>
                    <td className="px-5 py-3.5 text-[#5A6372]">{r.trigger === 'auto' ? 'Auto-publish' : r.trigger}</td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={r.result === 'PUBLISHED' ? { background: '#E3F3EA', color: '#17663F' } : { background: '#FDE7E5', color: '#A8261B' }}>
                        {r.result === 'PUBLISHED' ? 'Published' : 'Failed'}
                      </span>
                    </td>
                    <td className="max-w-[320px] px-5 py-3.5 text-[#5A6372]">
                      {r.permalink ? <a href={r.permalink} target="_blank" rel="noreferrer" className="text-[#1E40AF] hover:underline">View post</a> : null}
                      {r.error && <span className={cn('block break-words text-xs', r.result === 'FAILED' ? 'text-[#A8261B]' : 'text-[#8A4B00]')}>{r.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
