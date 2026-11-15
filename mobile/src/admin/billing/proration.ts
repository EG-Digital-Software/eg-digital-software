import type { BillingCustomerProduct } from '../../api/admin/billing';

/**
 * Billing period + pro-ration helpers — a straight port of the web's
 * `frontend/src/lib/proration.ts` and the invoice-term helpers in
 * `frontend/src/lib/customer.ts`, so the phone computes an invoice's billing
 * period, line amounts and totals exactly as the web create/edit forms do.
 *
 *   * Term = the payment window only (due on receipt / net 7 …).
 *   * Next billing date = drives the billing period and the pro-rata.
 */

// ─── Terms ────────────────────────────────────────────────

export const INVOICE_TERMS = [
  { value: 'DUE_ON_RECEIPT', label: 'Due on receipt' },
  { value: 'NET_7', label: 'Net 7 days' },
] as const;

const LEGACY_TERM_LABELS: Record<string, string> = {
  NET_14: 'Net 14 days',
  NET_30: 'Net 30 days',
  NET_45: 'Net 45 days',
  NET_60: 'Net 60 days',
  NET_90: 'Net 90 days',
  'Due on Receipt': 'Due on receipt',
  '7 Days': 'Net 7 days',
  '14 Days': 'Net 14 days',
  '15 Days': 'Net 15 days',
  '30 Days': 'Net 30 days',
  '60 Days': 'Net 60 days',
  '90 Days': 'Net 90 days',
};

export function invoiceTermLabel(value?: string | null): string {
  if (!value) return '';
  return INVOICE_TERMS.find((t) => t.value === value)?.label ?? LEGACY_TERM_LABELS[value] ?? value;
}

export function normalizeInvoiceTerm(value?: string | null): string {
  if (!value) return '';
  if (INVOICE_TERMS.some((t) => t.value === value)) return value;
  if (value === 'Due on Receipt') return 'DUE_ON_RECEIPT';
  if (value === '7 Days') return 'NET_7';
  return value;
}

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
      const m = /(\d+)/.exec(term ?? '');
      return m ? parseInt(m[1]!, 10) : 0;
    }
  }
}

// ─── Products / licence groups ────────────────────────────

export function productUnits(cp: BillingCustomerProduct): number {
  return cp.unitHoursEnabled ? Number(cp.unitHours) || 0 : 1;
}

export function discountedPrice(cp: Pick<BillingCustomerProduct, 'price' | 'discountPercent'>): number {
  return (Number(cp.price) || 0) * (1 - (Number(cp.discountPercent) || 0) / 100);
}

export function productNet(cp: BillingCustomerProduct): number {
  return discountedPrice(cp) * productUnits(cp);
}

export interface LicenceGroup {
  key: string;
  licenceKey: string;
  items: BillingCustomerProduct[];
}

export function buildLicenceGroups(customerProducts?: BillingCustomerProduct[] | null): LicenceGroup[] {
  const map = new Map<string, LicenceGroup>();
  for (const cp of customerProducts ?? []) {
    const licenceKey = cp.licence?.licenceKey ?? '';
    const key = licenceKey || cp.id;
    if (!map.has(key)) map.set(key, { key, licenceKey, items: [] });
    map.get(key)!.items.push(cp);
  }
  return [...map.values()];
}

export function findLicenceGroup(
  groups: LicenceGroup[],
  productId?: string | null,
  sku?: string | null
): LicenceGroup | undefined {
  if (sku) {
    const byLicence = groups.find(
      (g) => g.licenceKey && g.licenceKey === sku && (!productId || g.items.some((cp) => cp.product.id === productId))
    );
    if (byLicence) return byLicence;
  }
  return productId ? groups.find((g) => g.items.some((cp) => cp.product.id === productId)) : undefined;
}

/** Full agreed net for a licence group (all its products, before pro-rata). */
export function licenceGroupNet(group: LicenceGroup): number {
  return group.items.reduce((sum, cp) => sum + productNet(cp), 0);
}

export function periodFactor(billingPeriod: string | null | undefined, proration: Proration): number {
  switch (billingPeriod) {
    case 'DAILY':
      return proration.billedDays;
    case 'WEEKLY':
      return proration.billedDays / 7;
    case 'ANNUALLY':
      return proration.billedDays / 365;
    case 'ONE_TIME':
      return 1;
    default:
      return proration.fraction;
  }
}

export function chargePeriod(cp: BillingCustomerProduct): string | null | undefined {
  return cp.priceBasis ?? cp.product?.billingPeriod;
}

export function productBilled(cp: BillingCustomerProduct, proration: Proration | null): number {
  if (!proration) return productNet(cp);
  return productNet(cp) * periodFactor(chargePeriod(cp), proration);
}

export function licenceGroupBilled(group: LicenceGroup, proration: Proration | null): number {
  return group.items.reduce((sum, cp) => sum + productBilled(cp, proration), 0);
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ─── Dates ────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 08-Sep-2026 */
export function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** A Date → "YYYY-MM-DD" from local parts. */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Today at local midnight. */
export function today(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse a "YYYY-MM-DD" value as a local date (never UTC). */
export function parseDateInput(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function computeDueDate(invoiceDate?: string, term?: string | null): Date | null {
  const start = parseDateInput(invoiceDate) ?? today();
  if (isNaN(start.getTime())) return null;
  return addDays(start, termToDays(term));
}

export function defaultNextBillingDate(invoiceDate?: string): Date | null {
  const start = parseDateInput(invoiceDate) ?? today();
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

export function computeProration(invoiceDate?: string, nextBillingDate?: string): Proration | null {
  const start = parseDateInput(invoiceDate) ?? today();
  if (isNaN(start.getTime())) return null;
  const next = parseDateInput(nextBillingDate) ?? defaultNextBillingDate(invoiceDate);
  if (!next) return null;
  const periodDays = daysInMonth(start);
  const billedDays = Math.round((next.getTime() - start.getTime()) / 86_400_000);
  if (billedDays <= 0) {
    return { start, end: start, fraction: 0, billedDays: 0, periodDays };
  }
  return { start, end: addDays(next, -1), fraction: billedDays / periodDays, billedDays, periodDays };
}

/** Days past due on an unpaid invoice (0 when settled, draft, cancelled or not yet due). */
export function daysOverdue(inv: { total: string | number; amountPaid: string | number; dueDate: string; status: string }): number {
  if (Number(inv.total) - Number(inv.amountPaid) <= 0) return 0;
  if (inv.status === 'CANCELLED' || inv.status === 'DRAFT' || inv.status === 'PAID') return 0;
  const diff = Date.now() - new Date(inv.dueDate).getTime();
  return diff > 0 ? Math.floor(diff / 86_400_000) : 0;
}
