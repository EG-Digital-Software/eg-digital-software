import { useQuery } from '@tanstack/react-query';
import { portalApi, type InvoiceFilter } from '../api/portal';
import { useScope } from '../context/ScopeContext';
import { useAuth } from '../context/AuthContext';
import type { Address, ClientProduct, CustomerDocument, Task } from '../api/types';
import type { StepState } from '../ui';

// ─── Queries ──────────────────────────────────────────────

export function useProfile() {
  const { scopeKey, api } = useScope();
  // Polls so an admin's approval of an agreement shows without a refresh.
  return useQuery({ queryKey: ['profile', scopeKey], queryFn: portalApi.profile, enabled: !!api, refetchInterval: 15_000 });
}

export function useDashboard() {
  const { scopeKey, api } = useScope();
  return useQuery({ queryKey: ['dashboard', scopeKey], queryFn: portalApi.dashboard, enabled: !!api, refetchInterval: 60_000 });
}

export function useProducts() {
  const { scopeKey, api } = useScope();
  return useQuery({ queryKey: ['products', scopeKey], queryFn: portalApi.products, enabled: !!api });
}

export function useInvoices(filter: InvoiceFilter) {
  const { scopeKey, api } = useScope();
  return useQuery({ queryKey: ['invoices', scopeKey, filter], queryFn: () => portalApi.invoices(filter), enabled: !!api });
}

/** Notifications belong to whoever is signed in — a client or the admin. */
function useNotifyScope() {
  const { scopeKey, api } = useScope();
  const { user } = useAuth();
  const admin = user?.role === 'SUPER_ADMIN';
  return { key: admin ? `admin:${user!.id}` : scopeKey, enabled: admin || !!api };
}

export function useNotifications() {
  const { key, enabled } = useNotifyScope();
  return useQuery({ queryKey: ['notifications', key], queryFn: portalApi.notifications, enabled, refetchInterval: 30_000 });
}

export function useNotificationCount(): number {
  const { key, enabled } = useNotifyScope();
  const q = useQuery({
    queryKey: ['notifications-count', key],
    queryFn: portalApi.notificationCount,
    enabled,
    refetchInterval: 30_000,
  });
  return q.data?.unread ?? 0;
}

// ─── Money ────────────────────────────────────────────────

export function money(n: number, currency = 'AUD') {
  const v = Number.isFinite(n) ? n : 0;
  const sym = currency === 'AUD' || currency === 'USD' || currency === 'NZD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '';
  const s = v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sym ? `${v < 0 ? '-' : ''}${sym}${s.replace('-', '')}` : `${s} ${currency}`;
}

