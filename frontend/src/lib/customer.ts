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

export function businessTypeLabel(value?: BusinessType | null): string {
  return BUSINESS_TYPES.find((t) => t.value === value)?.label ?? '';
}

/**
 * Default invoice payment terms offered on the customer form. The code is
 * stored; the label is what the operator sees. Keep in step with the
 * `invoiceTerm` enum in backend/src/validators/customer.validator.ts.
 */
export const INVOICE_TERMS = [
  { value: 'DUE_ON_RECEIPT', label: 'Due on receipt' },
  { value: 'NET_7', label: 'Net 7 days' },
  { value: 'NET_14', label: 'Net 14 days' },
  { value: 'NET_30', label: 'Net 30 days' },
  { value: 'NET_45', label: 'Net 45 days' },
  { value: 'NET_60', label: 'Net 60 days' },
  { value: 'NET_90', label: 'Net 90 days' },
] as const;

export function invoiceTermLabel(value?: string | null): string {
  return INVOICE_TERMS.find((t) => t.value === value)?.label ?? value ?? '';
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
 * company → contact person → Client ID; there is always something to show.
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
