import { z } from 'zod';

/** ABN is 11 digits; blank is allowed while an operator is still filling it in. */
const abnField = z
  .string()
  .max(20)
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 0 || v.length === 11, 'ABN must be 11 digits')
  .optional();

export const organisationSettingsSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(120).optional(),
  legalName: z.string().max(160).optional(),
  abn: abnField,
  addressLine1: z.string().max(160).optional(),
  addressLine2: z.string().max(160).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(40).optional(),
  postcode: z.string().max(20).optional(),
  country: z.string().max(80).optional(),
  billingEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  supportEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  phoneCountry: z.string().regex(/^[A-Z]{2}$/, 'Invalid country').optional(),
  website: z.string().max(200).optional(),
  disputeWindowDays: z.coerce.number().int().min(0).max(365).optional(),
  locale: z.string().max(20).optional(),
  currency: z.string().max(10).optional(),
});

export const paymentSettingsSchema = z.object({
  provider: z.enum(['mock', 'stripe', 'razorpay']).optional(),
  publishableKey: z.string().max(255).optional(),
  // Only sent when the admin wants to change it; blank keeps the stored value.
  secretKey: z.string().max(255).optional(),
  cardPaymentsEnabled: z.boolean().optional(),
  cardSurchargePct: z.number().min(0).max(100).optional(),
  upiEnabled: z.boolean().optional(),
  upiId: z.string().max(120).optional(),
  bankTransferEnabled: z.boolean().optional(),
  bankName: z.string().max(120).optional(),
  accountName: z.string().max(120).optional(),
  bsb: z.string().max(20).optional(),
  accountNumber: z.string().max(40).optional(),
  payInstructions: z.string().max(2000).optional(),
});

export const listRegistrationQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional().or(z.literal('')),
  role: z.enum(['CLIENT', 'SUPPLIER', 'EMPLOYEE']).optional().or(z.literal('')),
});