/** Short money for stat tiles: $400, $1.2k. */
export function moneyShort(n: number) {
  if (n >= 10_000) return `$${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

// ─── Products / licences ──────────────────────────────────

const unitsOf = (p: ClientProduct) => (p.unitHoursEnabled ? Number(p.unitHours) || 0 : 1);
const discounted = (p: ClientProduct) => (Number(p.price) || 0) * (1 - (Number(p.discountPercent) || 0) / 100);
/** Net (ex-GST) value of a licence: discounted agreed price × units. */
export const netOf = (p: ClientProduct) => discounted(p) * unitsOf(p);
/** GST is fixed at 10%; INCLUSIVE means it is already in the agreed price. */
export const grossOf = (p: ClientProduct) => (p.gstType === 'INCLUSIVE' ? netOf(p) : netOf(p) * 1.1);

/** Share of the licence term still left, 0–100 (null when open-ended). */
export function termLeft(p: ClientProduct, now = Date.now()): number | null {
  if (!p.expiryDate) return null;
  const start = new Date(p.issueDate).getTime();
  const end = new Date(p.expiryDate).getTime();
  if (!(end > start)) return 0;
  return Math.max(0, Math.min(100, Math.round(((end - now) / (end - start)) * 100)));
}

export const LICENCE_PILL: Record<string, { kind: 'ok' | 'warn' | 'red' | 'ns'; label: string }> = {
  ACTIVE: { kind: 'ok', label: 'Active' },
  EXPIRING_SOON: { kind: 'warn', label: 'Expiring soon' },
  CRITICAL: { kind: 'red', label: 'Renew now' },
  EXPIRED: { kind: 'red', label: 'Expired' },
  SUSPENDED: { kind: 'ns', label: 'Suspended' },
};

// ─── Agreements ───────────────────────────────────────────

export type Stage = 'sign' | 'rejected' | 'wait' | 'approved';

export const stageOf = (d: CustomerDocument): Stage =>
  d.status === 'APPROVED' ? 'approved' : d.status === 'SUBMITTED' ? 'wait' : d.status === 'REJECTED' ? 'rejected' : 'sign';

/** A shared agreement the client still has to fill in and sign. */
export const needsSignature = (d: CustomerDocument) => d.status !== 'APPROVED' && d.status !== 'SUBMITTED';

export const STAGE: Record<Stage, { label: string; kind: 'warn' | 'red' | 'info' | 'ok' }> = {
  sign: { label: 'Signature needed', kind: 'warn' },
  rejected: { label: 'Not approved', kind: 'red' },
  wait: { label: 'Awaiting approval', kind: 'info' },
  approved: { label: 'Approved', kind: 'ok' },
};

/** "EG-Task-Order-Website-Redesign.pdf" → "EG Task Order Website Redesign". */
export const docTitle = (d: CustomerDocument) => d.fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();

export const isPdf = (d: CustomerDocument) => d.contentType === 'application/pdf' || /\.pdf$/i.test(d.fileName);

const short = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }) : '';

export function agreementSteps(d: CustomerDocument): { label: string; state: StepState }[] {
  const issued = { label: `Issued ${short(d.createdAt)}`, state: 'done' as StepState };
  switch (stageOf(d)) {
    case 'sign':
      return [issued, { label: 'Your signature', state: 'now' }, { label: 'Approval', state: 'todo' }];
    case 'rejected':
      return [issued, { label: 'Not approved', state: 'bad' }, { label: 'Sign again', state: 'todo' }];
    case 'wait':
      return [issued, { label: `Sent ${short(d.submittedAt ?? d.signedAt)}`, state: 'done' }, { label: 'Approval', state: 'wait' }];
    default:
      return [
        issued,
        { label: `Signed ${short(d.signedAt ?? d.submittedAt)}`, state: 'done' },
        { label: `Approved ${short(d.approvedAt)}`, state: 'done' },
      ];
  }
}

// ─── Tasks (client view) ──────────────────────────────────

const STAFF_FALLBACK = 'EG Digital Team';
/** Clients never see employees — only the task's assigned team. */
export const teamName = (t: Pick<Task, 'assignedTeam'>) => t.assignedTeam || STAFF_FALLBACK;

export const PROGRESS_PILL: Record<string, { kind: 'on' | 'ns' | 'ok'; label: string }> = {
  NOT_STARTED: { kind: 'ns', label: 'Not started' },
  IN_PROGRESS: { kind: 'on', label: 'In progress' },
  ONGOING: { kind: 'on', label: 'Ongoing' },
  COMPLETED: { kind: 'ok', label: 'Completed' },
};

export const isActiveTask = (t: Pick<Task, 'progress'>) => t.progress === 'IN_PROGRESS' || t.progress === 'ONGOING';

// ─── Company ──────────────────────────────────────────────

export function addressLine(a: Address) {
  return [a.line1, a.line2, a.suburb || a.city, [a.state, a.postcode].filter(Boolean).join(' ')]
    .map((p) => (p ?? '').toString().trim())
    .filter(Boolean)
    .join(', ');
}

export const ADDRESS_LABEL: Record<string, string> = {
  PRINCIPAL: 'Principal',
  BILLING: 'Billing',
  SHIPPING: 'Shipping',
  POSTAL: 'Postal',
  REGISTERED: 'Registered',
};

const COUNTRY: Record<string, [string, string]> = {
  AU: ['Australia', 'AUD'],
  NZ: ['New Zealand', 'NZD'],
  GB: ['United Kingdom', 'GBP'],
  US: ['United States', 'USD'],
  IN: ['India', 'INR'],
};
export const countryLabel = (code?: string | null) => {
  const c = COUNTRY[(code || 'AU').toUpperCase()];
  return c ? `${c[0]} · ${c[1]}` : code ?? '';
};

/** "RETAIL_AND_WHOLESALE" → "Retail And Wholesale". */
export const prettyEnum = (v?: string | null) =>
  v ? v.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

export const formatAbn = (v?: string | null) => (v ? v.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4') : '');
export const formatAcn = (v?: string | null) => (v ? v.replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3') : '');

// ─── Time (Melbourne is EG Eloma's home time zone) ───────

export const HOME_TZ = 'Australia/Melbourne';

/** "8:18 PM AWST" in a time zone (device zone when omitted). */
export function clockIn(tz?: string) {
  try {
    const o: Record<string, string> = {};
    new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date())
      .forEach((p) => (o[p.type] = p.value));
    return `${o.hour}:${o.minute} ${(o.dayPeriod || '').toUpperCase()} ${o.timeZoneName ?? ''}`.trim();
  } catch {
    return '';
  }
}

/** Mon–Fri, 9am–5pm Melbourne time. */
export function officeOpen(): boolean {
  try {
    let h = 12;
    let wd = 'Mon';
    new Intl.DateTimeFormat('en-AU', { timeZone: HOME_TZ, hour: 'numeric', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(new Date())
      .forEach((p) => {
        if (p.type === 'hour') h = Number(p.value);
        if (p.type === 'weekday') wd = p.value;
      });
    return wd !== 'Sat' && wd !== 'Sun' && h >= 9 && h < 17;
  } catch {
    return false;
  }
}

// Victorian public holidays (Business Victoria) — same list as the web portal.
const HOLIDAYS: [string, string][] = [
  ['2026-12-25', 'Christmas Day'],
  ['2026-12-26', 'Boxing Day'],
  ['2026-12-28', 'Boxing Day (substitute)'],
  ['2027-01-01', 'New Year’s Day'],
  ['2027-01-26', 'Australia Day'],
  ['2027-03-08', 'Labour Day'],
  ['2027-03-26', 'Good Friday'],
  ['2027-03-27', 'Saturday before Easter Sunday'],
  ['2027-03-28', 'Easter Sunday'],
  ['2027-03-29', 'Easter Monday'],
  ['2027-04-25', 'ANZAC Day'],
  ['2027-06-14', 'King’s Birthday'],
  ['2027-11-02', 'Melbourne Cup'],
  ['2027-12-25', 'Christmas Day'],
  ['2027-12-26', 'Boxing Day'],
  ['2027-12-27', 'Christmas Day (substitute)'],
  ['2027-12-28', 'Boxing Day (substitute)'],
];

function melbourneTodayUTC() {
  try {
    const o: Record<string, string> = {};
    new Intl.DateTimeFormat('en-AU', { timeZone: HOME_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
      .forEach((p) => (o[p.type] = p.value));
    return Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day));
  } catch {
    const d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
}

export function nextHoliday(): { name: string; date: string; days: number } | null {
  const today = melbourneTodayUTC();
  for (const [iso, name] of HOLIDAYS) {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    const t = Date.UTC(y, m - 1, d);
    if (t >= today) {
      const date = new Date(t).toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
      return { name, date, days: Math.round((t - today) / 86_400_000) };
    }
  }
  return null;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const SUPPORT_PHONE = '1800 054 555';
export const BLOOD_URL = 'https://my.donateblood.com.au/app/myteams_home/Eloma%20Group?orgId=209771';
