import type { CustomerRecord, FormAddress } from '../../../api/admin/customerForm';
import { DEFAULT_COUNTRY, DEFAULT_COUNTRY_NAME, countryCodeByName, countryName } from './countries';

/**
 * Form model for the admin Add / Edit customer screen — a port of the web
 * CustomerFormPage (frontend/src/pages/customers/CustomerFormPage.tsx). The
 * validation mirrors that page's zod schema, which in turn mirrors
 * backend/src/validators/customer.validator.ts.
 */

// ── Company identifiers per registration country (frontend/src/lib/company.ts) ──

export type GuardKind = 'int' | 'decimal' | 'abn' | 'letters' | 'email' | 'alnum';

export interface CompanyField {
  key: string;
  label: string;
  hint?: string;
  kind: 'int' | 'alnum' | 'letters';
  maxLength?: number;
  lookup?: boolean;
}

const BY_COUNTRY: Record<string, CompanyField[]> = {
  AU: [
    { key: 'abn', label: 'ABN (Australian Business Number)', hint: '11 digits', kind: 'int', maxLength: 11, lookup: true },
    { key: 'acn', label: 'ACN (Australian Company Number)', hint: '9 digits', kind: 'int', maxLength: 9 },
  ],
  GB: [
    { key: 'companyNumber', label: 'Company Number (CRN)', hint: '8 characters from Companies House', kind: 'alnum', maxLength: 8 },
    { key: 'vat', label: 'VAT Registration Number', hint: 'GB + 9 digits', kind: 'alnum', maxLength: 14 },
  ],
  US: [
    { key: 'ein', label: 'EIN (Employer Identification Number)', hint: '9 digits', kind: 'int', maxLength: 9 },
    { key: 'stateOfIncorporation', label: 'State of Incorporation', kind: 'letters', maxLength: 40 },
  ],
  IN: [
    { key: 'cin', label: 'CIN (Corporate Identification Number)', hint: '21 characters', kind: 'alnum', maxLength: 21 },
    { key: 'gstin', label: 'GSTIN', hint: '15 characters', kind: 'alnum', maxLength: 15 },
    { key: 'pan', label: 'PAN', hint: '10 characters', kind: 'alnum', maxLength: 10 },
  ],
  NZ: [
    { key: 'nzbn', label: 'NZBN', hint: '13 digits', kind: 'int', maxLength: 13 },
    { key: 'companyNumber', label: 'Company Number', kind: 'int', maxLength: 8 },
    { key: 'gst', label: 'GST Number', kind: 'int', maxLength: 9 },
  ],
  CA: [
    { key: 'bn', label: 'Business Number (BN)', hint: '9 digits', kind: 'int', maxLength: 9 },
    { key: 'gstHst', label: 'GST/HST Number', hint: 'e.g. 123456789RT0001', kind: 'alnum', maxLength: 15 },
  ],
  SG: [
    { key: 'uen', label: 'UEN (Unique Entity Number)', hint: '9–10 characters', kind: 'alnum', maxLength: 10 },
    { key: 'gst', label: 'GST Registration Number', kind: 'alnum', maxLength: 10 },
  ],
  DE: [
    { key: 'hrb', label: 'Commercial Register No. (HRB)', hint: 'e.g. HRB 12345', kind: 'alnum', maxLength: 20 },
    { key: 'vat', label: 'VAT ID (USt-IdNr.)', hint: 'DE + 9 digits', kind: 'alnum', maxLength: 12 },
  ],
  FR: [
    { key: 'siren', label: 'SIREN', hint: '9 digits', kind: 'int', maxLength: 9 },
    { key: 'siret', label: 'SIRET', hint: '14 digits', kind: 'int', maxLength: 14 },
    { key: 'vat', label: 'VAT (TVA)', hint: 'FR + 11 characters', kind: 'alnum', maxLength: 13 },
  ],
  AE: [
    { key: 'tradeLicense', label: 'Trade License Number', kind: 'alnum', maxLength: 20 },
    { key: 'trn', label: 'TRN (Tax Registration Number)', hint: '15 digits', kind: 'int', maxLength: 15 },
  ],
  ZA: [
    { key: 'registrationNumber', label: 'Company Registration Number', hint: 'e.g. 2019/123456/07', kind: 'alnum', maxLength: 16 },
    { key: 'vat', label: 'VAT Number', hint: '10 digits', kind: 'int', maxLength: 10 },
  ],
  IE: [
    { key: 'cro', label: 'CRO Number', hint: '5–6 digits', kind: 'int', maxLength: 7 },
    { key: 'vat', label: 'VAT Number', kind: 'alnum', maxLength: 12 },
  ],
};

