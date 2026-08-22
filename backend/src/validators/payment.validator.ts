import { z } from 'zod';

/**
 * Manually recorded payment (Super Admin "Mark as Paid" / part payments).
 * The amount must be a positive number — a zero or negative value would reduce
 * the invoice's `amountPaid` and could flip a settled invoice back to unpaid.
 */
export const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid('A valid invoice is required'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  method: z.string().max(50).optional(),
});

export const publicPaySchema = z.object({
  method: z.string().max(50).optional(),
});

export const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED'] as const;

export const listPaymentQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
  status: z.enum(PAYMENT_STATUSES).optional().or(z.literal('')),
  method: z.string().max(50).optional(),
  provider: z.string().max(50).optional(),
  invoiceId: z.string().uuid().optional(),
});
