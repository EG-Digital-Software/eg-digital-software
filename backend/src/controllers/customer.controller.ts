import type { Request, Response } from 'express';
import { ActivityAction } from '@prisma/client';
import * as customerService from '../services/customer.service.js';
import { getCustomerHistory } from '../services/customerHistory.service.js';
import { logActivity } from '../services/activity.service.js';
import { asyncHandler, ok, parsePagination, paginated } from '../utils/http.js';
import { ApiError } from '../utils/ApiError.js';
import { requestIp } from '../utils/requestIp.js';
import { prisma } from '../config/prisma.js';

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

/** Issue an impersonation session for this client's portal — read-only unless `mode: 'edit'`. */
export const impersonate = asyncHandler(async (req: Request, res: Response) => {
  const edit = req.body?.mode === 'edit';
  const session = await customerService.impersonateCustomer(req.params.clientId, edit);
  return ok(res, { ...session, mode: edit ? 'edit' : 'view' }, edit ? 'Editing client portal' : 'Viewing client portal');
});

// ─── Agreement Documents ──────────────────────────────────

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded');
  const doc = await customerService.addDocument(req.params.clientId, req.file, req.user?.sub);
  return ok(res, doc, 'Document uploaded', 201);
});

export const updateDocument = asyncHandler(async (req: Request, res: Response) => {
  const doc = await customerService.updateDocument(
    req.params.clientId,
    req.params.documentId,
    {
      fileName: typeof req.body.fileName === 'string' ? req.body.fileName : undefined,
      status: typeof req.body.status === 'string' ? req.body.status : undefined,
      fields: req.body.fields,
    },
    req.user?.sub
  );
  return ok(res, doc, 'Document updated');
});

/** The signed-in admin's (or permitted team member's) name and IP, for the "Signed By" footer. */
async function adminSigner(req: Request) {
  const select = { firstName: true, lastName: true };
  const admin =
    req.user!.role === 'EMPLOYEE'
      ? await prisma.employeeUser.findUnique({ where: { id: req.user!.sub }, select })
      : await prisma.adminUser.findUnique({ where: { id: req.user!.sub }, select });
  const name = admin ? `${admin.firstName} ${admin.lastName}`.trim() : 'Admin';
  return { name, ip: await requestIp(req) };
}

export const signer = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await adminSigner(req));
});

export const fillDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No filled document was uploaded');
  const doc = await customerService.adminFillDocument(
    req.params.clientId,
    req.params.documentId,
    req.file,
    customerService.parseFieldIds(req.body.filledFieldIds),
    await adminSigner(req)
  );
  return ok(res, doc, 'Remaining fields saved');
});

export const documentFile = asyncHandler(async (req: Request, res: Response) => {
  const { data, contentType } = await customerService.readDocumentFileForClientId(
    req.params.clientId,
    req.params.documentId,
    req.query.signed === '1'
  );
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(data);
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await customerService.deleteDocument(req.params.clientId, req.params.documentId);
  return ok(res, deleted, 'Document deleted');
});

export const assignProduct = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.assignProductToCustomer(req.params.clientId, req.body);
  return ok(res, customer, 'Product assigned', 201);
});

export const assignProducts = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.assignProductsToCustomer(
    req.params.clientId,
    req.body.products
  );
  const count = req.body.products?.length ?? 0;
  return ok(res, customer, `${count} product${count === 1 ? '' : 's'} assigned`, 201);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.updateCustomerProduct(
    req.params.clientId,
    req.params.customerProductId,
    req.body
  );
  return ok(res, customer, 'Assigned product updated');
});

export const updateProductGroup = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.updateProductGroup(
    req.params.clientId,
    decodeURIComponent(req.params.licenceKey),
    req.body
  );
  return ok(res, customer, 'Products updated');
});

export const removeProductGroup = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.removeProductGroup(
    req.params.clientId,
    decodeURIComponent(req.params.licenceKey)
  );
  return ok(res, customer, 'Products removed');
});

export const removeProduct = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.removeCustomerProduct(
    req.params.clientId,
    req.params.customerProductId
  );
  return ok(res, customer, 'Product removed');
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
    // The starting standing, so Account History knows when a trial began.
    metadata: { clientId: customer.clientId, company: customer.companyName, accountStatus: customer.accountStatus },
  });
  return ok(res, customer, 'Customer created', 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const before = await prisma.customer.findUnique({
    where: { clientId: req.params.clientId },
    select: { accountStatus: true },
  });
  // A team member may edit the details; the portal login stays with the admin.
  const body = req.user?.role === 'SUPER_ADMIN' ? req.body : { ...req.body, credential: undefined };
  const customer = await customerService.updateCustomer(req.params.clientId, body);
  // A changed standing (e.g. Active Trial → Active) is recorded from → to, so
  // Account History can show when a trial started and ended.
  const statusChanged = before && before.accountStatus !== customer.accountStatus;
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.CUSTOMER_UPDATED,
    entityType: 'Customer',
    entityId: customer.id,
    ...(statusChanged ? { metadata: { statusFrom: before.accountStatus, statusTo: customer.accountStatus } } : {}),
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

/** The customer's Account History timeline, newest first. */
export const history = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await getCustomerHistory(req.params.clientId));
});

/** Admin "Renew account": make the account ACTIVE for the chosen number of months. */
export const renewAccount = asyncHandler(async (req: Request, res: Response) => {
  const before = await prisma.customer.findUnique({
    where: { clientId: req.params.clientId },
    select: { accountStatus: true, accountRenewedUntil: true },
  });
  const customer = await customerService.renewAccount(req.params.clientId, Number(req.body?.months));
  // The renewal runs on from a still-running one, otherwise from now.
  const now = new Date();
  const prevUntil = before?.accountRenewedUntil;
  const renewedFrom = prevUntil && prevUntil > now ? prevUntil : now;
  logActivity({
    userId: req.user?.sub,
    userType: req.user?.role,
    action: ActivityAction.CUSTOMER_UPDATED,
    entityType: 'Customer',
    entityId: customer.id,
    metadata: {
      renewedMonths: Number(req.body?.months),
      renewedFrom: renewedFrom.toISOString(),
      renewedUntil: customer.accountRenewedUntil?.toISOString() ?? null,
      // What the account was before — a renewal out of a trial ends that trial.
      previousStatus: before?.accountStatus ?? null,
    },
  });
  return ok(res, customer, 'Account renewed');
});
