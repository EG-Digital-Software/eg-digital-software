import type { Request, Response } from 'express';
import * as supplierService from '../services/supplier.service.js';
import * as employeeService from '../services/employee.service.js';
import { asyncHandler, ok, parsePagination, paginated } from '../utils/http.js';

// ── Supplier ─────────────────────────────────────────────
export const supplierDashboard = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await supplierService.getDashboard(req.user!.sub));
});

export const supplierProducts = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePagination(req.query);
  const { items, total } = await supplierService.listProducts(req.user!.sub, page, {
    search: (req.query.search as string | undefined) || undefined,
    status: (req.query.status as never) || undefined,
    stock: (req.query.stock as never) || undefined,
  });
  return paginated(res, items, total, page);
});

// ── Employee ─────────────────────────────────────────────
export const employeeDashboard = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await employeeService.getDashboard());
});

export const employeeCustomers = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePagination(req.query);
  const { items, total } = await employeeService.listCustomers(page, {
    search: (req.query.search as string | undefined) || undefined,
    businessType: (req.query.businessType as never) || undefined,
  });
  return paginated(res, items, total, page);
});

export const employeeLicences = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await employeeService.getLicences());
});