const DEFAULT_COMPANY_FIELDS: CompanyField[] = [
  { key: 'registrationNumber', label: 'Company Registration Number', kind: 'alnum', maxLength: 30 },
  { key: 'taxId', label: 'Tax ID / VAT Number', kind: 'alnum', maxLength: 30 },
];

export function companyFieldsFor(country?: string | null): CompanyField[] {
  return (country && BY_COUNTRY[country.toUpperCase()]) || DEFAULT_COMPANY_FIELDS;
}

// ── Business types (frontend/src/lib/customer.ts) ──

export const BUSINESS_TYPES: { value: string; label: string }[] = [
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

export const businessTypeLabel = (v: string) => BUSINESS_TYPES.find((t) => t.value === v)?.label ?? v;

export const ACCOUNT_STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ACTIVE_TRIAL', label: 'Active-Trial' },
  { value: 'DORMANT', label: 'Dormant' },
  { value: 'SUSPENDED', label: 'Suspended' },
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]['value'];

// ── Input helpers (frontend/src/lib/input.ts) ──

const CLEAN: Record<GuardKind, (v: string) => string> = {
  int: (v) => v.replace(/\D/g, ''),
  decimal: (v) => {
    let s = v.replace(/[^\d.]/g, '');
    const dot = s.indexOf('.');
    if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
    return s;
  },
  abn: (v) => v.replace(/[^\d ]/g, ''),
  letters: (v) => v.replace(/[^\p{L}\s'.-]/gu, ''),
  email: (v) => v.replace(/[^a-zA-Z0-9@._%+-]/g, ''),
  alnum: (v) => v.replace(/[^A-Za-z0-9\s/-]/g, ''),
};

export const clean = (kind: GuardKind, v: string) => CLEAN[kind](v);

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Title Case as the web form does ("o'brien" -> "O'Brien", "ruby's" -> "Ruby's"). */
export function toTitleCase(v: string): string {
  return v.toLowerCase().replace(/\p{L}+(?:'\p{L}+)?/gu, (word) => {
    const apos = word.indexOf("'");
    if (apos === -1) return cap(word);
    const before = word.slice(0, apos);
    const after = word.slice(apos + 1);
    return before.length === 1 ? `${cap(before)}'${cap(after)}` : `${cap(before)}'${after}`;
  });
}

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** The ATO's ABN check-digit algorithm. */
export function isValidAbn(abn?: string | null): boolean {
  const digits = (abn ?? '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  const total = digits
    .split('')
    .map(Number)
    .reduce((sum, d, i) => sum + (i === 0 ? d - 1 : d) * ABN_WEIGHTS[i]!, 0);
  return total % 89 === 0;
}

export const PHONE_DIGITS = 10;
/** Empty, or a full 10-digit number. */
export const phoneComplete = (n?: string | null) => {
  const d = (n ?? '').replace(/\D/g, '');
  return d.length === 0 || d.length === PHONE_DIGITS;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (v: string) => EMAIL_RE.test(v.trim());
const isName = (v?: string) => /^[\p{L}][\p{L} '-]*$/u.test((v ?? '').trim());
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: string) => DATE_RE.test(v) && !Number.isNaN(new Date(v).getTime());

// ── Values ────────────────────────────────────────────────

export interface AddressValues {
  line1: string;
  line2: string;
  city: string;
  suburb: string;
  state: string;
  postcode: string;
  /** ISO alpha-2 in the form; sent as the country name. */
  country: string;
}

export interface DirectorValues {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  contactNumberCountry: string;
}

export interface ItContactValues {
  name: string;
  email: string;
  phone: string;
  phoneCountry: string;
}

export interface ProductRowValues {
  productId: string;
  price: string;
  discountPercent: string;
  unit: string;
  taxRate: string;
  licence: string;
  issueDate: string;
  expiryDate: string;
}

export interface FormValues {
  registrationCountry: string;
  companyIdentifiers: Record<string, string>;
  companyName: string;
  tradingNames: string[];
  businessType: string;
  principalAddress: AddressValues;
  billingAddress: AddressValues;
  sameAsPrincipal: boolean;

  contactPerson: string;
  contactEmail: string;
  contactMobile: string;
  contactMobileCountry: string;
  contactPosition: string;
  authorized: 'yes' | 'no';
  authorizedPerson: string;
  authorizedEmail: string;
  authorizedMobile: string;
  authorizedMobileCountry: string;

  billingContactPerson: string;
  billingContactNumber: string;
  billingContactNumberCountry: string;
  billingEmail: string;
  creditScore: string;
  accountStatus: AccountStatus;
  accountManagerId: string;

  credential: { email: string; password: string };

  sameAsContactInfo: boolean;
  directors: DirectorValues[];
  itContacts: ItContactValues[];
  assignedProducts: ProductRowValues[];
}

export const EMPTY_ADDRESS: AddressValues = { line1: '', line2: '', city: '', suburb: '', state: '', postcode: '', country: DEFAULT_COUNTRY };
export const EMPTY_DIRECTOR: DirectorValues = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  contactNumber: '',
  contactNumberCountry: DEFAULT_COUNTRY,
};
export const EMPTY_IT_CONTACT: ItContactValues = { name: '', email: '', phone: '', phoneCountry: DEFAULT_COUNTRY };
export const EMPTY_PRODUCT: ProductRowValues = {
  productId: '',
  price: '0',
  discountPercent: '0',
  unit: '',
  taxRate: '10',
  licence: '',
  issueDate: '',
  expiryDate: '',
};

export const DEFAULTS: FormValues = {
  registrationCountry: DEFAULT_COUNTRY,
  companyIdentifiers: {},
  companyName: '',
  tradingNames: [''],
  businessType: '',
  principalAddress: { ...EMPTY_ADDRESS },
  billingAddress: { ...EMPTY_ADDRESS },
  sameAsPrincipal: true,
  contactPerson: '',
  contactEmail: '',
  contactMobile: '',
  contactMobileCountry: DEFAULT_COUNTRY,
  contactPosition: '',
  authorized: 'no',
  authorizedPerson: '',
  authorizedEmail: '',
  authorizedMobile: '',
  authorizedMobileCountry: DEFAULT_COUNTRY,
  billingContactPerson: '',
  billingContactNumber: '',
  billingContactNumberCountry: DEFAULT_COUNTRY,
  billingEmail: '',
  creditScore: '',
  accountStatus: 'ACTIVE',
  accountManagerId: '',
  credential: { email: '', password: '' },
  sameAsContactInfo: false,
  directors: [{ ...EMPTY_DIRECTOR }],
  itContacts: [{ ...EMPTY_IT_CONTACT }],
  assignedProducts: [],
};

/** Prefill from an existing customer (edit). */
export function fromCustomer(c: CustomerRecord): FormValues {
  const principal = c.addresses?.find((a) => a.type === 'PRINCIPAL');
  const billing = c.addresses?.find((a) => a.type === 'BILLING');
  const addr = (a?: FormAddress): AddressValues => ({
    line1: a?.line1 ?? '',
    line2: a?.line2 ?? '',
    city: a?.city ?? '',
    suburb: a?.suburb ?? '',
    state: a?.state ?? '',
    postcode: a?.postcode ?? '',
    country: countryCodeByName(a?.country),
  });
  const status = ACCOUNT_STATUSES.some((s) => s.value === c.accountStatus) ? (c.accountStatus as AccountStatus) : 'ACTIVE';
  return {
    ...DEFAULTS,
    registrationCountry: c.registrationCountry ?? DEFAULT_COUNTRY,
    // Prefer the stored identifier map; fall back to the legacy ABN/ACN columns.
    companyIdentifiers: c.companyIdentifiers ?? (c.abn || c.acn ? { abn: c.abn ?? '', acn: c.acn ?? '' } : {}),
    companyName: c.companyName ?? '',
    tradingNames: c.tradingNames?.length ? [...c.tradingNames] : [c.tradingAs ?? ''],
    businessType: c.businessType ?? '',
    principalAddress: addr(principal),
    billingAddress: addr(billing),
    // Never re-tick "same as principal" on load — it would overwrite a billing
    // address the operator deliberately made different.
    sameAsPrincipal: false,
    contactPerson: c.contactPerson ?? '',
    contactEmail: c.contactEmail ?? '',
    contactMobile: c.contactMobile ?? '',
    contactMobileCountry: c.contactMobileCountry ?? DEFAULT_COUNTRY,
    contactPosition: c.contactPosition ?? '',
    authorized: c.authorized ? 'yes' : 'no',
    authorizedPerson: c.authorizedPerson ?? '',
    authorizedEmail: c.authorizedEmail ?? '',
    authorizedMobile: c.authorizedMobile ?? '',
    authorizedMobileCountry: c.authorizedMobileCountry ?? DEFAULT_COUNTRY,
    billingContactPerson: c.billingContactPerson ?? '',
    billingContactNumber: c.billingContactNumber ?? '',
    billingContactNumberCountry: c.billingContactNumberCountry ?? DEFAULT_COUNTRY,
    billingEmail: c.billingEmail ?? '',
    creditScore: c.creditScore != null ? String(c.creditScore) : '',
    accountStatus: status,
    accountManagerId: c.accountManagerId ?? '',
    // The password is never loaded — the admin reveals it on demand.
    credential: { email: c.credentialEmail ?? '', password: '' },
    directors: c.directors?.length
      ? c.directors.map((d) => ({
          firstName: d.firstName ?? '',
          middleName: d.middleName ?? '',
          lastName: d.lastName ?? '',
          email: d.email ?? '',
          contactNumber: d.contactNumber ?? '',
          contactNumberCountry: d.contactNumberCountry ?? DEFAULT_COUNTRY,
        }))
      : [{ ...EMPTY_DIRECTOR }],
    itContacts: c.itContacts?.length
      ? c.itContacts.map((x) => ({
          name: x.name ?? '',
          email: x.email ?? '',
          phone: x.phone ?? '',
          phoneCountry: x.phoneCountry ?? DEFAULT_COUNTRY,
        }))
      : [{ ...EMPTY_IT_CONTACT }],
    assignedProducts: [],
  };
}

// ── Validation ────────────────────────────────────────────

/** Errors keyed by field path, e.g. "directors.0.email". */
export type Errors = Record<string, string>;

export function validate(v: FormValues, isEdit: boolean): Errors {
  const e: Errors = {};
  const email = (path: string, value: string) => {
    if (value.trim() && !isEmail(value)) e[path] = 'Enter a valid email';
  };
  const phone = (path: string, value: string) => {
    if (!phoneComplete(value)) e[path] = 'Phone number must be 10 digits';
  };

  email('contactEmail', v.contactEmail);
  email('authorizedEmail', v.authorizedEmail);
  email('billingEmail', v.billingEmail);
  email('credential.email', v.credential.email);
  phone('contactMobile', v.contactMobile);
  phone('authorizedMobile', v.authorizedMobile);
  phone('billingContactNumber', v.billingContactNumber);

  if (v.creditScore.trim()) {
    const n = Number(v.creditScore);
    if (!Number.isInteger(n) || n < 0 || n > 1200) e.creditScore = 'Credit score must be a whole number between 0 and 1200';
  }

  if (v.credential.password && v.credential.password.length < 8) e['credential.password'] = 'Password must be at least 8 characters';
  // On create the portal login is mandatory.
  if (!isEdit) {
    if (!v.credential.email.trim()) e['credential.email'] = 'Customer email is required';
    if (!v.credential.password.trim()) e['credential.password'] = 'Password is required';
  }

  v.directors.forEach((d, i) => {
    for (const k of ['firstName', 'middleName', 'lastName'] as const) {
      if (d[k].trim() && !isName(d[k])) e[`directors.${i}.${k}`] = 'Use letters only';
    }
    email(`directors.${i}.email`, d.email);
    if (d.contactNumber.trim()) phone(`directors.${i}.contactNumber`, d.contactNumber);
  });

  v.itContacts.forEach((c, i) => {
    if (!(c.name.trim() || c.email.trim() || c.phone.trim())) return;
    email(`itContacts.${i}.email`, c.email);
    if (c.phone.trim()) phone(`itContacts.${i}.phone`, c.phone);
  });

  for (const f of companyFieldsFor(v.registrationCountry)) {
    const value = v.companyIdentifiers[f.key]?.trim() ?? '';
    if (f.key === 'abn' && value && !isValidAbn(value)) e[`companyIdentifiers.${f.key}`] = 'That ABN fails its check digits';
  }

  v.assignedProducts.forEach((p, i) => {
    if (!p.productId) e[`assignedProducts.${i}.productId`] = 'Select a product';
    const disc = Number(p.discountPercent || 0);
    if (disc < 0 || disc > 100) e[`assignedProducts.${i}.discountPercent`] = 'Between 0 and 100';
    const tax = Number(p.taxRate || 0);
    if (tax < 0 || tax > 100) e[`assignedProducts.${i}.taxRate`] = 'Between 0 and 100';
    if (p.issueDate && !isDate(p.issueDate)) e[`assignedProducts.${i}.issueDate`] = 'Use YYYY-MM-DD';
    if (p.expiryDate && !isDate(p.expiryDate)) e[`assignedProducts.${i}.expiryDate`] = 'Use YYYY-MM-DD';
  });

  return e;
}

// ── Payload ───────────────────────────────────────────────

const withCountryName = (a: AddressValues) => ({ ...a, country: countryName(a.country) || DEFAULT_COUNTRY_NAME });
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

/** Build the POST /customers or PUT /customers/:clientId body, exactly as the web form does. */
export function toPayload(v: FormValues, opts: { isEdit: boolean; initialManagerId: string }) {
  const principal = withCountryName(v.principalAddress);
  const billing = v.sameAsPrincipal ? { ...principal } : withCountryName(v.billingAddress);
  const credentialSet = v.credential.email.trim() || v.credential.password.trim();
  // Only send the account manager when it was set (create) or changed (edit),
  // so an untouched form never reassigns or clears it.
  const managerChanged = opts.isEdit ? v.accountManagerId !== opts.initialManagerId : !!v.accountManagerId;

  return {
    registrationCountry: v.registrationCountry,
    // Only the selected country's identifiers, blanks dropped.
    companyIdentifiers: Object.fromEntries(
      companyFieldsFor(v.registrationCountry)
        .map((f) => [f.key, v.companyIdentifiers[f.key]?.trim() ?? ''] as const)
        .filter(([, val]) => val)
    ),
    companyName: v.companyName,
    tradingNames: v.tradingNames.map((n) => n.trim()).filter(Boolean),
    businessType: v.businessType,
    principalAddress: principal,
    billingAddress: billing,
    sameAsPrincipal: v.sameAsPrincipal,

    contactPerson: v.contactPerson,
    contactEmail: v.contactEmail,
    contactMobile: v.contactMobile,
    contactMobileCountry: v.contactMobileCountry,
    contactPosition: v.contactPosition,
    authorized: v.authorized === 'yes',
    authorizedPerson: v.authorizedPerson,
    authorizedEmail: v.authorizedEmail,
    authorizedMobile: v.authorizedMobile,
    authorizedMobileCountry: v.authorizedMobileCountry,

    billingContactPerson: v.billingContactPerson,
    billingContactNumber: v.billingContactNumber,
    billingContactNumberCountry: v.billingContactNumberCountry,
    billingEmail: v.billingEmail,
    creditScore: v.creditScore.trim() ? Number(v.creditScore) : undefined,
    accountStatus: v.accountStatus,
    ...(managerChanged ? { accountManagerId: v.accountManagerId } : {}),

    // A director row counts once it has an email.
    directors: v.directors
      .filter((d) => d.email.trim())
      .map((d) => ({
        firstName: d.firstName.trim() || undefined,
        middleName: d.middleName.trim() || undefined,
        lastName: d.lastName.trim() || undefined,
        email: d.email.trim(),
        contactNumber: d.contactNumber.trim() || undefined,
        contactNumberCountry: d.contactNumberCountry,
      })),
    // An IT-contact row counts once any field is filled.
    itContacts: v.itContacts
      .filter((c) => c.name.trim() || c.email.trim() || c.phone.trim())
      .map((c) => ({
        name: c.name.trim() || undefined,
        email: c.email.trim() || undefined,
        phone: c.phone.trim() || undefined,
        phoneCountry: c.phoneCountry,
      })),
    assignedProducts: v.assignedProducts.map((p) => ({
      productId: p.productId,
      price: num(p.price),
      discountPercent: num(p.discountPercent),
      unit: p.unit.trim() || undefined,
      taxRate: num(p.taxRate),
      licence: p.licence.trim() || undefined,
      // Blank dates are left out — the API would reject an empty date string.
      issueDate: p.issueDate || undefined,
      expiryDate: p.expiryDate || undefined,
    })),
    // Send the login only when the admin actually set/changed something.
    credential: credentialSet
      ? { email: v.credential.email.trim() || undefined, password: v.credential.password.trim() || undefined }
      : undefined,
  };
}

/** Rough "how full is this record" gauge — a nudge, never a gate. */
export function progressOf(v: FormValues): number {
  const checks = [
    !!v.companyName.trim(),
    Object.values(v.companyIdentifiers).some((x) => !!x?.trim()),
    !!v.businessType.trim(),
    !!v.principalAddress.line1.trim(),
    !!v.principalAddress.city.trim(),
    !!v.principalAddress.postcode.trim(),
    !!v.contactPerson.trim(),
    !!v.contactEmail.trim(),
    !!v.contactMobile.trim(),
    v.directors.some((d) => d.email.trim()),
    !!v.billingContactPerson.trim() || !!v.billingEmail.trim(),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/** Row total for an assigned product (GST-inclusive products add nothing on top). */
export function productRowTotal(p: ProductRowValues, inclusive: boolean): number {
  const net = (Number(p.price) || 0) * (1 - (Number(p.discountPercent) || 0) / 100);
  return inclusive ? net : net + net * ((Number(p.taxRate) || 0) / 100);
}
