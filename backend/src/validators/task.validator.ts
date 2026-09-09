import { z } from 'zod';

const progress = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);
const priority = z.enum(['URGENT', 'IMPORTANT', 'MEDIUM', 'LOW']);
const userType = z.enum(['SUPER_ADMIN', 'CLIENT', 'SUPPLIER', 'EMPLOYEE']);

const assignee = z.object({
  userId: z.string().min(1),
  userType,
  name: z.string().min(1),
  email: z.string().email().nullish(),
  avatarUrl: z.string().nullish(),
});

const checklistItem = z.object({
  text: z.string().min(1).max(500),
  done: z.boolean().optional(),
});

// ISO date string or empty/null to clear the field.
const dateField = z.string().datetime().nullish().or(z.literal(''));

export const createBucketSchema = z.object({
  name: z.string().min(1).max(80),
});

export const updateBucketSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  order: z.number().int().min(0).optional(),
});

export const reorderBucketsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const createTaskSchema = z.object({
  bucketId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).nullish(),
  progress: progress.optional(),
  priority: priority.optional(),
  startDate: dateField,
  dueDate: dateField,
  assignees: z.array(assignee).optional(),
  labelIds: z.array(z.string()).optional(),
  checklist: z.array(checklistItem).optional(),
});

export const updateTaskSchema = z.object({
  bucketId: z.string().min(1).optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(10000).nullish(),
  progress: progress.optional(),
  priority: priority.optional(),
  startDate: dateField,
  dueDate: dateField,
  assignees: z.array(assignee).optional(),
  labelIds: z.array(z.string()).optional(),
  checklist: z.array(checklistItem).optional(),
});

export const moveTaskSchema = z.object({
  bucketId: z.string().min(1),
  order: z.number().int().min(0),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(5000),
});

// Progress-only update — allowed for clients too (mark complete from the grid),
// unlike the full updateTask which is admin-only.
export const taskProgressSchema = z.object({
  progress,
});

// Subject and message are both optional — a file-only request is allowed. The
// controller enforces that at least one of subject/message/file is present.
export const submitApprovalSchema = z.object({
  subject: z.string().max(200).optional(),
  message: z.string().max(5000).optional(),
});

export const decideApprovalSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  feedback: z.string().max(5000).nullish(),
});

export const createLabelSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().min(1).max(30).optional(),
});

export const updateLabelSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().min(1).max(30).optional(),
});
