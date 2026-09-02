import { Prisma, Role, TaskPriority, TaskProgress } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { storage } from './storage/index.js';

/**
 * Microsoft Planner-style task board, scoped to one customer. Buckets are the
 * columns, tasks the cards. Assignees/comments/attachments reference staff by
 * (userId, userType) the same polymorphic way notifications do.
 */

/** Everything the board and the task detail need in one shape. */
const taskInclude = {
  assignees: true,
  labels: { include: { label: true } },
  checklist: { orderBy: { order: 'asc' } },
  comments: { orderBy: { createdAt: 'asc' } },
  attachments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TaskInclude;

/** Flatten the label join rows into plain labels for the client. */
function shapeTask<T extends { labels: { label: unknown }[] }>(task: T) {
  return { ...task, labels: task.labels.map((l) => l.label) };
}

/** Resolve the internal Customer id from the public clientId (or 404). */
export async function resolveCustomerId(clientId: string): Promise<string> {
  const customer = await prisma.customer.findUnique({
    where: { clientId },
    select: { id: true },
  });
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer.id;
}

const DEFAULT_BUCKETS = ['To do', 'In progress', 'Done'];

/**
 * The whole board: buckets (each with ordered tasks) and the customer's label
 * palette. A brand-new customer is seeded with the default Planner columns so
 * the board is never empty on first open.
 */
export async function getBoard(customerId: string) {
  let buckets = await prisma.taskBucket.findMany({
    where: { customerId },
    orderBy: { order: 'asc' },
    include: { tasks: { orderBy: { order: 'asc' }, include: taskInclude } },
  });

  if (buckets.length === 0) {
    await prisma.$transaction(
      DEFAULT_BUCKETS.map((name, order) =>
        prisma.taskBucket.create({ data: { customerId, name, order } })
      )
    );
    buckets = await prisma.taskBucket.findMany({
      where: { customerId },
      orderBy: { order: 'asc' },
      include: { tasks: { orderBy: { order: 'asc' }, include: taskInclude } },
    });
  }

  const labels = await prisma.taskLabel.findMany({
    where: { customerId },
    orderBy: { createdAt: 'asc' },
  });

  return {
    buckets: buckets.map((b) => ({ ...b, tasks: b.tasks.map(shapeTask) })),
    labels,
  };
}

// ─── Buckets ──────────────────────────────────────────────

export async function createBucket(customerId: string, name: string) {
  const count = await prisma.taskBucket.count({ where: { customerId } });
  return prisma.taskBucket.create({ data: { customerId, name, order: count } });
}

async function ensureBucket(customerId: string, bucketId: string) {
  const bucket = await prisma.taskBucket.findFirst({ where: { id: bucketId, customerId } });
  if (!bucket) throw ApiError.notFound('Bucket not found');
  return bucket;
}

/**
 * The customer's "Done" column, matched by name (case-insensitive). Completing
 * a task auto-files it here — but only if such a bucket exists, so customers
 * who rename or drop it are never surprised by tasks jumping around.
 */
function findDoneBucket(customerId: string) {
  return prisma.taskBucket.findFirst({
    where: { customerId, name: { equals: 'Done', mode: 'insensitive' } },
    orderBy: { order: 'asc' },
  });
}

export async function updateBucket(
  customerId: string,
  bucketId: string,
  input: { name?: string; order?: number }
) {
  await ensureBucket(customerId, bucketId);
  return prisma.taskBucket.update({ where: { id: bucketId }, data: input });
}

export async function deleteBucket(customerId: string, bucketId: string) {
  await ensureBucket(customerId, bucketId);
  await prisma.taskBucket.delete({ where: { id: bucketId } });
  return { id: bucketId };
}

/** Persist a new left-to-right column order. */
export async function reorderBuckets(customerId: string, orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, order) =>
      prisma.taskBucket.updateMany({ where: { id, customerId }, data: { order } })
    )
  );
  return { ok: true };
}

// ─── Tasks ────────────────────────────────────────────────

export interface AssigneeInput {
  userId: string;
  userType: Role;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
}

export interface ChecklistInput {
  text: string;
  done?: boolean;
}

export interface TaskInput {
  bucketId: string;
  title: string;
  description?: string | null;
  progress?: TaskProgress;
  priority?: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  assignees?: AssigneeInput[];
  labelIds?: string[];
  checklist?: ChecklistInput[];
}

async function ensureTask(customerId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, customerId } });
  if (!task) throw ApiError.notFound('Task not found');
  return task;
}

