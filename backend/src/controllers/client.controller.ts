import type { Request, Response } from 'express';
import * as clientService from '../services/client.service.js';
import { asyncHandler, ok, parsePagination, paginated } from '../utils/http.js';

async function cid(req: Request) {
  return clientService.resolveCustomerId(req.user!.sub);
}

export const profile = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await clientService.getProfile(await cid(req)));
});

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await clientService.getDashboard(await cid(req)));
});

export const invoices = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePagination(req.query);
  const { items, total, balance } = await clientService.listInvoices(await cid(req), page, {
    status: (req.query.status as string | undefined) || undefined,
    filter: (req.query.filter as never) || undefined,
    search: (req.query.search as string | undefined) || undefined,
  });
  return paginated(res, items, total, page, { balance });
});

export const invoice = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await clientService.getInvoice(await cid(req), req.params.id));
});

export const products = asyncHandler(async (req: Request, res: Response) => {
  return ok(
    res,
    await clientService.listProducts(await cid(req), {
      status: (req.query.status as string | undefined) || undefined,
      search: (req.query.search as string | undefined) || undefined,
    })
  );
});
