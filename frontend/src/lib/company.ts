import type { Kind } from '@/lib/input';

/**
 * Company registration/tax identifiers differ by country. The Add/Edit customer
 * form asks for the registration country first, then shows that country's own
 * fields. Values are stored generically under `companyIdentifiers` keyed by
 * `key`, so adding a country is a config change — no schema change.
 *
 * Sourced from each registry's public documentation (ABR, Companies House, IRS,
 * MCA, Companies Office NZ, CRA, ACRA, Handelsregister, INSEE, FTA, CIPC, CRO).
 */
export interface CompanyField {
  key: string;
  label: string;
  hint?: string;
  /** Input guard: digits-only, alphanumeric, or free text. */
  kind: Extract<Kind, 'int' | 'alnum' | 'letters'>;
  maxLength?: number;
  required?: boolean;
  /** Australia's ABN offers a Business Register lookup. */
  lookup?: boolean;
}

const AU: CompanyField[] = [
  { key: 'abn', label: 'ABN (Australian Business Number)', hint: '11 digits', kind: 'int', maxLength: 11, required: true, lookup: true },
  { key: 'acn', label: 'ACN (Australian Company Number)', hint: '9 digits', kind: 'int', maxLength: 9 },
];

const BY_COUNTRY: Record<string, CompanyField[]> = {
  AU,
  GB: [
    { key: 'companyNumber', label: 'Company Number (CRN)', hint: '8 characters from Companies House', kind: 'alnum', maxLength: 8, required: true },
    { key: 'vat', label: 'VAT Registration Number', hint: 'GB + 9 digits', kind: 'alnum', maxLength: 14 },
  ],
  US: [
    { key: 'ein', label: 'EIN (Employer Identification Number)', hint: '9 digits', kind: 'int', maxLength: 9, required: true },
    { key: 'stateOfIncorporation', label: 'State of Incorporation', kind: 'letters', maxLength: 40 },
  ],
  IN: [
    { key: 'cin', label: 'CIN (Corporate Identification Number)', hint: '21 characters', kind: 'alnum', maxLength: 21, required: true },
    { key: 'gstin', label: 'GSTIN', hint: '15 characters', kind: 'alnum', maxLength: 15 },
    { key: 'pan', label: 'PAN', hint: '10 characters', kind: 'alnum', maxLength: 10 },
  ],
  NZ: [
    { key: 'nzbn', label: 'NZBN', hint: '13 digits', kind: 'int', maxLength: 13, required: true },
    { key: 'companyNumber', label: 'Company Number', kind: 'int', maxLength: 8 },
    { key: 'gst', label: 'GST Number', kind: 'int', maxLength: 9 },
  ],
  CA: [
    { key: 'bn', label: 'Business Number (BN)', hint: '9 digits', kind: 'int', maxLength: 9, required: true },
    { key: 'gstHst', label: 'GST/HST Number', hint: 'e.g. 123456789RT0001', kind: 'alnum', maxLength: 15 },
  ],
  SG: [
    { key: 'uen', label: 'UEN (Unique Entity Number)', hint: '9–10 characters', kind: 'alnum', maxLength: 10, required: true },
    { key: 'gst', label: 'GST Registration Number', kind: 'alnum', maxLength: 10 },
  ],
  DE: [
    { key: 'hrb', label: 'Commercial Register No. (HRB)', hint: 'e.g. HRB 12345', kind: 'alnum', maxLength: 20, required: true },
    { key: 'vat', label: 'VAT ID (USt-IdNr.)', hint: 'DE + 9 digits', kind: 'alnum', maxLength: 12 },
  ],
  FR: [
    { key: 'siren', label: 'SIREN', hint: '9 digits', kind: 'int', maxLength: 9, required: true },
    { key: 'siret', label: 'SIRET', hint: '14 digits', kind: 'int', maxLength: 14 },
    { key: 'vat', label: 'VAT (TVA)', hint: 'FR + 11 characters', kind: 'alnum', maxLength: 13 },
  ],
  AE: [
    { key: 'tradeLicense', label: 'Trade License Number', kind: 'alnum', maxLength: 20, required: true },
    { key: 'trn', label: 'TRN (Tax Registration Number)', hint: '15 digits', kind: 'int', maxLength: 15 },
  ],
  ZA: [
    { key: 'registrationNumber', label: 'Company Registration Number', hint: 'e.g. 2019/123456/07', kind: 'alnum', maxLength: 16, required: true },
    { key: 'vat', label: 'VAT Number', hint: '10 digits', kind: 'int', maxLength: 10 },
  ],
  IE: [
    { key: 'cro', label: 'CRO Number', hint: '5–6 digits', kind: 'int', maxLength: 7, required: true },
    { key: 'vat', label: 'VAT Number', kind: 'alnum', maxLength: 12 },
  ],
};

/** Fallback for any country without a dedicated config. */
export const DEFAULT_COMPANY_FIELDS: CompanyField[] = [
  { key: 'registrationNumber', label: 'Company Registration Number', kind: 'alnum', maxLength: 30, required: true },
  { key: 'taxId', label: 'Tax ID / VAT Number', kind: 'alnum', maxLength: 30 },
];

/** The identifier fields to collect for a given (ISO alpha-2) country. */
export function companyFieldsFor(country?: string | null): CompanyField[] {
  return (country && BY_COUNTRY[country.toUpperCase()]) || DEFAULT_COMPANY_FIELDS;
}
