import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Preview › Website showcases — a client's old website (an archived snapshot)
 * paired with the new one, for before-and-after marketing. Deleting a showcase
 * removes only the pairing; the archived files themselves are never touched.
 */

export interface ShowcaseInput {
  clientId?: string;
  title?: string;
  oldArchiveId?: string | null;
  oldSiteUrl?: string | null;
  newSiteUrl?: string | null;
  newArchiveId?: string | null;
  status?: 'DRAFT' | 'PUBLISHED';
  newLaunchedAt?: string | null;
}

const archiveSelect = {
  id: true,
  fileName: true,
  url: true,
  size: true,
  contentType: true,
  createdAt: true,
  task: { select: { taskNumber: true, title: true, customerId: true } },
} as const;

/** An Archive-tab file that belongs to this customer, or a clear error. */
async function archiveOf(customerId: string, id: string | null | undefined, label: string) {
  if (!id) return null;
  const file = await prisma.taskAttachment.findFirst({
    where: { id, kind: 'ARCHIVE', task: { customerId } },
    select: { id: true },
  });
  if (!file) throw ApiError.badRequest(`The ${label} snapshot must be a file archived on one of this customer's tasks`);
  return file.id;
}

async function customerIdOf(clientId: string) {
  const c = await prisma.customer.findUnique({ where: { clientId }, select: { id: true } });
  if (!c) throw ApiError.badRequest('Customer not found');
  return c.id;
}

export async function listShowcases() {
  const rows = await prisma.websiteShowcase.findMany({
    orderBy: [{ updatedAt: 'desc' }],
    include: {
      customer: { select: { clientId: true, companyName: true, contactPerson: true } },
      task: { select: { taskNumber: true, title: true } },
    },
  });
  const ids = [...new Set(rows.flatMap((r) => [r.oldArchiveId, r.newArchiveId]).filter((x): x is string => !!x))];
  const files = ids.length
    ? await prisma.taskAttachment.findMany({ where: { id: { in: ids }, kind: 'ARCHIVE' }, select: archiveSelect })
    : [];
  const byId = new Map(files.map(({ task, ...f }) => [f.id, { ...f, taskNumber: task.taskNumber, taskTitle: task.title }]));
  // A pair with nothing in it (both links cleared) isn't shown.
  const shown = rows.filter((r) => r.oldSiteUrl || r.newSiteUrl || r.oldArchiveId || r.newArchiveId);
  return shown.map(({ customer, task, ...r }) => ({
    ...r,
    taskNumber: task?.taskNumber ?? null,
    taskTitle: task?.title ?? null,
    clientId: customer.clientId,
    companyName: customer.companyName,
    contactPerson: customer.contactPerson,
    // Null when the archived file was deleted since — the viewer says so.
    oldArchive: r.oldArchiveId ? byId.get(r.oldArchiveId) ?? null : null,
    newArchive: r.newArchiveId ? byId.get(r.newArchiveId) ?? null : null,
  }));
}

function checkHasSides(...sides: (string | null)[]) {
  if (!sides.some(Boolean)) {
    throw ApiError.badRequest('Add the old website, the new website, or both');
  }
}

export async function createShowcase(input: ShowcaseInput, createdById?: string) {
  if (!input.clientId) throw ApiError.badRequest('Choose a customer');
  const customerId = await customerIdOf(input.clientId);
  const oldArchiveId = await archiveOf(customerId, input.oldArchiveId, 'old');
  const newArchiveId = await archiveOf(customerId, input.newArchiveId, 'new');
  const newSiteUrl = input.newSiteUrl?.trim() || null;
  const oldSiteUrl = input.oldSiteUrl?.trim() || null;
  checkHasSides(oldArchiveId, oldSiteUrl, newSiteUrl, newArchiveId);
  const row = await prisma.websiteShowcase.create({
    data: {
      customerId,
      title: input.title?.trim() || 'Website refresh',
      oldArchiveId,
      oldSiteUrl,
      newSiteUrl,
      newArchiveId,
      status: input.status ?? 'DRAFT',
      newLaunchedAt: input.newLaunchedAt ? new Date(input.newLaunchedAt) : null,
      createdById: createdById ?? null,
    },
  });
  return row;
}

export async function updateShowcase(id: string, input: ShowcaseInput) {
  const existing = await prisma.websiteShowcase.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Showcase not found');
  const customerId = input.clientId ? await customerIdOf(input.clientId) : existing.customerId;
  const oldArchiveId =
    input.oldArchiveId !== undefined ? await archiveOf(customerId, input.oldArchiveId, 'old') : existing.oldArchiveId;
  const newArchiveId =
    input.newArchiveId !== undefined ? await archiveOf(customerId, input.newArchiveId, 'new') : existing.newArchiveId;
  const newSiteUrl = input.newSiteUrl !== undefined ? input.newSiteUrl?.trim() || null : existing.newSiteUrl;
  const oldSiteUrl = input.oldSiteUrl !== undefined ? input.oldSiteUrl?.trim() || null : existing.oldSiteUrl;
  checkHasSides(oldArchiveId, oldSiteUrl, newSiteUrl, newArchiveId);
  return prisma.websiteShowcase.update({
    where: { id },
    data: {
      customerId,
      title: input.title !== undefined ? input.title.trim() || existing.title : undefined,
      oldArchiveId,
      newArchiveId,
      newSiteUrl,
      oldSiteUrl,
      status: input.status,
      newLaunchedAt:
        input.newLaunchedAt !== undefined ? (input.newLaunchedAt ? new Date(input.newLaunchedAt) : null) : undefined,
    },
  });
}

export async function deleteShowcase(id: string) {
  const existing = await prisma.websiteShowcase.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Showcase not found');
  await prisma.websiteShowcase.delete({ where: { id } });
  return { id };
}

/**
 * Set a task's old/new website links (its Archive tab). One pair per task;
 * clearing both empties the pair (it then no longer shows on Preview).
 */
export async function setTaskSiteLinks(
  customerId: string,
  taskId: string,
  input: { oldSiteUrl?: string | null; newSiteUrl?: string | null },
  userId?: string
) {
  const task = await prisma.task.findFirst({ where: { id: taskId, customerId }, select: { id: true, title: true } });
  if (!task) throw ApiError.notFound('Task not found');
  const oldSiteUrl = input.oldSiteUrl?.trim() || null;
  const newSiteUrl = input.newSiteUrl?.trim() || null;
  const existing = await prisma.websiteShowcase.findFirst({ where: { taskId }, orderBy: { createdAt: 'asc' } });
  const select = { oldSiteUrl: true, newSiteUrl: true, updatedAt: true } as const;
  if (existing) {
    return prisma.websiteShowcase.update({ where: { id: existing.id }, data: { oldSiteUrl, newSiteUrl }, select });
  }
  if (!oldSiteUrl && !newSiteUrl) return null;
  return prisma.websiteShowcase.create({
    data: { customerId, taskId, title: task.title, oldSiteUrl, newSiteUrl, status: 'PUBLISHED', createdById: userId ?? null },
    select,
  });
}
