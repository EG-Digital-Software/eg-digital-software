import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { createInvoice, sendInvoiceEmail } from './invoice.service.js';

/**
 * Advance recurring billing.
 *
 * A licence group opted into advance payment is invoiced at the START of each
 * billing period. Billing runs on calendar months anchored to the 1st: the first
 * invoice after a mid-month start is pro-rated by the days left in that month,
 * and every later invoice is a full month.
 *
 * The payment term is NOT part of this — it only sets how long the client has to
 * pay each invoice (see resolveDueDate in invoice.service). The billing cycle is
 * carried by dates: `nextInvoiceDate` on the CustomerProduct is the driver, and
 * each generated invoice records the start of the following period as its own
 * `nextBillingDate`. After each invoice the cursor advances past that period, so
 * re-runs never double-bill and a lapsed scheduler catches up one period a loop.
 *
 * Advance billing is opted into per licence group (`advancePayment` plus a
 * `nextInvoiceDate` cursor); nothing about the term decides whether it recurs.
 */

// ── Date helpers (calendar, local server time) ──────────────
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function lastDayOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function firstOfNextMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface Period {
  start: Date;
  end: Date;
  /** Fraction of a full period this covers (1 for full; <1 for a pro-rated first month). */
  fraction: number;
  /** Start of the following period — what nextInvoiceDate becomes. */
  nextStart: Date;
}

/**
 * The calendar-month billing period that begins at `periodStart`. A period that
 * starts mid-month runs to that month's end and is pro-rated by the days it
 * covers; a period starting on the 1st is a full month (fraction 1).
 */
function computePeriod(periodStart: Date): Period {
  const start = startOfDay(periodStart);
  const dim = daysInMonth(start);
  const billedDays = dim - start.getDate() + 1; // inclusive of the start day
  return {
    start,
    end: lastDayOfMonth(start),
    fraction: billedDays / dim,
    nextStart: firstOfNextMonth(start),
  };
}

// ── Grouping ────────────────────────────────────────────────
type CpWithRels = Prisma.CustomerProductGetPayload<{
  include: { product: true; licence: true; customer: true };
}>;

function groupKey(cp: CpWithRels): string {
  return `${cp.customerId}::${cp.licence?.licenceKey ?? cp.id}`;
}

/**
 * Generate every due advance invoice for one licence group, catching up any
 * missed periods (one invoice per period). Returns the number of invoices made.
 */
async function billGroup(group: CpWithRels[], asOf: Date): Promise<number> {
  let made = 0;
  // The whole group shares nextInvoiceDate/term (mirrored on assignment). The
  // cursor alone decides whether this group recurs — the term is just the payment
  // window passed through to each invoice.
  let cursor = group[0]?.nextInvoiceDate;
  const term = group[0]?.invoicingTerm ?? null;
  const clientId = group[0]?.customer.clientId;
  if (!cursor || !clientId) return 0;

  const today = endOfDay(asOf);
  // Stop once the period start passes the licence expiry, if any.
  const expiry = group[0]?.expiryDate ? startOfDay(group[0].expiryDate) : null;

  // Catch-up loop: bill each period whose start is on/before today. Capped so a
  // bad date can never spin forever.
  for (let guard = 0; guard < 60 && cursor && startOfDay(cursor) <= today; guard++) {
    if (expiry && startOfDay(cursor) > expiry) {
      cursor = null;
      break;
    }
    const period = computePeriod(cursor);

    const items = group.map((cp) => {
      const units = cp.unitHoursEnabled ? Number(cp.unitHours) || 0 : 1;
      const net = round2((Number(cp.price) || 0) * units * period.fraction);
      const partial = period.fraction < 1 ? ` (${Math.round(period.fraction * 100)}% pro-rata)` : '';
      return {
        productId: cp.productId,
        sku: cp.licence?.licenceKey || cp.product.sku || cp.product.productCode || undefined,
        description: `${cp.product.name} — ${fmtDay(period.start)} to ${fmtDay(period.end)}${partial}`,
        quantity: 1,
        unitPrice: net,
        taxRate: Number(cp.taxRate ?? 10) || 0,
        contractType: (cp.contractType === 'TRIAL' ? 'TRIAL' : 'LOCKED') as 'LOCKED' | 'TRIAL',
        gstType: (cp.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE') as 'INCLUSIVE' | 'EXCLUSIVE',
      };
    });

    // Dated at the period start, carrying the next period's start as its billing
    // cycle. The due date is left to the term's payment window (resolveDueDate).
    const invoice = await createInvoice({
      clientId,
      invoiceDate: period.start,
      nextBillingDate: period.nextStart,
      term: term ?? undefined,
      discount: 0,
      status: 'SENT',
      notes: `Advance billing — ${fmtDay(period.start)} to ${fmtDay(period.end)}`,
      items,
    });
    made++;

    // Email the client (best-effort — the invoice already exists and is payable
    // in the portal even if delivery fails).
    try {
      await sendInvoiceEmail(invoice.id);
    } catch (err) {
      logger.warn({ err, invoiceId: invoice.id }, 'Advance invoice email failed (invoice kept)');
    }

    cursor = period.nextStart;
  }

  // Persist the advanced cursor across the whole group.
  const ids = group.map((cp) => cp.id);
  await prisma.customerProduct.updateMany({
    where: { id: { in: ids } },
    data: { nextInvoiceDate: cursor },
  });
  return made;
}

/**
 * Daily job: generate advance invoices for every licence group that is due.
 * Safe to run repeatedly — only periods whose start has arrived are billed, and
 * the cursor advances so nothing is billed twice.
 */
export async function runAdvanceBilling(asOf: Date = new Date()): Promise<{ groups: number; invoices: number }> {
  const due = await prisma.customerProduct.findMany({
    where: {
      advancePayment: true,
      status: 'ACTIVE',
      nextInvoiceDate: { not: null, lte: endOfDay(asOf) },
    },
    include: { product: true, licence: true, customer: true },
  });

  // Collapse into licence groups (fields are mirrored across a group).
  const groups = new Map<string, CpWithRels[]>();
  for (const cp of due) {
    const k = groupKey(cp);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(cp);
  }

  let invoices = 0;
  for (const group of groups.values()) {
    try {
      invoices += await billGroup(group, asOf);
    } catch (err) {
      logger.error({ err, group: groupKey(group[0]) }, 'Advance billing failed for a licence group');
    }
  }
  if (groups.size) logger.info({ groups: groups.size, invoices }, 'Advance billing run complete');
  return { groups: groups.size, invoices };
}

/**
 * Bill any advance groups that are already due for one customer — used right
 * after products are assigned so the first (pro-rated) invoice goes out at once
 * instead of waiting for the nightly run. Best-effort; never throws.
 */
export async function billCustomerNow(customerId: string): Promise<void> {
  try {
    const due = await prisma.customerProduct.findMany({
      where: {
        customerId,
        advancePayment: true,
        status: 'ACTIVE',
        nextInvoiceDate: { not: null, lte: endOfDay(new Date()) },
      },
      include: { product: true, licence: true, customer: true },
    });
    const groups = new Map<string, CpWithRels[]>();
    for (const cp of due) {
      const k = groupKey(cp);
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(cp);
    }
    for (const group of groups.values()) {
      await billGroup(group, new Date());
    }
  } catch (err) {
    logger.error({ err, customerId }, 'Immediate advance billing failed');
  }
}
