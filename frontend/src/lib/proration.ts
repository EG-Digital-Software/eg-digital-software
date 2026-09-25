import type { CustomerProduct } from '@/types';

/**
 * Shared billing-period + pro-ration helpers for the invoice create and edit
 * forms, so both compute an invoice's billing period and line amounts exactly
 * the same way. Mirrors the backend's resolveDueDate term handling.
 */

/** Per-product Unit/Hours multiplier (1 when the product isn't unit-priced). */
export function productUnits(cp: CustomerProduct): number {
  return cp.unitHoursEnabled ? Number(cp.unitHours) || 0 : 1;
}

/** Net line value for a product = agreed price × units. */
export function productNet(cp: CustomerProduct): number {
  return (Number(cp.price) || 0) * productUnits(cp);
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 08-Sep-2026 */
export function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** Days a term adds to the invoice date (mirrors backend resolveDueDate). */
export function termToDays(term?: string, termManual?: string): number {
  const parse = (s?: string) => {
    const m = /(\d+)/.exec(s ?? '');
    return m ? parseInt(m[1], 10) : 30;
  };
  switch (term) {
    case 'DUE_ON_RECEIPT':
    case 'Due on Receipt':
      return 0;
    case 'NET_7':
    case '7 Days':
      return 7;
    case 'NET_14':
      return 14;
    case '15 Days':
      return 15;
    case 'NET_30':
    case '30 Days':
      return 30;
    case 'NET_45':
      return 45;
    case 'NET_60':
      return 60;
    case 'NET_90':
      return 90;
    case 'MANUAL':
      return parse(termManual);
    default:
      return parse(term);
  }
}

export interface Proration {
  start: Date;
  end: Date;
  fraction: number;
  billedDays: number;
  periodDays: number;
}

/**
 * Billing period + pro-ration for the invoice's issue date and term.
 *
 * Monthly (30-day) terms bill on the calendar month: the period runs from the
 * invoice date to that month's last day, and the amount is pro-rated by the days
 * that remain (e.g. issued on the 6th of a 30-day month → 25/30). Other terms
 * run a full period of their own length from the invoice date (fraction 1).
 */
export function computeProration(
  invoiceDate?: string,
  term?: string,
  termManual?: string
): Proration | null {
  const start = invoiceDate ? new Date(invoiceDate) : new Date();
  if (isNaN(start.getTime())) return null;
  const days = termToDays(term, termManual);
  if (days === 30) {
    const dim = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const billed = dim - start.getDate() + 1; // inclusive of the issue day
    return { start, end, fraction: billed / dim, billedDays: billed, periodDays: dim };
  }
  const end = new Date(start.getTime() + Math.max(days, 0) * 86_400_000);
  return { start, end, fraction: 1, billedDays: days, periodDays: days };
}
