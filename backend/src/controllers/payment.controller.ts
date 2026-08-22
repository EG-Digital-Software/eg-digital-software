import type { Request, Response } from 'express';
import { ActivityAction } from '@prisma/client';
import * as paymentService from '../services/payment.service.js';
import { logActivity } from '../services/activity.service.js';
import { asyncHandler, ok, parsePagination, paginated } from '../utils/http.js';

export const createIntent = asyncHandler(async (req: Request, res: Response) => {
  const intent = await paymentService.createPaymentIntent(req.body.invoiceId);
  return ok(res, intent, 'Payment intent created');
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePagination(req.query);
  const { items, total, collected } = await paymentService.listPayments({
    ...page,
    search: req.query.search as string | undefined,
    status: (req.query.status as never) || undefined,
    method: (req.query.method as string | undefined) || undefined,
    provider: (req.query.provider as string | undefined) || undefined,
    invoiceId: (req.query.invoiceId as string | undefined) || undefined,
  });
  return paginated(res, items, total, page, { collected });
});

export const methods = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await paymentService.listPaymentMethods());
});

export const record = asyncHandler(async (req: Request, res: Response) => {
  const result = await paymentService.recordPayment({
    invoiceId: req.body.invoiceId,
    amount: Number(req.body.amount),
    method: req.body.method,
  });
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.PAYMENT_RECEIVED,
    entityType: 'Invoice',
    entityId: req.body.invoiceId,
    metadata: { amount: req.body.amount },
  });
  return ok(res, result, 'Payment recorded', 201);
});

// What the pay page will actually be charged, surcharge included.
export const publicQuote = asyncHandler(async (req: Request, res: Response) => {
  const method = (req.query.method as string) || 'card';
  return ok(res, await paymentService.quotePublicPayment(req.params.id, method));
});

// Public webhook endpoint (no auth) — verify signature in production.
export const webhook = asyncHandler(async (req: Request, res: Response) => {
  const result = await paymentService.handleWebhook(req.body);
  return ok(res, result, 'Webhook processed');
});

// Public pay endpoint used by the invoice QR / pay page (mock provider only).
export const publicPay = asyncHandler(async (req: Request, res: Response) => {
  const result = await paymentService.payInvoicePublic(req.params.id, req.body?.method);
  return ok(res, result, result.alreadyPaid ? 'Invoice already paid' : 'Payment successful');
});