/** Validate label ids belong to this customer, returning the safe subset. */
async function validLabelIds(customerId: string, labelIds: string[]): Promise<string[]> {
  if (labelIds.length === 0) return [];
  const rows = await prisma.taskLabel.findMany({
    where: { customerId, id: { in: labelIds } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function createTask(customerId: string, input: TaskInput, createdById?: string) {
  await ensureBucket(customerId, input.bucketId);
  const count = await prisma.task.count({ where: { bucketId: input.bucketId } });
  const labelIds = await validLabelIds(customerId, input.labelIds ?? []);
  const completed = input.progress === TaskProgress.COMPLETED;

  const task = await prisma.task.create({
    data: {
      customerId,
      bucketId: input.bucketId,
      title: input.title,
      description: input.description ?? null,
      progress: input.progress ?? TaskProgress.NOT_STARTED,
      priority: input.priority ?? TaskPriority.MEDIUM,
      startDate: input.startDate ? new Date(input.startDate) : null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      order: count,
      completedAt: completed ? new Date() : null,
      createdById,
      assignees: input.assignees?.length
        ? {
            create: input.assignees.map((a) => ({
              userId: a.userId,
              userType: a.userType,
              name: a.name,
              email: a.email ?? null,
              avatarUrl: a.avatarUrl ?? null,
            })),
          }
        : undefined,
      labels: labelIds.length ? { create: labelIds.map((labelId) => ({ labelId })) } : undefined,
      checklist: input.checklist?.length
        ? {
            create: input.checklist.map((c, order) => ({
              text: c.text,
              done: c.done ?? false,
              order,
            })),
          }
        : undefined,
    },
    include: taskInclude,
  });
  return shapeTask(task);
}

export async function getTask(customerId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, customerId },
    include: taskInclude,
  });
  if (!task) throw ApiError.notFound('Task not found');
  return shapeTask(task);
}

export async function updateTask(
  customerId: string,
  taskId: string,
  input: Partial<TaskInput> & { bucketId?: string }
) {
  const existing = await ensureTask(customerId, taskId);
  if (input.bucketId) await ensureBucket(customerId, input.bucketId);

  const data: Prisma.TaskUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.bucketId !== undefined) data.bucket = { connect: { id: input.bucketId } };
  if (input.progress !== undefined) {
    data.progress = input.progress;
    // Keep completedAt honest so the charts/grid can trust it.
    if (input.progress === TaskProgress.COMPLETED && existing.progress !== TaskProgress.COMPLETED) {
      data.completedAt = new Date();
    } else if (input.progress !== TaskProgress.COMPLETED) {
      data.completedAt = null;
    }
  }

  await prisma.task.update({ where: { id: taskId }, data });

  // Collections are replaced wholesale — simpler than diffing and the payloads
  // are tiny (a task has a handful of assignees / labels / checklist items).
  if (input.assignees !== undefined) {
    await prisma.taskAssignee.deleteMany({ where: { taskId } });
    if (input.assignees.length) {
      await prisma.taskAssignee.createMany({
        data: input.assignees.map((a) => ({
          taskId,
          userId: a.userId,
          userType: a.userType,
          name: a.name,
          email: a.email ?? null,
          avatarUrl: a.avatarUrl ?? null,
        })),
      });
    }
  }
  if (input.labelIds !== undefined) {
    const labelIds = await validLabelIds(customerId, input.labelIds);
    await prisma.taskLabelLink.deleteMany({ where: { taskId } });
    if (labelIds.length) {
      await prisma.taskLabelLink.createMany({ data: labelIds.map((labelId) => ({ taskId, labelId })) });
    }
  }
  if (input.checklist !== undefined) {
    await prisma.checklistItem.deleteMany({ where: { taskId } });
    if (input.checklist.length) {
      await prisma.checklistItem.createMany({
        data: input.checklist.map((c, order) => ({ taskId, text: c.text, done: c.done ?? false, order })),
      });
    }
  }

  // Auto-file a freshly-completed task into the Done bucket — unless this same
  // request already set an explicit bucket (respect what the user chose).
  const justCompleted =
    input.progress === TaskProgress.COMPLETED && existing.progress !== TaskProgress.COMPLETED;
  if (justCompleted && input.bucketId === undefined) {
    const done = await findDoneBucket(customerId);
    if (done && done.id !== existing.bucketId) {
      const end = await prisma.task.count({ where: { bucketId: done.id } });
      return moveTask(customerId, taskId, done.id, end);
    }
  }

  return getTask(customerId, taskId);
}

/**
 * Move a card to a target bucket and position, then compact the order of every
 * card in the affected bucket(s) so positions stay 0..n-1 with no gaps.
 */
