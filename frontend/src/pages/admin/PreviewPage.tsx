import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Download, Eye, FileText, Film, Image as ImageIcon, Search } from 'lucide-react';
import { adminApi, type ArchiveFile } from '@/api/resources';
import { PageHeader } from '@/components/shared/misc';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/shared/states';
import { customerName } from '@/lib/customer';
import { formatDate, mediaUrl } from '@/lib/utils';

type FileType = 'all' | 'image' | 'video' | 'other';

const isImage = (t?: string | null) => !!t && t.startsWith('image/');
const isVideo = (t?: string | null) => !!t && t.startsWith('video/');
const typeOf = (f: ArchiveFile): Exclude<FileType, 'all'> =>
  isImage(f.contentType) ? 'image' : isVideo(f.contentType) ? 'video' : 'other';

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Save a file under its own name. Storage lives on another origin, where the
 * `download` attribute is ignored, so fetch it as a blob first; if that is
 * blocked, open it in a new tab instead.
 */
async function downloadFile(url: string, fileName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

/**
 * Preview — every file archived on any task, in one place. A file shows up here
 * as soon as it is put in a task's Archive tab, and can be viewed or downloaded
 * at its original quality straight from this page.
 */
export default function PreviewPage() {
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState('');
  const [type, setType] = useState<FileType>('all');
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
          [f.fileName, f.taskNumber, f.taskTitle, customerName(f), f.uploadedByName ?? ''].some((s) =>
            s.toLowerCase().includes(q)
          ))
    );
  }, [files, search, customer, type]);

  return (
    <div className="ec-page">
      <PageHeader
        eyebrow="Admin"
        title="Preview"
        description="Every file archived on a task, in one place — view or download it at original quality."
      />

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
              <option key={id} value={id}>{name}</option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value as FileType)} className="lg:w-40">
            <option value="all">All files</option>
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
              description={
                files.length
                  ? 'Try a different search or filter.'
                  : "Files put in a task's Archive tab will appear here automatically."
              }
            />
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {shown.length} file{shown.length === 1 ? '' : 's'}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shown.map((f) => (
                  <ArchiveCard key={f.id} file={f} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ArchiveCard({ file: f }: { file: ArchiveFile }) {
  const url = mediaUrl(f.url) ?? '';
  const kind = typeOf(f);
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? Film : FileText;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex aspect-video items-center justify-center bg-secondary/50"
        title="Open"
      >
        {kind === 'image' ? (
          <img src={url} alt={f.fileName} className="h-full w-full object-cover" loading="lazy" />
        ) : kind === 'video' ? (
          <video src={url} className="h-full w-full object-cover" preload="metadata" muted />
        ) : (
          <FileText className="h-10 w-10 text-muted-foreground" />
        )}
      </a>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-sm font-medium" title={f.fileName}>{f.fileName}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground" title={`${f.taskNumber} · ${f.taskTitle}`}>
          <span className="mono">{f.taskNumber}</span> · {f.taskTitle}
        </div>
        <div className="truncate text-xs text-muted-foreground" title={customerName(f)}>
          {customerName(f)}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {humanSize(f.size)} · {formatDate(f.createdAt)}
          {f.uploadedByName ? ` · ${f.uploadedByName}` : ''}
        </div>

        <div className="mt-auto flex gap-2 pt-1.5">
          <a href={url} target="_blank" rel="noreferrer" className="btn bg flex-1 justify-center" style={{ fontSize: 12 }}>
            <Eye /> View
          </a>
          <button
            type="button"
            className="btn bp flex-1 justify-center"
            style={{ fontSize: 12 }}
            onClick={() => downloadFile(url, f.fileName)}
          >
            <Download /> Download
          </button>
        </div>
      </div>
    </div>
  );
}
