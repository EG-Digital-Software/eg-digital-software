import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currencyFmt = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
});

export function formatCurrency(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return currencyFmt.format(Number.isFinite(n) ? n : 0);
}

const numberFmt = new Intl.NumberFormat('en-AU');
export function formatNumber(value: number | null | undefined): string {
  return numberFmt.format(value ?? 0);
}

export function formatDate(date: string | Date | null | undefined, pattern = 'dd MMM yyyy'): string {
  if (!date) return '—';
  try {
    return format(new Date(date), pattern);
  } catch {
    return '—';
  }
}

export function initials(first?: string, last?: string): string {
  return `${(first?.[0] ?? '').toUpperCase()}${(last?.[0] ?? '').toUpperCase()}` || 'U';
}

export function formatPercent(value: number | null | undefined): string {
  const n = value ?? 0;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

/**
 * Resolve a backend-relative media path (e.g. "/uploads/avatars/x.png") to a
 * fully-qualified URL using the API origin, so it works in dev and production.
 */
export function mediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  // Absolute URLs, and local blob:/data: URLs (used for optimistic previews
  // before an upload finishes) are already complete — return them untouched.
  if (/^(https?:\/\/|blob:|data:)/i.test(path)) return path;
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
  const origin = apiBase.replace(/\/api\/?$/, '');
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Save a file under its own name. Uploaded files live on the storage origin,
 * where browsers ignore an <a download> link and just open the file, so fetch
 * it as a blob and save that; if the fetch is blocked, open it in a new tab.
 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

/** Click handler for a download link: saves the file instead of opening it. */
export function downloadOnClick(url: string, fileName: string) {
  return (e: { preventDefault(): void; stopPropagation(): void }) => {
    e.preventDefault();
    e.stopPropagation();
    void downloadFile(url, fileName);
  };
}

/**
 * Days an invoice is past its due date, or 0 when nothing is owed.
 *
 * Lives here rather than in each page so the admin Billing list, the invoice
 * detail view and the client portal can never drift apart on what "overdue"
 * means.
 */
export function daysOverdue(invoice: {
  total: string | number;
  amountPaid: string | number;
  dueDate: string;
  status: string;
}): number {
  if (Number(invoice.total) - Number(invoice.amountPaid) <= 0) return 0;
  if (invoice.status === 'CANCELLED' || invoice.status === 'DRAFT' || invoice.status === 'PAID') {
    return 0;
  }
  const diff = Date.now() - new Date(invoice.dueDate).getTime();
  return diff > 0 ? Math.floor(diff / 86_400_000) : 0;
}
