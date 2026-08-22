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

/**
 * Australian Business Number — exactly 11 digits. Accepts the spaced form
 * ("51 824 753 556"); the service strips separators before persisting.
 */
const abnSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 0 || v.length === 11, 'ABN must be 11 digits')
  .optional();

/** Australian Company Number — exactly 9 digits. */
const acnSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 0 || v.length === 9, 'ACN must be 9 digits')
  .optional();

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
    // ── Basic Information ──
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email(),
    phoneNumber: z.string().optional(),
    phoneNumberCountry: countryCode,

    // ── Company Information ──
    abn: abnSchema,
    acn: acnSchema,
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

    reference: z
      .string()
      .regex(/^[a-zA-Z0-9]*$/, 'Reference must be alphanumeric')
      .optional(),

    assignedProducts: z.array(assignedProductSchema).optional(),
  })
  // An authorised representative is only meaningful with a name attached.
  .refine((v) => !v.authorized || !!v.authorizedPerson?.trim(), {
    message: 'Authorised person is required when Authorised is set to Yes',
    path: ['authorizedPerson'],
  });

export const updateCustomerSchema = createCustomerSchema
  .innerType()
  .partial()
  .omit({ assignedProducts: true })
  .refine((v) => !v.authorized || !!v.authorizedPerson?.trim(), {
    message: 'Authorised person is required when Authorised is set to Yes',
    path: ['authorizedPerson'],
  });

export const listCustomerQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  sortBy: z
    .enum(['createdAt', 'companyName', 'firstName', 'clientId', 'creditScore'])
    .optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
