/**
 * Time Sheet arithmetic — how a pool is drawn
 * down month by month. Mirrors backend/src/utils/timesheet.ts, which enforces
 * the same rules when time is logged; keep the two in step.
 */

export interface PoolRules {
  taskIds: string[];
  /** YYYY-MM-DD */
  termStart: string;
  /** YYYY-MM-DD */
  termEnd: string;
  poolHours: number;
  /** Hours normally used in a month. */
  monthlyHours: number;
  /** Most that may be used in one month when needed. */
  monthlyMax: number;
  monthlyAlertAt: number;
  poolAlertAt: number;
  extraRate: number;
}

export interface PoolEntry {
  taskId: string;
  /** See EntryStatus. Only PENDING and APPROVED entries count against the pool. */
  status?: string;
  /** YYYY-MM-DD */
  date: string;
  actualHours: number;
}

export interface PoolApproval {
  /** YYYY-MM-DD */
  date: string;
  hours: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whether an entry draws on the pool: not yet with the client, or rejected, it does not. */
export const counts = (e: { status?: string }) => !e.status || e.status === 'PENDING' || e.status === 'APPROVED';

const monthOf = (date: string) => date.slice(0, 7);

function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.slice(0, 7).split('-').map(Number);
  const [ey, em] = end.slice(0, 7).split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export interface PoolMonth {
  month: string;
  status: 'closed' | 'current' | 'upcoming';
  usedByTask: Record<string, number>;
  used: number;
  balanceStart: number;
  balanceEnd: number;
  cumulativeUsed: number;
  extraHours: number;
  extraCharge: number;
  overMonthlyHours: number;
  overMonthlyMax: number;
  monthlyAlert: boolean;
  poolAlert: boolean;
}

/** Where a pool stands on `asOf` (YYYY-MM-DD): every month of the term plus the totals. */
export function summarisePool(rules: PoolRules, entries: PoolEntry[], asOf: string, approvals: PoolApproval[] = []) {
  const mine = entries.filter((e) => rules.taskIds.includes(e.taskId) && counts(e));
  const thisMonth = monthOf(asOf);
  let balance = rules.poolHours;
  let cumulative = 0;
  const rows: PoolMonth[] = [];

  for (const month of monthsBetween(rules.termStart, rules.termEnd)) {
    const usedByTask: Record<string, number> = Object.fromEntries(rules.taskIds.map((id) => [id, 0]));
    for (const e of mine) {
      if (monthOf(e.date) === month) usedByTask[e.taskId] = round2(usedByTask[e.taskId] + e.actualHours);
    }
    const used = round2(Object.values(usedByTask).reduce((a, b) => a + b, 0));
    const status: PoolMonth['status'] = month < thisMonth ? 'closed' : month === thisMonth ? 'current' : 'upcoming';
    const balanceStart = balance;
    const cumulativeBefore = cumulative;
    cumulative = round2(cumulative + used);
    const extraHours = round2(Math.max(0, used - balanceStart));
    balance = round2(Math.max(0, balanceStart - used));

    rows.push({
      month,
      status,
      usedByTask,
      used,
      balanceStart,
      balanceEnd: balance,
      cumulativeUsed: cumulative,
      extraHours,
      extraCharge: round2(extraHours * rules.extraRate),
      overMonthlyHours: round2(Math.max(0, used - rules.monthlyHours)),
      overMonthlyMax: round2(Math.max(0, used - rules.monthlyMax)),
      monthlyAlert: used >= rules.monthlyAlertAt,
      poolAlert: cumulativeBefore < rules.poolAlertAt && cumulative >= rules.poolAlertAt,
    });
  }

  const current = rows.find((r) => r.status === 'current');
  const extraHours = round2(rows.reduce((a, r) => a + r.extraHours, 0));
  const extraApproved = round2(approvals.filter((a) => a.date <= asOf).reduce((a, x) => a + x.hours, 0));
  const extraRemaining = round2(Math.max(0, extraApproved - extraHours));
  // Every logged hour of the term draws on the pool, whichever month it is dated in.
  const poolLeft = round2(rules.poolHours - cumulative);
  const headroom = Math.max(0, poolLeft);
  return {
    rows,
    current,
    totalUsed: cumulative,
    balance: poolLeft,
    extraHours,
    extraCharge: round2(extraHours * rules.extraRate),
    extraApproved,
    extraRemaining,
    extraUnapproved: round2(Math.max(0, extraHours - extraApproved)),
    availableThisMonth: current ? round2(Math.max(0, Math.min(rules.monthlyMax - current.used, headroom + extraRemaining))) : 0,
    poolExhausted: poolLeft <= 0,
    workPaused: poolLeft <= 0 && extraRemaining <= 0,
  };
}

// ─── Board data (as the API returns it) ──────────────────

export interface TimeSheetEntry extends PoolEntry {
  id: string;
  /** Last day of the work; the same as `date` for a one-day entry. */
  endDate: string;
  requestId: string;
  priority: string;
  category: string;
  description: string;
  staff: string;
  notes?: string | null;
  authorName: string;
  status: EntryStatus;
  rejectReason?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
}

/**
 * Sign-off on a logged entry. A team member's entry over the month's maximum is
 * first an approval request for the admin (ADMIN_PENDING / ADMIN_REJECTED, kept
 * off the client's sheet); every other entry waits for the client (PENDING).
 */
export type EntryStatus = 'ADMIN_PENDING' | 'ADMIN_REJECTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  ADMIN_PENDING: 'Admin approval pending',
  ADMIN_REJECTED: 'Rejected by admin',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export interface TimeSheetApproval extends PoolApproval {
  id: string;
  reference?: string | null;
  approvedBy: string;
}

export interface TimeSheetPool extends PoolRules {
  id: string;
  name: string;
  tasks: { taskId: string; taskNumber: string; title: string; label?: string | null }[];
  entries: TimeSheetEntry[];
  approvals: TimeSheetApproval[];
}

export interface TimeSheetData {
  /** Today on the business calendar (YYYY-MM-DD). */
  today: string;
  pools: TimeSheetPool[];
}

export interface TimeSheetPoolInput {
  name: string;
  termStart: string;
  termEnd: string;
  poolHours: number;
  monthlyHours: number;
  monthlyMax: number;
  monthlyAlertAt: number;
  poolAlertAt: number;
  extraRate: number;
  tasks: { taskId: string; label?: string | null }[];
}

export interface TimeSheetEntryInput {
  taskId: string;
  date: string;
  endDate: string;
  requestId: string;
  priority: string;
  category: string;
  description: string;
  staff: string;
  actualHours: number;
  notes?: string;
}

export const TIME_PRIORITIES = ['Phase', 'P1', 'P2', 'P3', 'P4'] as const;
export const TIME_CATEGORIES = [
  'Discovery', 'Design', 'Build', 'Integration', 'Testing', 'Azure', 'Deployment',
  'Fix', 'Change', 'Content', 'Maintenance', 'Meeting', 'Training', 'Documentation',
] as const;
/** Who did the work, as shown on the time sheet. */
export const TIME_STAFF = ['Designer', 'Developer', 'Social Media', 'SEO'] as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11" → "Nov 2026" */
export const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
/** "2026-11-03" → "03 Nov 2026" */
export const dayLabel = (date: string) => {
  const [y, m, d] = date.slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
};
/** One day, or "03 Nov 2026 – 05 Nov 2026" for a span. */
export const rangeLabel = (start: string, end: string) => (end && end !== start ? `${dayLabel(start)} – ${dayLabel(end)}` : dayLabel(start));
/** 2 → "2 h", 2.5 → "2.5 h" */
export const hoursLabel = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;
/** 360 → "$360" */
export const money = (n: number) => `$${n.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** A fresh random request ID, e.g. REQ-5ABC-5DEF. The API rejects one already in use. */
export function newRequestId(): string {
  const group = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => ID_CHARS[n % ID_CHARS.length]).join('');
  return `REQ-${group()}-${group()}`;
}

/** The time sheet as CSV, oldest entry first. */
export function timeSheetCsv(entries: TimeSheetEntry[], taskName: (id: string) => string): string {
  const head = ['Start Date', 'End Date', 'Task', 'Request ID', 'Priority', 'Category', 'Description', 'Staff', 'Hours', 'Notes', 'Status', 'Reject Reason'];
  const cell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = entries.map((e) =>
    [e.date, e.endDate, taskName(e.taskId), e.requestId, e.priority, e.category, e.description, e.staff, e.actualHours, e.notes ?? '', ENTRY_STATUS_LABEL[e.status] ?? e.status, e.rejectReason ?? '']
      .map(cell)
      .join(',')
  );
  return [head.map(cell).join(','), ...rows].join('\n');
}
