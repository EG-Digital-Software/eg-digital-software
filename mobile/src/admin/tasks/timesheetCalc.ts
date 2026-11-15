/**
 * Time Sheet arithmetic — how a pool is drawn down month by month. A copy of the
 * web's frontend/src/lib/timesheet.ts (which mirrors backend/src/utils/timesheet.ts);
 * keep the three in step.
 */
import type { EntryStatus, TimeSheetEntry, TimeSheetPool } from '../../api/admin/tasks';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whether an entry draws on the pool: not yet with the client, or rejected, it does not. */
export const counts = (e: { status?: string }) => !e.status || e.status === 'PENDING' || e.status === 'APPROVED';

const monthOf = (date: string) => date.slice(0, 7);

function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.slice(0, 7).split('-').map(Number) as [number, number];
  const [ey, em] = end.slice(0, 7).split('-').map(Number) as [number, number];
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
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

type Rules = Pick<TimeSheetPool, 'taskIds' | 'termStart' | 'termEnd' | 'poolHours' | 'monthlyHours' | 'monthlyMax' | 'monthlyAlertAt' | 'poolAlertAt' | 'extraRate'>;

/** Where a pool stands on `asOf` (YYYY-MM-DD): every month of the term plus the totals. */
export function summarisePool(
  rules: Rules,
  entries: Pick<TimeSheetEntry, 'taskId' | 'status' | 'date' | 'actualHours'>[],
  asOf: string,
  approvals: { date: string; hours: number }[] = []
) {
  const mine = entries.filter((e) => rules.taskIds.includes(e.taskId) && counts(e));
  const thisMonth = monthOf(asOf);
  let balance = rules.poolHours;
  let cumulative = 0;
  const rows: PoolMonth[] = [];

  for (const month of monthsBetween(rules.termStart, rules.termEnd)) {
    const usedByTask: Record<string, number> = Object.fromEntries(rules.taskIds.map((id) => [id, 0]));
    for (const e of mine) {
      if (monthOf(e.date) === month) usedByTask[e.taskId] = round2((usedByTask[e.taskId] ?? 0) + e.actualHours);
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
export type Summary = ReturnType<typeof summarisePool>;

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  ADMIN_PENDING: 'Admin approval pending',
  ADMIN_REJECTED: 'Rejected by admin',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const TIME_PRIORITIES = ['Phase', 'P1', 'P2', 'P3', 'P4'] as const;
export const TIME_CATEGORIES = [
  'Discovery', 'Design', 'Build', 'Integration', 'Testing', 'Azure', 'Deployment',
  'Fix', 'Change', 'Content', 'Maintenance', 'Meeting', 'Training', 'Documentation',
] as const;
export const TIME_STAFF = ['Designer', 'Developer', 'Social Media', 'SEO'] as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
};
export const dayLabel = (date: string) => {
  const [y, m, d] = date.slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
};
export const rangeLabel = (start: string, end: string) => (end && end !== start ? `${dayLabel(start)} – ${dayLabel(end)}` : dayLabel(start));
export const hoursLabel = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;
export const money = (n: number) => `$${n.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** A fresh random request ID, e.g. REQ-5ABC-5DEF. The API rejects one already in use. */
export function newRequestId(): string {
  const group = () => Array.from({ length: 4 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('');
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