export async function moveTask(
  customerId: string,
  taskId: string,
  targetBucketId: string,
  targetIndex: number
) {
  const task = await ensureTask(customerId, taskId);
  await ensureBucket(customerId, targetBucketId);
  const sourceBucketId = task.bucketId;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { bucketId: targetBucketId } });

    const reindex = async (bucketId: string, insertId?: string, insertAt?: number) => {
      const ids = (
        await tx.task.findMany({
          where: { bucketId, id: { not: insertId } },
          orderBy: { order: 'asc' },
          select: { id: true },
        })
      ).map((t) => t.id);
      if (insertId !== undefined && insertAt !== undefined) {
        ids.splice(Math.max(0, Math.min(insertAt, ids.length)), 0, insertId);
      }
      await Promise.all(
        ids.map((id, order) => tx.task.update({ where: { id }, data: { order } }))
      );
    };

    await reindex(targetBucketId, taskId, targetIndex);
    if (sourceBucketId !== targetBucketId) await reindex(sourceBucketId);
  });

  return getTask(customerId, taskId);
}

export async function deleteTask(customerId: string, taskId: string) {
  await ensureTask(customerId, taskId);
  await prisma.task.delete({ where: { id: taskId } });
  return { id: taskId };
}

// ─── Comments ─────────────────────────────────────────────

export async function addComment(
  customerId: string,
  taskId: string,
  author: { id: string; type: Role; name: string },
  body: string
) {
  await ensureTask(customerId, taskId);
  return prisma.taskComment.create({
    data: { taskId, authorId: author.id, authorType: author.type, authorName: author.name, body },
  });
}

export async function deleteComment(customerId: string, taskId: string, commentId: string) {
  await ensureTask(customerId, taskId);
  const comment = await prisma.taskComment.findFirst({ where: { id: commentId, taskId } });
  if (!comment) throw ApiError.notFound('Comment not found');
  await prisma.taskComment.delete({ where: { id: commentId } });
  return { id: commentId };
}

// ─── Attachments ──────────────────────────────────────────

export async function addAttachment(
  customerId: string,
  taskId: string,
  file: { originalname: string; buffer: Buffer; mimetype: string; size: number },
  uploadedById?: string
) {
  await ensureTask(customerId, taskId);
  const safeName = file.originalname.replace(/[^\w.\-]+/g, '_');
  const key = `tasks/${taskId}/${Date.now()}-${safeName}`;
  const url = await storage.save(key, file.buffer, file.mimetype);
  return prisma.taskAttachment.create({
    data: {
      taskId,
      fileName: file.originalname,
      url,
      size: file.size,
      contentType: file.mimetype,
      uploadedById,
    },
  });
}

export async function deleteAttachment(customerId: string, taskId: string, attachmentId: string) {
  await ensureTask(customerId, taskId);
  const attachment = await prisma.taskAttachment.findFirst({ where: { id: attachmentId, taskId } });
  if (!attachment) throw ApiError.notFound('Attachment not found');
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
  return { id: attachmentId };
}

// ─── Labels ───────────────────────────────────────────────

export async function listLabels(customerId: string) {
  return prisma.taskLabel.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' } });
}

export async function createLabel(customerId: string, name: string, color: string) {
  return prisma.taskLabel.create({ data: { customerId, name, color } });
}

export async function updateLabel(
  customerId: string,
  labelId: string,
  input: { name?: string; color?: string }
) {
  const label = await prisma.taskLabel.findFirst({ where: { id: labelId, customerId } });
  if (!label) throw ApiError.notFound('Label not found');
  return prisma.taskLabel.update({ where: { id: labelId }, data: input });
}

export async function deleteLabel(customerId: string, labelId: string) {
  const label = await prisma.taskLabel.findFirst({ where: { id: labelId, customerId } });
  if (!label) throw ApiError.notFound('Label not found');
  await prisma.taskLabel.delete({ where: { id: labelId } });
  return { id: labelId };
}

// ─── Assignable staff ─────────────────────────────────────

/** Active, approved admins and employees — the people a task can be given to. */
export async function listAssignableUsers() {
  const [admins, employees] = await Promise.all([
    prisma.adminUser.findMany({
      where: { isActive: true, approvalStatus: 'APPROVED' },
      select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
      orderBy: { firstName: 'asc' },
    }),
    prisma.employeeUser.findMany({
      where: { isActive: true, approvalStatus: 'APPROVED' },
      select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
      orderBy: { firstName: 'asc' },
    }),
  ]);
  const shape = (u: { id: string; firstName: string; lastName: string; email: string; avatarUrl: string | null }, userType: Role) => ({
    userId: u.id,
    userType,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email,
    avatarUrl: u.avatarUrl,
  });
  return [
    ...admins.map((u) => shape(u, Role.SUPER_ADMIN)),
    ...employees.map((u) => shape(u, Role.EMPLOYEE)),
  ];
}
