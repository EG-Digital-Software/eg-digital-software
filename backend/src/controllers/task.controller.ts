import type { Request, Response } from 'express';
import type { Role } from '@prisma/client';
import * as taskService from '../services/task.service.js';
import * as clientService from '../services/client.service.js';
import * as appointmentService from '../services/appointment.service.js';
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
  const body = { ...req.body };
  // Clients may edit a task but never its schedule/priority or which column it
  // sits in — those stay locked in the portal (enforced here, not just the UI).
  if (req.user?.role === 'CLIENT') {
    delete body.startDate;
    delete body.dueDate;
    delete body.priority;
    delete body.bucketId;
    delete body.assignees;
  }
  // Stamp the notes author only when the notes actually change.
  const actorName = body.description !== undefined ? (await author(req)).name : undefined;
  return ok(res, await taskService.updateTask(await resolve(req), req.params.taskId, body, actorName));
});

export const moveTask = asyncHandler(async (req: Request, res: Response) => {
  const { bucketId, order } = req.body;
  return ok(res, await taskService.moveTask(await resolve(req), req.params.taskId, bucketId, order));
});

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await taskService.deleteTask(await resolve(req), req.params.taskId), 'Task deleted');
});

/**
 * Progress-only update. Exposed to clients too (they can tick a task complete
 * from the grid) — the full updateTask stays admin-only.
 */
export const setProgress = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await resolve(req);
  const task = await taskService.updateTask(customerId, req.params.taskId, { progress: req.body.progress });
  return ok(res, task);
});

// ─── Comments ─────────────────────────────────────────────

export const addComment = asyncHandler(async (req: Request, res: Response) => {
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body && !req.file) throw ApiError.badRequest('A message or a file is required');
  const customerId = await resolve(req);
  const comment = await taskService.addComment(
    customerId,
    req.params.taskId,
    await author(req),
    body,
    req.file
  );
  return ok(res, comment, 'Comment added', 201);
});

export const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await resolve(req);
  return ok(res, await taskService.deleteComment(customerId, req.params.taskId, req.params.commentId), 'Comment deleted');
});

// ─── Notes (chat-style thread) ────────────────────────────

/** Only these two note kinds exist; anything else falls back to a plain note. */
const noteKind = (v: unknown): string => (v === 'ACCESS_POINT' ? 'ACCESS_POINT' : 'NOTE');

/** Optional Subject, only used by Access Point entries; trimmed or null. */
const noteSubject = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

export const addNote = asyncHandler(async (req: Request, res: Response) => {
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body) throw ApiError.badRequest('A note is required');
  const customerId = await resolve(req);
  const note = await taskService.addNote(customerId, req.params.taskId, await author(req), body, noteKind(req.body.kind), noteSubject(req.body.subject));
  return ok(res, note, 'Note added', 201);
});

export const editNote = asyncHandler(async (req: Request, res: Response) => {
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body) throw ApiError.badRequest('A note is required');
  const customerId = await resolve(req);
  // Ownership (own notes only) is enforced in the service. Subject is only sent
  // for Access Point entries; leaving it undefined keeps a plain note's subject.
  const subject = req.body.subject === undefined ? undefined : noteSubject(req.body.subject);
  const note = await taskService.editNote(customerId, req.params.taskId, req.params.noteId, await author(req), body, subject);
  return ok(res, note, 'Note updated');
});

export const deleteNote = asyncHandler(async (req: Request, res: Response) => {
  const customerId = await resolve(req);
  // Owner-or-admin rule is enforced in the service.
  return ok(res, await taskService.deleteNote(customerId, req.params.taskId, req.params.noteId, await author(req)), 'Entry deleted');
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

// ─── Approvals ────────────────────────────────────────────

/** Roles allowed to approve/reject: admins and the customer. Team members view only. */
const CAN_DECIDE: Role[] = ['SUPER_ADMIN', 'CLIENT'];

export const submitApproval = asyncHandler(async (req: Request, res: Response) => {
  // Only an admin raises approval requests; the customer merely reviews them.
  if (req.user!.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only an admin can request approval');
  }
  const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : '';
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : undefined;
  // A file-only request is fine; only reject a wholly empty submission.
  if (!subject && !message && !(files && files.length)) {
    throw ApiError.badRequest('Add a subject, a message, or a file');
  }
  const customerId = await resolve(req);
  const approval = await taskService.createApproval(
    customerId,
    req.params.taskId,
    await author(req),
    { subject, message },
    files
  );
  return ok(res, approval, 'Approval requested', 201);
});

export const decideApproval = asyncHandler(async (req: Request, res: Response) => {
  if (!CAN_DECIDE.includes(req.user!.role)) {
    throw ApiError.forbidden('You are not allowed to approve or reject requests');
  }
  const status = req.body.status;
  if (status !== 'APPROVED' && status !== 'REJECTED') {
    throw ApiError.badRequest('Status must be APPROVED or REJECTED');
  }
  const feedback = typeof req.body.feedback === 'string' ? req.body.feedback.trim() || null : null;
  const customerId = await resolve(req);
  const approval = await taskService.decideApproval(
    customerId,
    req.params.taskId,
    req.params.approvalId,
    await author(req),
    { status, feedback }
  );
  return ok(res, approval, status === 'APPROVED' ? 'Approved' : 'Rejected');
});

export const reopenApproval = asyncHandler(async (req: Request, res: Response) => {
  // Only admins may re-open a decided approval (e.g. a client approved/rejected
  // by mistake) so it can be approved/rejected again. Clients/team members can't.
  if (req.user!.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only an admin can re-open an approval request');
  }
  const customerId = await resolve(req);
  return ok(
    res,
    await taskService.reopenApproval(customerId, req.params.taskId, req.params.approvalId),
    'Approval request re-opened'
  );
});

export const deleteApproval = asyncHandler(async (req: Request, res: Response) => {
  // Only admins may delete an approval request — at any status (pending,
  // approved or rejected). Clients and team members cannot.
  if (req.user!.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only an admin can delete an approval request');
  }
  const customerId = await resolve(req);
  return ok(
    res,
    await taskService.deleteApproval(customerId, req.params.taskId, req.params.approvalId),
    'Approval request removed'
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

// ─── Appointments (Schedule calendar) ─────────────────────

export const listAppointments = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await appointmentService.listForCustomer(await resolve(req)));
});

export const createAppointment = asyncHandler(async (req: Request, res: Response) => {
  const { title, startAt, endAt, location, notes, attendees } = req.body;
  const appt = await appointmentService.createAppointment({
    customerId: await resolve(req),
    creator: await author(req),
    title,
    startAt: new Date(startAt),
    endAt: new Date(endAt),
    location,
    notes,
    attendees,
  });
  return ok(res, appt, 'Appointment booked — invites sent', 201);
});

export const deleteAppointment = asyncHandler(async (req: Request, res: Response) => {
  return ok(
    res,
    await appointmentService.deleteAppointment(req.params.appointmentId, await author(req)),
    'Appointment cancelled'
  );
});
