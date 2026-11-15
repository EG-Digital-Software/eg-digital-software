import { api, request } from '../client';
import type { PickedFile } from '../tasks';

/**
 * API calls behind the admin Add / Edit customer form. Mirrors the web
 * `customerApi` / `abnApi` / `geoApi` wrappers (frontend/src/api/resources.ts)
 * so the payloads match what backend/src/validators/customer.validator.ts expects.
 */

// ── Shapes the form reads ─────────────────────────────────

export interface FormAddress {
  type: 'PRINCIPAL' | 'BILLING' | string;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  /** Stored as the country's display name (e.g. "Australia"). */
  country?: string | null;
}

export interface FormDirector {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
  contactNumber?: string | null;
  contactNumberCountry?: string | null;
}

export interface FormItContact {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneCountry?: string | null;
}

export interface FormDocument {
  id: string;
  fileName: string;
  size: number;
  url: string;
  contentType?: string | null;
}

/** The parts of `GET /customers/:clientId` the form prefills from. */
export interface CustomerRecord {
  id: string;
  clientId: string;
  registrationCountry?: string | null;
  companyIdentifiers?: Record<string, string> | null;
  abn?: string | null;
  acn?: string | null;
  companyName?: string | null;
  tradingAs?: string | null;
  tradingNames?: string[] | null;
  businessType?: string | null;
  addresses?: FormAddress[];
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactMobile?: string | null;
  contactMobileCountry?: string | null;
  contactPosition?: string | null;
  authorized?: boolean | null;
  authorizedPerson?: string | null;
  authorizedEmail?: string | null;
  authorizedMobile?: string | null;
  authorizedMobileCountry?: string | null;
  billingContactPerson?: string | null;
  billingContactNumber?: string | null;
  billingContactNumberCountry?: string | null;
  billingEmail?: string | null;
  creditScore?: number | null;
  accountStatus?: 'ACTIVE' | 'ACTIVE_TRIAL' | 'DORMANT' | 'SUSPENDED' | string | null;
  accountManagerId?: string | null;
  credentialEmail?: string | null;
  hasCredential?: boolean;
  directors?: FormDirector[];
  itContacts?: FormItContact[];
  documents?: FormDocument[];
}

export interface AbnLookupResult {
  abn: string;
  abnStatus: string;
  abnStatusFrom: string;
  acn: string;
  entityName: string;
  businessNames: string[];
  entityTypeCode: string;
  entityTypeName: string;
  postcode: string;
  state: string;
  gstFrom: string;
}

export interface AddressSuggestion {
  label: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  country: string;
  countryCode: string;
}

export interface ReverseGeocodeResult {
  line1: string;
  city: string;
  postcode: string;
  country: string;
  countryCode: string;
  /** 'approximate' means the match was a town or larger — no usable postcode. */
  precision: 'exact' | 'approximate';
}

export interface ProductOption {
  id: string;
  name: string;
  pricePerQty?: string | number | null;
  taxRate?: string | number | null;
  unit?: string | null;
  gstType?: 'INCLUSIVE' | 'EXCLUSIVE' | null;
}

export interface TeamMember {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  designation?: string | null;
}

export interface RevealedCredential {
  email: string;
  password: string | null;
  available: boolean;
}

// ── Calls ─────────────────────────────────────────────────

const enc = encodeURIComponent;

export const customerFormApi = {
  get: (clientId: string) => api.get<CustomerRecord>(`/customers/${enc(clientId)}`),

  /** The Customer ID the next new customer will be given (preview only). */
  nextClientId: async () => (await api.get<{ clientId: string }>('/customers/next-client-id')).clientId,

  create: (body: unknown) => api.post<CustomerRecord>('/customers', body),

  update: (clientId: string, body: unknown) =>
    request<CustomerRecord>(`/customers/${enc(clientId)}`, { method: 'PUT', body }),

  /** Australian Business Register lookup (spaces allowed; the API strips them). */
  lookupAbn: (abn: string) => api.get<AbnLookupResult>(`/abn/lookup?abn=${enc(abn)}`),

  /** Address autocomplete (free Nominatim through the API), optionally scoped to one ISO country. */
  searchAddresses: (q: string, country?: string) =>
    api.get<AddressSuggestion[]>(`/geo/search?q=${enc(q)}${country ? `&country=${enc(country)}` : ''}`),

  /** Turn device coordinates into an address the form can prefill (same endpoint as the web). */
  reverseGeocode: (lat: number, lon: number) =>
    api.get<ReverseGeocodeResult>(`/geo/reverse?lat=${enc(String(lat))}&lon=${enc(String(lon))}`),

  /** Reveal the customer's current portal password (admin only). */
  revealCredential: (clientId: string) => api.get<RevealedCredential>(`/customers/${enc(clientId)}/credential`),

  /** Active products for the "assign at creation" section. */
  activeProducts: () => api.get<ProductOption[]>('/products?pageSize=100&status=ACTIVE'),

  /** Approved team members — candidates for the account manager. */
  teamMembers: () => api.get<TeamMember[]>('/admin/registrations?role=EMPLOYEE&status=APPROVED&pageSize=100'),

  /** Agreement Document upload (multipart, any size/type). */
  uploadDocument: (clientId: string, file: PickedFile) => {
    const form = new FormData();
    // React Native's FormData streams a local file from { uri, name, type }.
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as never);
    return request<FormDocument>(`/customers/${enc(clientId)}/documents`, { method: 'POST', body: form });
  },

  deleteDocument: (clientId: string, documentId: string) =>
    api.del<{ id: string }>(`/customers/${enc(clientId)}/documents/${enc(documentId)}`),
};
