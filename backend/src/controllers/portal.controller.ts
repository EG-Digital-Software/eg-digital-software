import type { Request, Response } from 'express';
import * as supplierService from '../services/supplier.service.js';
import * as employeeService from '../services/employee.service.js';
import * as taskService from '../services/task.service.js';
import { findById } from '../services/accounts.js';
import { asyncHandler, ok, parsePagination, paginated } from '../utils/http.js';
import { ApiError } from '../utils/ApiError.js';

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

export const employeeTasks = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.getEmployeeBoard(req.user!.sub));
});

export const employeeAssignableUsers = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await taskService.listAssignableUsers());
});

/** Display name + role for the signed-in employee, for comment attribution. */
async function employeeAuthor(req: Request) {
  const { sub, role, email } = req.user!;
  const acc = await findById(role, sub);
  return { id: sub, type: role, name: acc ? `${acc.firstName} ${acc.lastName}`.trim() : email };
}

export const employeeGetTask = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await taskService.resolveEmployeeTaskCustomer(req.user!.sub, req.params.taskId);
  return ok(res, await taskService.getTask(customerId, req.params.taskId));
});

export const employeeSetProgress = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await taskService.resolveEmployeeTaskCustomer(req.user!.sub, req.params.taskId);
  return ok(res, await taskService.updateTask(customerId, req.params.taskId, { progress: req.body.progress }));
});

export const employeeUpdateTask = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await taskService.resolveEmployeeTaskCustomer(req.user!.sub, req.params.taskId);
  // Employees can update the work fields but not the schedule/priority/assignees.
  const { startDate, dueDate, priority, assignees, bucketId, labelIds, ...allowed } = req.body ?? {};
  void startDate; void dueDate; void priority; void assignees; void bucketId; void labelIds;
  return ok(res, await taskService.updateTask(customerId, req.params.taskId, allowed));
});

export const employeeAddComment = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await taskService.resolveEmployeeTaskCustomer(req.user!.sub, req.params.taskId);
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body && !req.file) throw ApiError.badRequest('A message or a file is required');
  return ok(res, await taskService.addComment(customerId, req.params.taskId, await employeeAuthor(req), body, req.file), 'Comment added', 201);
});

export const employeeDeleteComment = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await taskService.resolveEmployeeTaskCustomer(req.user!.sub, req.params.taskId);
  return ok(res, await taskService.deleteComment(customerId, req.params.taskId, req.params.commentId), 'Comment deleted');
});

export const employeeAddAttachment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded');
  const customerId = await taskService.resolveEmployeeTaskCustomer(req.user!.sub, req.params.taskId);
  return ok(res, await taskService.addAttachment(customerId, req.params.taskId, req.file, req.user?.sub), 'Attachment added', 201);
});

export const employeeDeleteAttachment = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await taskService.resolveEmployeeTaskCustomer(req.user!.sub, req.params.taskId);
  return ok(res, await taskService.deleteAttachment(customerId, req.params.taskId, req.params.attachmentId), 'Attachment deleted');
});
