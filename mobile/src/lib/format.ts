export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]!.toUpperCase())
      .join('') || '?'
  );
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
const daysAgo = (iso: string) => Math.round((dayStart(new Date()) - dayStart(new Date(iso))) / 86_400_000);

/** Chat-list stamp: 14:05 today, "Yesterday", weekday this week, else a date. */
export function formatStamp(iso: string): string {
  const days = daysAgo(iso);
  if (days === 0) return formatTime(iso);
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short' });
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/** Day separator label inside a chat. */
export function formatDay(iso: string): string {
  const days = daysAgo(iso);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export const sameDay = (a: string, b: string) => dayStart(new Date(a)) === dayStart(new Date(b));

export function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export const isImage = (contentType?: string | null, fileName?: string) =>
  (contentType ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(fileName ?? '');
