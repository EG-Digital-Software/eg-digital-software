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
