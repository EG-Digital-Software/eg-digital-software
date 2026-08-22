import { z } from 'zod';

const lineItemSchema = z.object({
  productId: z.string().uuid().optional(),
  sku: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});

export const createInvoiceSchema = z.object({
  clientId: z.string().min(1, 'Customer is required'),
  invoiceDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  term: z.string().optional(),
  customDays: z.coerce.number().int().positive().optional(),
  reference: z.string().optional(),
  discount: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  status: z.enum(['DRAFT', 'SENT', 'PENDING']).optional(),
  items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
});

export const updateInvoiceStatusSchema = z.object({
  status: z.enum([
    'DRAFT',
    'SENT',
    'PENDING',
    'PARTIALLY_PAID',
    'PAID',
    'OVERDUE',
    'CANCELLED',
  ]),
});

export const INVOICE_STATUSES = [
  'DRAFT',
  'SENT',
  'PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
] as const;

/**
 * `filter` drives the Billing tabs. They are computed from the balance and due
 * date rather than the stored status, because nothing in the system transitions
 * an invoice to OVERDUE when its due date passes — filtering on the stored
 * status alone would leave the Overdue tab permanently empty.
 */
export const listInvoiceQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
  status: z.enum(INVOICE_STATUSES).optional().or(z.literal('')),
  filter: z.enum(['all', 'outstanding', 'paid', 'overdue', 'draft']).optional().or(z.literal('')),
  clientId: z.string().optional(),
});
