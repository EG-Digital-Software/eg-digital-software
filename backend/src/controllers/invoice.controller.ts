import type { Request, Response } from 'express';
import { ActivityAction } from '@prisma/client';
import * as invoiceService from '../services/invoice.service.js';
import { logActivity } from '../services/activity.service.js';
import { asyncHandler, ok, parsePagination, paginated } from '../utils/http.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePagination(req.query);
  const { items, total } = await invoiceService.listInvoices({
    ...page,
    search: req.query.search as string | undefined,
    status: (req.query.status as string | undefined) || undefined,
    filter: (req.query.filter as never) || undefined,
    clientId: req.query.clientId as string | undefined,
  });
  return paginated(res, items, total, page);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoiceService.getInvoice(req.params.id);
  return ok(res, invoice);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoiceService.createInvoice(req.body);
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.INVOICE_CREATED,
    entityType: 'Invoice',
    entityId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber, total: invoice.total.toString() },
  });
  return ok(res, invoice, 'Invoice created', 201);
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoiceService.updateStatus(req.params.id, req.body.status);
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.INVOICE_UPDATED,
    entityType: 'Invoice',
    entityId: invoice.id,
    metadata: { status: invoice.status },
  });
  return ok(res, invoice, 'Invoice updated');
});

export const send = asyncHandler(async (req: Request, res: Response) => {
  const { recipients } = await invoiceService.sendInvoiceEmail(req.params.id);
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.INVOICE_UPDATED,
    entityType: 'Invoice',
    entityId: req.params.id,
    metadata: { sentTo: recipients.join(', ') },
  });
  return ok(res, { recipients }, `Invoice sent to ${recipients.join(', ')}`);
});

export const getPublic = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoiceService.getPublicInvoice(req.params.id);
  return ok(res, invoice);
});
