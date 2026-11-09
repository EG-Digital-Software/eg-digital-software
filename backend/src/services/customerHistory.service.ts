import { ActivityAction, CustomerAccountStatus, PaymentStatus, type Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { effectiveAccountStatus } from '../utils/accountStatus.js';

/**
 * A customer's Account History: when invoices were paid, and the account's
 * standing over time — when a trial started and how long it ran, each renewal
 * (when, for how long, from and until), and other status changes — plus where
 * the account stands today. Newest first.
 *
 * Paid dates come from the payments themselves. Standing changes come from the
 * activity log (renewals, and status changes recorded from → to); an account
 * that is on trial with no recorded start is taken to have started it when the
 * account was opened.
 */

export type HistoryKind = 'payment' | 'account';

export interface HistoryEvent {
  id: string;
  at: Date;
  kind: HistoryKind;
  title: string;
  detail?: string | null;
  /** Admin route to the related record, when it still exists. */
  link?: string | null;
}

export interface HistorySummary {
  /** Where the account stands today (ACTIVE, ACTIVE_TRIAL, DORMANT, SUSPENDED). */
  status: CustomerAccountStatus;
  /** End of the current renewal, when there is one. */
  activeUntil: Date | null;
  /** Whole days left on the current renewal (0 once it has run out). */
  daysLeft: number | null;
  /** When the current trial started, while the account is on trial. */
  trialSince: Date | null;
  /** Days the current trial has run so far. */
  trialDays: number | null;
}

const DAY_MS = 86_400_000;
const daysBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY_MS));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 08 Sep 2026 */
const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const money = (v: Prisma.Decimal | number | string, currency = 'AUD') =>
  `${currency} ${Number(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABEL: Record<CustomerAccountStatus, string> = {
  ACTIVE: 'Active',
  ACTIVE_TRIAL: 'Trial',
  DORMANT: 'Dormant',
  SUSPENDED: 'Suspended',
};

type Meta = Record<string, unknown>;
const metaOf = (m: Prisma.JsonValue | null): Meta =>
  m && typeof m === 'object' && !Array.isArray(m) ? (m as Meta) : {};
const dateOf = (v: unknown): Date | null => (typeof v === 'string' && !isNaN(Date.parse(v)) ? new Date(v) : null);
const statusOf = (v: unknown): CustomerAccountStatus | null =>
  typeof v === 'string' && v in STATUS_LABEL ? (v as CustomerAccountStatus) : null;

export async function getCustomerHistory(
  clientId: string
): Promise<{ summary: HistorySummary; events: HistoryEvent[] }> {
  const customer = await prisma.customer.findUnique({
    where: { clientId },
    select: {
      id: true,
      createdAt: true,
      accountStatus: true,
      accountRenewedUntil: true,
      invoices: {
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          payments: {
            where: { status: PaymentStatus.SUCCESS },
            select: { id: true, amount: true, currency: true, paymentMethod: true, paidAt: true, createdAt: true },
          },
        },
      },
    },
  });
  if (!customer) throw ApiError.notFound('Customer not found');

  const events: HistoryEvent[] = [];

  // ── Invoices paid ──
  for (const inv of customer.invoices) {
    for (const p of inv.payments) {
      events.push({
        id: `payment-${p.id}`,
        at: p.paidAt ?? p.createdAt,
        kind: 'payment',
        title: `Invoice ${inv.invoiceNumber} paid`,
        detail: [money(p.amount, p.currency), p.paymentMethod ? `via ${p.paymentMethod}` : null]
          .filter(Boolean)
          .join(' · '),
        link: `/admin/billing/${inv.id}`,
      });
    }
  }

  // ── Account standing, oldest first so each trial's start is known when it ends ──
  const logs = await prisma.activityLog.findMany({
    where: {
      entityType: 'Customer',
      entityId: customer.id,
      action: { in: [ActivityAction.CUSTOMER_CREATED, ActivityAction.CUSTOMER_UPDATED] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, action: true, createdAt: true, metadata: true },
  });

  let trialStart: Date | null = null;
  const startTrial = (id: string, at: Date) => {
    trialStart = at;
    events.push({ id, at, kind: 'account', title: 'Trial started' });
  };
  /** "Trial ran 26 Aug 2026 → 12 Nov 2026 (78 days)" for a trial ending at `end`. */
  const trialRan = (end: Date) => {
    const start = trialStart ?? customer.createdAt;
    trialStart = null;
    return `Trial ran ${fmt(start)} → ${fmt(end)} (${daysBetween(start, end)} days)`;
  };

  for (const l of logs) {
    const meta = metaOf(l.metadata);
    if (l.action === ActivityAction.CUSTOMER_CREATED) {
      if (statusOf(meta.accountStatus) === CustomerAccountStatus.ACTIVE_TRIAL) startTrial(`log-${l.id}`, l.createdAt);
      continue;
    }

    // Renewal: when, for how long, from and until — and the trial it ended.
    if (meta.renewedMonths != null) {
      const months = Number(meta.renewedMonths);
      const from = dateOf(meta.renewedFrom) ?? l.createdAt;
      const until = dateOf(meta.renewedUntil);
      const endedTrial =
        statusOf(meta.previousStatus) === CustomerAccountStatus.ACTIVE_TRIAL ||
        (meta.previousStatus === undefined && trialStart !== null);
      events.push({
        id: `log-${l.id}`,
        at: l.createdAt,
        kind: 'account',
        title: `Account renewed for ${months} month${months === 1 ? '' : 's'}${until ? ` (${daysBetween(from, until)} days)` : ''}`,
        detail: [
          until ? `Active ${fmt(from)} → ${fmt(until)}` : null,
          endedTrial ? trialRan(l.createdAt) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      });
      continue;
    }

    // Status changed by hand, recorded from → to.
    const from = statusOf(meta.statusFrom);
    const to = statusOf(meta.statusTo);
    if (!to || from === to) continue;
    if (to === CustomerAccountStatus.ACTIVE_TRIAL) {
      startTrial(`log-${l.id}`, l.createdAt);
    } else if (from === CustomerAccountStatus.ACTIVE_TRIAL) {
      events.push({
        id: `log-${l.id}`,
        at: l.createdAt,
        kind: 'account',
        title: `Trial ended — account ${STATUS_LABEL[to].toLowerCase()}`,
        detail: trialRan(l.createdAt),
      });
    } else {
      events.push({
        id: `log-${l.id}`,
        at: l.createdAt,
        kind: 'account',
        title: `Status changed to ${STATUS_LABEL[to]}`,
        detail: from ? `Was ${STATUS_LABEL[from]}` : null,
      });
    }
  }

  // ── Where it stands today ──
  const now = new Date();
  const status = effectiveAccountStatus(
    customer.accountStatus,
    customer.invoices.map((i) => i.invoiceDate),
    customer.createdAt,
    customer.accountRenewedUntil
  );
  const onTrial = status === CustomerAccountStatus.ACTIVE_TRIAL;
  // On trial with no recorded start: it began when the account was opened.
  if (onTrial && !trialStart) startTrial(`trial-${customer.id}`, customer.createdAt);
  const trialSince: Date | null = onTrial ? trialStart : null;
  const activeUntil = customer.accountRenewedUntil;

  return {
    summary: {
      status,
      activeUntil,
      daysLeft: activeUntil ? daysBetween(now, activeUntil) : null,
      trialSince,
      trialDays: trialSince ? daysBetween(trialSince, now) : null,
    },
    events: events.sort((a, b) => b.at.getTime() - a.at.getTime()),
  };
}
