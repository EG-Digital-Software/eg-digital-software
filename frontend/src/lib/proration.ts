import type { CustomerProduct } from '@/types';

/**
 * Shared billing-period + pro-ration helpers for the invoice create and edit
 * forms, so both compute an invoice's billing period and line amounts exactly
 * the same way.
 *
 * Two independent dates come off an invoice, and they must not be conflated:
 *
 *   * **Term** is the payment window only — how long the client has to pay.
 *     Due on receipt = the invoice date itself; Net 7 = seven days later.
 *     It never affects what is billed. Mirrors the backend's resolveDueDate.
 *   * **Next billing date** is when the following invoice is raised, and it is
 *     what drives the billing period and pro-rata. Monthly billing puts it on
 *     the 1st of the next month, so an invoice issued mid-month covers only the
 *     days that remain (issue day → next billing date, exclusive).
 */

/** Per-product Unit/Hours multiplier (1 when the product isn't unit-priced). */
export function productUnits(cp: CustomerProduct): number {
  return cp.unitHoursEnabled ? Number(cp.unitHours) || 0 : 1;
}

/** Net line value for a product = agreed price × units. */
export function productNet(cp: CustomerProduct): number {
  return (Number(cp.price) || 0) * productUnits(cp);
}

/** A licence group = all products that share one licence key — one "row" in the
 *  customer's Products & Licences table, and one selectable invoice line. */
export interface LicenceGroup {
  key: string;
  licenceKey: string;
  items: CustomerProduct[];
}

/** Group a customer's assigned products by licence key. Products without a
 *  licence stand alone under their own assignment id. */
export function buildLicenceGroups(customerProducts?: CustomerProduct[]): LicenceGroup[] {
  const map = new Map<string, LicenceGroup>();
  for (const cp of customerProducts ?? []) {
    const licenceKey = cp.licence?.licenceKey ?? '';
    const key = licenceKey || cp.id;
    if (!map.has(key)) map.set(key, { key, licenceKey, items: [] });
    map.get(key)!.items.push(cp);
  }
  return [...map.values()];
}

/** The licence group a line's product belongs to, if any. */
export function findLicenceGroup(
  groups: LicenceGroup[],
  productId?: string | null
): LicenceGroup | undefined {
  return productId ? groups.find((g) => g.items.some((cp) => cp.product.id === productId)) : undefined;
}

/** Full agreed net for a licence group (all its products, before pro-rata). */
export function licenceGroupNet(group: LicenceGroup): number {
  return group.items.reduce((sum, cp) => sum + productNet(cp), 0);
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 08-Sep-2026 */
export function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** A Date → "YYYY-MM-DD" from local parts, so it matches the displayed day
 *  (toISOString would shift month-end back a day in a UTC+ timezone). */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Days the term gives the client to pay, counted from the invoice date. Only two
 * terms are offered now (due on receipt, net 7), but invoices and product
 * assignments written before that still carry longer terms, so those keep
 * resolving to their own length rather than silently becoming net 7.
 */
export function termToDays(term?: string | null): number {
  switch ((term ?? '').trim()) {
    case '':
    case 'DUE_ON_RECEIPT':
    case 'Due on Receipt':
      return 0;
    case 'NET_7':
    case '7 Days':
      return 7;
    default: {
      // Legacy terms (NET_30, "90 Days", a hand-typed "Net 21 days"…).
      const m = /(\d+)/.exec(term ?? '');
      return m ? parseInt(m[1], 10) : 0;
    }
  }
}

/** Days in the calendar month `d` falls in. */
function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** A date shifted by whole days, with the time cleared. */
function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return x;
}

/** Parse a "YYYY-MM-DD" form value as a local date (never UTC). */
export function parseDateInput(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * The due date: invoice date + the term's payment window. This is the only thing
 * the term decides — it is independent of the billing period.
 */
export function computeDueDate(invoiceDate?: string, term?: string | null): Date | null {
  const start = parseDateInput(invoiceDate) ?? new Date();
  if (isNaN(start.getTime())) return null;
  return addDays(start, termToDays(term));
}

/**
 * Default next billing date for monthly billing: the 1st of the month after the
 * invoice date. This is the old 30-day term's month-end logic, expressed as the
 * day the next invoice is raised rather than as a payment term.
 */
export function defaultNextBillingDate(invoiceDate?: string): Date | null {
  const start = parseDateInput(invoiceDate) ?? new Date();
  if (isNaN(start.getTime())) return null;
  return new Date(start.getFullYear(), start.getMonth() + 1, 1);
}

export interface Proration {
  start: Date;
  end: Date;
  fraction: number;
  billedDays: number;
  periodDays: number;
}

/**
 * Billing period + pro-ration for an invoice.
 *
 * The period runs from the invoice date up to (but not including) the next
 * billing date, and the fraction is those days over a full month — so an invoice
 * issued on the 12th of a 31-day month with the next billing on the 1st bills
 * 20/31 of the agreed monthly price. A next billing date pushed further out
 * bills proportionally more, which is what an admin overriding it intends.
 */
export function computeProration(invoiceDate?: string, nextBillingDate?: string): Proration | null {
  const start = parseDateInput(invoiceDate) ?? new Date();
  if (isNaN(start.getTime())) return null;
  const next = parseDateInput(nextBillingDate) ?? defaultNextBillingDate(invoiceDate);
  if (!next) return null;
  const periodDays = daysInMonth(start);
  const billedDays = Math.round((next.getTime() - start.getTime()) / 86_400_000);
  // A next billing date on or before the invoice date bills nothing.
  if (billedDays <= 0) {
    return { start, end: start, fraction: 0, billedDays: 0, periodDays };
  }
  return {
    start,
    // The period's last day — the day before the next invoice is raised.
    end: addDays(next, -1),
    fraction: billedDays / periodDays,
    billedDays,
    periodDays,
  };
}
