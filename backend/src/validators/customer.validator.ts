import { z } from 'zod';

const addressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
});

/** ISO-3166 alpha-2 country code for a phone number's dial code. */
const countryCode = z
  .string()
  .regex(/^[A-Z]{2}$/, 'Invalid country')
  .optional();

const optionalEmail = z.string().email().optional().or(z.literal(''));

export const BUSINESS_TYPES = [
  'HOSPITALITY_AND_TOURISM',
  'FARMING_AND_AGRICULTURE',
  'MINING',
  'FISHING_AND_FORESTRY',
  'MANUFACTURING',
  'CONSTRUCTION',
  'PROCESSING',
  'RETAIL_AND_WHOLESALE',
  'HEALTHCARE_AND_TRANSPORT',
  'INFORMATION_TECHNOLOGY',
  'EDUCATION_AND_RESEARCH',
  'FINANCE_AND_MEDIA',
] as const;

// Names carry letters, spaces, hyphens and apostrophes only — never digits.
const nameField = z
  .string()
  .trim()
  .regex(/^[\p{L}][\p{L} '-]*$/u, 'Use letters only')
  .optional()
  .or(z.literal(''));

const directorSchema = z.object({
  firstName: nameField,
  middleName: nameField,
  lastName: nameField,
  email: optionalEmail,
  contactNumber: z.string().optional(),
  contactNumberCountry: countryCode,
});

const itContactSchema = z.object({
  name: z.string().optional(),
  email: optionalEmail,
  phone: z.string().optional(),
  phoneCountry: countryCode,
});

const assignedProductSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  price: z.coerce.number().min(0).optional(),
  licence: z.string().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  issueDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export const createCustomerSchema = z
  .object({
    // ── Company Information ──
    /// ISO-3166 alpha-2 registration country; drives which identifiers apply.
    registrationCountry: z.string().length(2).optional(),
    /// Country-specific identifiers keyed by field. Kept permissive — the exact
    /// field set is validated on the client from the per-country config.
    companyIdentifiers: z.record(z.string()).optional(),
    companyName: z.string().optional(),
    tradingAs: z.string().optional(),
    /// Every trading name; the first is mirrored into tradingAs.
    tradingNames: z.array(z.string()).optional(),
    businessType: z.enum(BUSINESS_TYPES).optional().or(z.literal('')),
    principalAddress: addressSchema.optional(),
    billingAddress: addressSchema.optional(),
    sameAsPrincipal: z.boolean().optional(),

    // ── Contact Information ──
    contactPerson: z.string().optional(),
    contactEmail: optionalEmail,
    contactMobile: z.string().optional(),
    contactMobileCountry: countryCode,
    contactPosition: z.string().optional(),
    authorized: z.boolean().optional(),
    authorizedPerson: z.string().optional(),
    authorizedEmail: optionalEmail,
    authorizedMobile: z.string().optional(),
    authorizedMobileCountry: countryCode,

    // ── Invoicing Details ──
    billingContactPerson: z.string().optional(),
    billingContactNumber: z.string().optional(),
    billingContactNumberCountry: countryCode,
    billingEmail: optionalEmail,
    creditScore: z.coerce.number().int().min(0).max(1200).optional().or(z.literal('')),
    // Default payment terms and preferred method. Payment method is kept in step
    // with the PAYMENT_METHODS list; invoice term is either one of the preset
    // codes (INVOICE_TERMS) or free text the operator entered manually, so it is
    // accepted as a bounded string rather than a fixed enum.
    invoiceTerm: z.string().trim().max(60).optional(),
    paymentMethod: z
      .enum([
        'Bank Transfer (EFT)',
        'Credit/Debit Card',
        'UPI',
        'BPAY',
        'PayID',
        'Direct Debit',
        'Cheque',
        'Cash',
      ])
      .optional()
      .or(z.literal('')),

    reference: z
      .string()
      .regex(/^[a-zA-Z0-9]*$/, 'Reference must be alphanumeric')
      .optional(),

    accountStatus: z.enum(['ACTIVE', 'DORMANT', 'SUSPENDED']).optional(),

    // ── Customer Credential (admin-provisioned portal login) ──
    // Present only when the admin sets or changes the login. Empty strings are
    // allowed so the form can submit the section untouched.
    credential: z
      .object({
        email: optionalEmail,
        password: z.string().min(8, 'At least 8 characters').optional().or(z.literal('')),
      })
      .optional(),

    directors: z.array(directorSchema).optional(),

    itContacts: z.array(itContactSchema).optional(),

    assignedProducts: z.array(assignedProductSchema).optional(),
  })
  // An authorised representative is only meaningful with a name attached.
  .refine((v) => v.authorized || !!v.authorizedPerson?.trim(), {
    message: 'Authorised person is required when Authorised is set to No',
    path: ['authorizedPerson'],
  });

export const updateCustomerSchema = createCustomerSchema
  .innerType()
  .partial()
  .omit({ assignedProducts: true })
  .refine((v) => v.authorized || !!v.authorizedPerson?.trim(), {
    message: 'Authorised person is required when Authorised is set to No',
    path: ['authorizedPerson'],
  });

export const addCredentialSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});

export const changePasswordSchema = z.object({
  password: z.string().min(8, 'At least 8 characters'),
});

export const listCustomerQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'DORMANT', 'SUSPENDED']).optional(),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  sortBy: z
    .enum(['createdAt', 'companyName', 'firstName', 'clientId', 'creditScore'])
    .optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
