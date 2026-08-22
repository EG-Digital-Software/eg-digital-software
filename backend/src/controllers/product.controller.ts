import type { Request, Response } from 'express';
import { ActivityAction } from '@prisma/client';
import * as productService from '../services/product.service.js';
import { parseSpreadsheet, importProducts } from '../services/import.service.js';
import { logActivity } from '../services/activity.service.js';
import { asyncHandler, ok, parsePagination, paginated } from '../utils/http.js';
import { ApiError } from '../utils/ApiError.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePagination(req.query);
  const { items, total } = await productService.listProducts({
    ...page,
    search: req.query.search as string | undefined,
    status: (req.query.status as never) || undefined,
    stock: (req.query.stock as never) || undefined,
    category: (req.query.category as string | undefined) || undefined,
    sortBy: req.query.sortBy as string | undefined,
    sortDir: req.query.sortDir as 'asc' | 'desc' | undefined,
  });
  return paginated(res, items, total, page);
});

export const categories = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await productService.listCategories());
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getProduct(req.params.id);
  return ok(res, product);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.createProduct(req.body);
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.PRODUCT_CREATED,
    entityType: 'Product',
    entityId: product.id,
    metadata: { name: product.name, productCode: product.productCode },
  });
  return ok(res, product, 'Product created', 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.PRODUCT_UPDATED,
    entityType: 'Product',
    entityId: product.id,
  });
  return ok(res, product, 'Product updated');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await productService.deleteProduct(req.params.id);
  return ok(res, null, 'Product removed');
});

export const bulkImport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded (field name: file)');
  const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === 'true';
  const rows = parseSpreadsheet(req.file.buffer, req.file.originalname);
  const result = await importProducts(rows, dryRun);

  // A preview changes nothing, so it does not belong in the activity log.
  if (!dryRun) {
    logActivity({
      userId: req.user?.sub,
      userType: req.user?.role,
      action: ActivityAction.PRODUCT_IMPORTED,
      entityType: 'Product',
      metadata: { imported: result.imported, failed: result.failed, skipped: result.skipped },
    });
  }
  return ok(res, result, dryRun ? 'Preview complete' : 'Import complete');
});
