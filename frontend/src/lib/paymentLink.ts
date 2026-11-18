import { z } from 'zod';

/**
 * The invoice's own payment link set by the admin (e.g. a Stripe / PayPal / bank
 * pay page), or null when it uses the built-in pay page (`…/pay/<invoice id>`).
 * The API keeps it in `paymentUrl`, and the QR code is generated from it.
 */
export function customPaymentLink(invoice: { id: string; paymentUrl?: string | null }): string | null {
  const url = invoice.paymentUrl?.trim();
  if (!url) return null;
  return url.replace(/\/+$/, '').endsWith(`/pay/${invoice.id}`) ? null : url;
}

/** Optional payment link field: empty, or a full http(s) link. */
export const paymentLinkField = z
  .string()
  .trim()
  .max(2000, 'Payment link is too long')
  .refine((v) => v === '' || /^https?:\/\/[^\s]+\.[^\s]+/i.test(v), 'Enter a full link starting with https://')
  .optional();
