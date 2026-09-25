import type { BusinessType } from '@/types';

/**
 * Industry options offered on the customer form, in the order the business
 * asked for them. Values mirror the `BusinessType` enum in the Prisma schema.
 */
export const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'HOSPITALITY_AND_TOURISM', label: 'Hospitality and Tourism' },
  { value: 'FARMING_AND_AGRICULTURE', label: 'Farming and Agriculture' },
  { value: 'MINING', label: 'Mining' },
  { value: 'FISHING_AND_FORESTRY', label: 'Fishing and Forestry' },
  { value: 'MANUFACTURING', label: 'Manufacturing' },
  { value: 'CONSTRUCTION', label: 'Construction' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'RETAIL_AND_WHOLESALE', label: 'Retail and Wholesale' },
  { value: 'HEALTHCARE_AND_TRANSPORT', label: 'Healthcare and Transport' },
  { value: 'INFORMATION_TECHNOLOGY', label: 'Information Technology' },
  { value: 'EDUCATION_AND_RESEARCH', label: 'Education and Research' },
  { value: 'FINANCE_AND_MEDIA', label: 'Finance and Media' },
];

export function businessTypeLabel(value?: string | null): string {
  // Custom (non-preset) values are stored and shown as typed.
  return BUSINESS_TYPES.find((t) => t.value === value)?.label ?? value ?? '';
}

/** A customer's business types are stored comma-separated; show friendly labels. */
export function businessTypesLabel(value?: string | null): string {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((v) => businessTypeLabel(v))
    .join(', ');
}

/**
 * The payment terms offered on the customer and invoice forms. The term is the
 * payment window only — how long the client has to pay — so the list is just the
 * two windows the business grants. What gets billed, and when the next invoice is
 * raised, is the invoice's Next Billing Date instead (see lib/proration).
 *
 * The code is stored; the label is what the operator sees. Keep in step with the
 * `invoiceTerm` enum in backend/src/validators/customer.validator.ts.
 */
export const INVOICE_TERMS = [
  { value: 'DUE_ON_RECEIPT', label: 'Due on receipt' },
  { value: 'NET_7', label: 'Net 7 days' },
] as const;

/**
 * Terms that were offered before the payment window and the billing cycle were
 * split apart. Nothing writes these any more, but invoices and product
 * assignments already carry them, so they still need a label — and the forms
 * still offer the stored one so opening an old record never silently rewrites
 * its term.
 */
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
  return (
    INVOICE_TERMS.find((t) => t.value === value)?.label ?? LEGACY_TERM_LABELS[value] ?? value
  );
}

/**
 * The INVOICE_TERMS code a stored term maps onto, so a product assignment saved
 * as "Due on Receipt" or "7 Days" selects the matching option instead of showing
 * up as an extra one. Returns the term unchanged when it has no equivalent.
 */
export function normalizeInvoiceTerm(value?: string | null): string {
  if (!value) return '';
  if (INVOICE_TERMS.some((t) => t.value === value)) return value;
  if (value === 'Due on Receipt') return 'DUE_ON_RECEIPT';
  if (value === '7 Days') return 'NET_7';
  return value;
}

/**
 * Payment methods the business accepts — the stored value is the label itself,
 * so it reads the same everywhere it surfaces (payments list, invoices). Keep in
 * step with the `paymentMethod` enum in the customer validator.
 */
export const PAYMENT_METHODS = [
  'Bank Transfer (EFT)',
  'Credit/Debit Card',
  'UPI',
  'BPAY',
  'PayID',
  'Direct Debit',
  'Cheque',
  'Cash',
] as const;

/**
 * Label for a customer. The personal name fields are gone, so fall back
 * company → contact person → Customer ID; there is always something to show.
 */
export function customerName(c?: {
  companyName?: string | null;
  contactPerson?: string | null;
  clientId?: string | null;
}): string {
  return c?.companyName?.trim() || c?.contactPerson?.trim() || c?.clientId || '—';
}

/**
 * The ATO's ABN check digit algorithm — mirrors backend/src/services/abn.service.ts
 * so a typo is caught before it costs a round trip to the Business Register.
 */
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export function isValidAbn(abn?: string | null): boolean {
  const digits = (abn ?? '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  const total = digits
    .split('')
    .map(Number)
    .reduce((sum, digit, i) => sum + (i === 0 ? digit - 1 : digit) * ABN_WEIGHTS[i], 0);
  return total % 89 === 0;
}

/** ABN is stored as 11 bare digits; display it in the ATO's 2-3-3-3 grouping. */
export function formatAbn(abn?: string | null): string {
  const d = (abn ?? '').replace(/\D/g, '');
  if (d.length !== 11) return d;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}

/** ACN is stored as 9 bare digits; display it in the ASIC 3-3-3 grouping. */
export function formatAcn(acn?: string | null): string {
  const d = (acn ?? '').replace(/\D/g, '');
  if (d.length !== 9) return d;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}
