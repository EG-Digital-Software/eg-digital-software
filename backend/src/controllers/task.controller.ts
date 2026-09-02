import type { Request, Response } from 'express';
import type { Role } from '@prisma/client';
import * as taskService from '../services/task.service.js';
import * as clientService from '../services/client.service.js';
import { findById } from '../services/accounts.js';
import { asyncHandler, ok } from '../utils/http.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * One controller drives both the admin board (customer addressed by the public
 * :clientId in the path) and the client portal (customer resolved from the
 * signed-in client user). resolve() picks the right source.
 */
async function resolve(req: Request): Promise<string> {
  if (req.params.clientId) return taskService.resolveCustomerId(req.params.clientId);
  return clientService.resolveCustomerId(req.user!.sub);
}

/** Display name + role for the signed-in user, for comment attribution. */
async function author(req: Request): Promise<{ id: string; type: Role; name: string }> {
  const { sub, role, email } = req.user!;
  const acc = await findById(role, sub);
  const name = acc ? `${acc.firstName} ${acc.lastName}`.trim() : email;
  return { id: sub, type: role, name };
}

// ─── Board ────────────────────────────────────────────────

export const board = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.getBoard(await resolve(req)));
});

export const assignableUsers = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await taskService.listAssignableUsers());
});

// ─── Buckets ──────────────────────────────────────────────

export const createBucket = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.createBucket(await resolve(req), req.body.name), 'Bucket created', 201);
});

export const updateBucket = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.updateBucket(await resolve(req), req.params.bucketId, req.body));
});

export const deleteBucket = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.deleteBucket(await resolve(req), req.params.bucketId), 'Bucket deleted');
});

export const reorderBuckets = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.reorderBuckets(await resolve(req), req.body.orderedIds));
});

// ─── Tasks ────────────────────────────────────────────────

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const task = await taskService.createTask(await resolve(req), req.body, req.user?.sub);
  return ok(res, task, 'Task created', 201);
});

export const getTask = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.getTask(await resolve(req), req.params.taskId));
});

export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.updateTask(await resolve(req), req.params.taskId, req.body));
});

export const moveTask = asyncHandler(async (req: Request, res: Response) => {
  const { bucketId, order } = req.body;
  return ok(res, await taskService.moveTask(await resolve(req), req.params.taskId, bucketId, order));
});

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.deleteTask(await resolve(req), req.params.taskId), 'Task deleted');
});

// ─── Comments ─────────────────────────────────────────────

export const addComment = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await resolve(req);
  const comment = await taskService.addComment(customerId, req.params.taskId, await author(req), req.body.body);
  return ok(res, comment, 'Comment added', 201);
});

export const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await resolve(req);
  return ok(res, await taskService.deleteComment(customerId, req.params.taskId, req.params.commentId), 'Comment deleted');
});

// ─── Attachments ──────────────────────────────────────────

export const addAttachment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded');
  const customerId = await resolve(req);
  const attachment = await taskService.addAttachment(customerId, req.params.taskId, req.file, req.user?.sub);
  return ok(res, attachment, 'Attachment added', 201);
});

export const deleteAttachment = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await resolve(req);
  return ok(
    res,
    await taskService.deleteAttachment(customerId, req.params.taskId, req.params.attachmentId),
    'Attachment deleted'
  );
});

// ─── Labels ───────────────────────────────────────────────

export const listLabels = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.listLabels(await resolve(req)));
});

export const createLabel = asyncHandler(async (req: Request, res: Response) => {
  const { name, color } = req.body;
  return ok(res, await taskService.createLabel(await resolve(req), name, color ?? 'slate'), 'Label created', 201);
});

export const updateLabel = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.updateLabel(await resolve(req), req.params.labelId, req.body));
});

export const deleteLabel = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.deleteLabel(await resolve(req), req.params.labelId), 'Label deleted');
});
