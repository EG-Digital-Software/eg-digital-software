/**
 * Time Sheet arithmetic — how a pool is drawn
 * down month by month. Mirrored in frontend/src/lib/timesheet.ts (the board
 * shows the same figures); keep the two in step.
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
  /**
   * ADMIN_PENDING (over the monthly maximum, waiting for the admin), PENDING
   * (waiting for the client), APPROVED, REJECTED or ADMIN_REJECTED. Only
   * PENDING and APPROVED entries count against the pool.
   */
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
