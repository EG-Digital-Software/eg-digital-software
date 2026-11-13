import { z } from 'zod';

const progress = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'ONGOING', 'COMPLETED']);
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
  showSocialDashboard: z.boolean().optional(),
  showContentCalendar: z.boolean().optional(),
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
  showSocialDashboard: z.boolean().optional(),
  showContentCalendar: z.boolean().optional(),
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
  // Files the browser already uploaded straight to storage (approval upload URLs).
  uploads: z
    .array(
      z.object({
        url: z.string().url().max(2000),
        fileName: z.string().min(1).max(255),
        contentType: z.string().max(255).optional(),
        size: z.number().int().min(0).optional(),
      })
    )
    .max(100)
    .optional(),
});

export const approvalUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
});

/** A chat/attachment file the browser already uploaded straight to storage. */
export const taskUploadRefSchema = z.object({
  url: z.string().url().max(2000),
  fileName: z.string().min(1).max(255),
  contentType: z.string().max(255).optional(),
  size: z.number().int().min(0).optional(),
});

export const decideApprovalSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  feedback: z.string().max(5000).nullish(),
});

export const createAppointmentSchema = z.object({
  title: z.string().min(1).max(200),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  location: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
  attendees: z
    .array(z.object({ name: z.string().max(200).optional(), email: z.string().email() }))
    .min(1, 'Select at least one attendee'),
});

export const createLabelSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().min(1).max(30).optional(),
});

export const updateLabelSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().min(1).max(30).optional(),
});

/** One time-sheet entry: hours worked on a task, taken from a purchased hours product. */
export const timeEntrySchema = z.object({
  customerProductId: z.string().uuid('Pick the purchased hours to use'),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  hours: z.coerce.number().positive('Enter the hours worked').max(24, 'At most 24 hours per entry'),
  note: z.string().trim().max(1000, 'Keep the note under 1000 characters').nullable().optional(),
});

export const updateTimeEntrySchema = timeEntrySchema.partial();

// ─── Board Time Sheet ────────────────────────────────────

const isoDate = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const hours = (msg: string) => z.coerce.number({ invalid_type_error: msg }).min(0, msg).max(100000, msg);

export const TIME_PRIORITIES = ['Phase', 'P1', 'P2', 'P3', 'P4'] as const;
export const TIME_CATEGORIES = [
  'Discovery', 'Design', 'Build', 'Integration', 'Testing', 'Azure', 'Deployment',
  'Fix', 'Change', 'Content', 'Maintenance', 'Meeting', 'Training', 'Documentation',
] as const;

export const timeSheetPoolSchema = z.object({
  name: z.string().trim().min(1, 'Name the pool').max(120),
  termStart: isoDate('Pick the term start'),
  termEnd: isoDate('Pick the term end'),
  poolHours: hours('Enter the pool hours').refine((n) => n > 0, 'Enter the pool hours'),
  monthlyHours: hours('Enter the monthly hours').refine((n) => n > 0, 'Enter the monthly hours'),
  monthlyMax: hours('Enter the monthly maximum').refine((n) => n > 0, 'Enter the monthly maximum'),
  monthlyAlertAt: hours('Enter the monthly alert'),
  poolAlertAt: hours('Enter the pool alert'),
  extraRate: hours('Enter the extra-hour rate'),
  tasks: z
    .array(z.object({ taskId: z.string().uuid(), label: z.string().trim().max(60).nullable().optional() }))
    .min(1, 'Pick at least one task'),
});

/** Days from start to end, both included. */
const entryDays = (start: string, end: string) => Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1);

export const timeSheetEntrySchema = z.object({
  taskId: z.string().uuid('Pick the task'),
  date: isoDate('Pick the start date'),
  endDate: isoDate('Pick the end date'),
  requestId: z.string().trim().toUpperCase().regex(/^REQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'The request ID must look like REQ-5ABC-5DEF'),
  priority: z.enum(TIME_PRIORITIES),
  category: z.enum(TIME_CATEGORIES),
  description: z.string().trim().min(1, 'Describe the work').max(500),
  staff: z.string().trim().min(1, 'Enter who did the work').max(120),
  actualHours: z.coerce.number().min(0, 'Enter the hours worked'),
  notes: z.string().trim().max(1000).nullable().optional(),
})
  .refine((v) => v.endDate >= v.date, { message: 'The end date must not be before the start date', path: ['endDate'] })
  .refine((v) => v.actualHours <= 24 * entryDays(v.date, v.endDate), {
    message: 'At most 24 hours per day of the entry',
    path: ['actualHours'],
  });

export const timeSheetDecisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => v.decision === 'APPROVED' || !!v.reason, { message: 'Give the reason for rejecting', path: ['reason'] });

export const timeSheetApprovalSchema = z.object({
  hours: z.coerce.number().positive('Enter the hours').max(10000),
  reference: z.string().trim().max(120).nullable().optional(),
});
