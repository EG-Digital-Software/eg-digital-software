import { z } from 'zod';

/**
 * Client portal query schemas. These routes had no validation at all, so an
 * unrecognised status went straight to Prisma and surfaced as a 500.
 */
export const listClientInvoiceQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
  status: z
    .enum(['DRAFT', 'SENT', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'])
    .optional()
    .or(z.literal('')),
  filter: z.enum(['all', 'outstanding', 'paid', 'overdue']).optional().or(z.literal('')),
});

export const listClientProductQuerySchema = z.object({
  search: z.string().optional(),
  status: z
    .enum(['ACTIVE', 'EXPIRING_SOON', 'CRITICAL', 'EXPIRED', 'SUSPENDED'])
    .optional()
    .or(z.literal('')),
});

export const listSupplierProductQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().or(z.literal('')),
  stock: z.enum(['low', 'out']).optional().or(z.literal('')),
});

export const listEmployeeCustomerQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
  businessType: z
    .enum([
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
    ])
    .optional()
    .or(z.literal('')),
});
