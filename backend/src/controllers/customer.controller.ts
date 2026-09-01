import type { Request, Response } from 'express';
import { ActivityAction } from '@prisma/client';
import * as customerService from '../services/customer.service.js';
import { logActivity } from '../services/activity.service.js';
import { asyncHandler, ok, parsePagination, paginated } from '../utils/http.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = parsePagination(req.query);
  const { items, total } = await customerService.listCustomers({
    ...page,
    search: req.query.search as string | undefined,
    status: req.query.status as never,
    businessType: req.query.businessType as never,
    sortBy: req.query.sortBy as string | undefined,
    sortDir: req.query.sortDir as 'asc' | 'desc' | undefined,
  });
  return paginated(res, items, total, page);
});

export const nextClientId = asyncHandler(async (_req: Request, res: Response) => {
  const clientId = await customerService.previewNextClientId();
  return ok(res, { clientId });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.getCustomerByClientId(req.params.clientId);
  return ok(res, customer);
});

export const revealCredential = asyncHandler(async (req: Request, res: Response) => {
  const credential = await customerService.revealCredential(req.params.clientId);
  return ok(res, credential);
});

export const listCredentials = asyncHandler(async (req: Request, res: Response) => {
  const credentials = await customerService.listCredentials(req.params.clientId);
  return ok(res, credentials);
});

export const addCredential = asyncHandler(async (req: Request, res: Response) => {
  const credential = await customerService.addCredential(req.params.clientId, req.body);
  return ok(res, credential, 'Credential added', 201);
});

export const revealCredentialById = asyncHandler(async (req: Request, res: Response) => {
  const credential = await customerService.revealCredentialById(
    req.params.clientId,
    req.params.userId
  );
  return ok(res, credential);
});

export const changeCredentialPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await customerService.changeCredentialPassword(
    req.params.clientId,
    req.params.userId,
    req.body.password
  );
  return ok(res, result, 'Password changed');
});

export const removeCredential = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await customerService.removeCredential(req.params.clientId, req.params.userId);
  return ok(res, deleted, 'Credential removed');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.createCustomer(req.body);
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.CUSTOMER_CREATED,
    entityType: 'Customer',
    entityId: customer.id,
    metadata: { clientId: customer.clientId, company: customer.companyName },
  });
  return ok(res, customer, 'Customer created', 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.updateCustomer(req.params.clientId, req.body);
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.CUSTOMER_UPDATED,
    entityType: 'Customer',
    entityId: customer.id,
  });
  return ok(res, customer, 'Customer updated');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.archiveCustomer(req.params.clientId);
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.CUSTOMER_ARCHIVED,
    entityType: 'Customer',
    entityId: customer.id,
  });
  return ok(res, customer, 'Customer archived');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await customerService.deleteCustomer(req.params.clientId);
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.CUSTOMER_DELETED,
    entityType: 'Customer',
    entityId: deleted.id,
  });
  return ok(res, deleted, 'Customer permanently deleted');
});
