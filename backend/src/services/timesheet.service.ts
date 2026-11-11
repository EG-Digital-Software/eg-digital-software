import { Prisma, type Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { notify, notifySuperAdmins } from './notification.service.js';
import { round2, summarisePool, type PoolRules } from '../utils/timesheet.js';

/**
 * Board Time Sheet. A customer's purchased hours live in pools; each pool is
 * shared by one or more of its tasks and carries the rules (term, monthly
 * maximum, alerts, billing blocks, extra-hour rate). Admins set pools up, the
 * admin and team log time against them, and the client approves extra hours
 * once a pool runs out.
 */

export type TimeActor = { id: string; type: Role; name: string };

export interface PoolInput {
  name: string;
  termStart: string;
  termEnd: string;
  poolHours: number;
  monthlyHours: number;
  monthlyMax: number;
  monthlyAlertAt: number;
  poolAlertAt: number;
  extraRate: number;
  tasks: { taskId: string; label?: string | null }[];
}

export interface PoolEntryInput {
  taskId: string;
  /** First day of the work; the hours count toward this day's month. */
  date: string;
  endDate: string;
  requestId: string;
  priority: string;
  category: string;
  description: string;
  staff: string;
  actualHours: number;
  notes?: string | null;
}

export interface EntryDecisionInput {
  decision: 'APPROVED' | 'REJECTED';
  reason?: string | null;
}

export interface ExtraApprovalInput {
  hours: number;
  reference?: string | null;
}

const poolInclude = {
  tasks: { include: { task: { select: { id: true, taskNumber: true, title: true } } } },
  approvals: { orderBy: { approvedOn: 'asc' } },
  entries: { orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }] },
} satisfies Prisma.TimeSheetPoolInclude;

type PoolRow = Prisma.TimeSheetPoolGetPayload<{ include: typeof poolInclude }>;

/** A @db.Date value as YYYY-MM-DD. */
const day = (d: Date) => d.toISOString().slice(0, 10);
/** Today as YYYY-MM-DD in Australian (Perth) time — the business's calendar. */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());

function rulesOf(p: PoolRow): PoolRules {
  return {
    taskIds: p.tasks.map((t) => t.taskId),
    termStart: day(p.termStart),
    termEnd: day(p.termEnd),
    poolHours: Number(p.poolHours),
    monthlyHours: Number(p.monthlyAllocation ?? p.monthlyMax),
    monthlyMax: Number(p.monthlyMax),
    monthlyAlertAt: Number(p.monthlyAlertAt),
    poolAlertAt: Number(p.poolAlertAt),
    extraRate: Number(p.extraRate),
  };
}

function shapePool(p: PoolRow) {
  return {
    id: p.id,
    name: p.name,
    ...rulesOf(p),
    tasks: p.tasks.map((t) => ({ taskId: t.taskId, taskNumber: t.task.taskNumber, title: t.task.title, label: t.label })),
    approvals: p.approvals.map((a) => ({
      id: a.id,
      date: day(a.approvedOn),
      hours: Number(a.hours),
      reference: a.reference,
      approvedBy: a.approvedByName,
    })),
    entries: p.entries
      .filter((e) => e.taskId)
      .map((e) => ({
        id: e.id,
        taskId: e.taskId!,
        date: day(e.workDate),
        endDate: day(e.workEndDate ?? e.workDate),
        requestId: e.requestId ?? '',
        priority: e.priority ?? 'Phase',
        category: e.category ?? '',
        description: e.description ?? e.note ?? '',
        staff: e.staff ?? e.authorName,
        actualHours: Number(e.hours),
        notes: e.description ? e.note : null,
        authorName: e.authorName,
        status: e.approvalStatus,
        rejectReason: e.rejectReason,
        decidedBy: e.decidedByName,
        decidedAt: e.decidedAt?.toISOString() ?? null,
      })),
  };
}

/** Every pool of one customer — the admin and client board. */
export async function listPools(customerId: string) {
  const pools = await prisma.timeSheetPool.findMany({ where: { customerId }, include: poolInclude, orderBy: { createdAt: 'asc' } });
  return { today: today(), pools: pools.map(shapePool) };
}

/** Pools covering any task the team member is assigned to — the team board. */
export async function listEmployeePools(userId: string) {
  const pools = await prisma.timeSheetPool.findMany({
    where: { tasks: { some: { task: { assignees: { some: { userId } } } } } },
    include: poolInclude,
    orderBy: { createdAt: 'asc' },
  });
  return { today: today(), pools: pools.map(shapePool) };
}

function checkRules(input: PoolInput) {
  if (input.termEnd < input.termStart) throw ApiError.badRequest('The term must end after it starts');
  if (input.monthlyHours > input.monthlyMax) throw ApiError.badRequest('The monthly hours must not be above the monthly maximum');
  if (input.monthlyAlertAt > input.monthlyMax) throw ApiError.badRequest('The monthly alert must not be above the monthly maximum');
  if (input.poolAlertAt > input.poolHours) throw ApiError.badRequest('The pool alert must not be above the pool hours');
}

/** Only this customer's tasks may share its pool. */
async function checkTasks(customerId: string, tasks: PoolInput['tasks']) {
  const ids = [...new Set(tasks.map((t) => t.taskId))];
  const found = await prisma.task.count({ where: { id: { in: ids }, customerId } });
  if (found !== ids.length) throw ApiError.badRequest('Pick tasks of this customer only');
}

const poolData = (input: PoolInput) => ({
  name: input.name,
  kind: 'shared-pool',
  termStart: new Date(input.termStart),
  termEnd: new Date(input.termEnd),
  poolHours: input.poolHours,
  monthlyAllocation: input.monthlyHours,
  monthlyMax: input.monthlyMax,
  monthlyAlertAt: input.monthlyAlertAt,
  poolAlertAt: input.poolAlertAt,
  extraRate: input.extraRate,
});

export async function createPool(customerId: string, input: PoolInput) {
  checkRules(input);
  await checkTasks(customerId, input.tasks);
  const pool = await prisma.timeSheetPool.create({
    data: {
      customerId,
      ...poolData(input),
      tasks: { create: input.tasks.map((t) => ({ taskId: t.taskId, label: t.label?.trim() || null })) },
    },
    include: poolInclude,
  });
  return shapePool(pool);
}

async function ownedPool(customerId: string, poolId: string) {
  const pool = await prisma.timeSheetPool.findFirst({ where: { id: poolId, customerId }, include: poolInclude });
  if (!pool) throw ApiError.notFound('Pool not found');
  return pool;
}

/**
 * Change a pool's rules or tasks. Logged time and approvals are never touched:
 * a task taken off the pool keeps its entries (they just stop counting here).
 */
export async function updatePool(customerId: string, poolId: string, input: PoolInput) {
  await ownedPool(customerId, poolId);
  checkRules(input);
  await checkTasks(customerId, input.tasks);
  const pool = await prisma.$transaction(async (tx) => {
    await tx.timeSheetPoolTask.deleteMany({ where: { poolId, taskId: { notIn: input.tasks.map((t) => t.taskId) } } });
    for (const t of input.tasks) {
      await tx.timeSheetPoolTask.upsert({
        where: { poolId_taskId: { poolId, taskId: t.taskId } },
        create: { poolId, taskId: t.taskId, label: t.label?.trim() || null },
        update: { label: t.label?.trim() || null },
      });
    }
    return tx.timeSheetPool.update({ where: { id: poolId }, data: poolData(input), include: poolInclude });
  });
  return shapePool(pool);
}

/**
 * The pool's rules, the way the form shows them: the dates must fall inside the
 * term, the month may not go over its maximum, and once the pool is spent only
 * approved extra hours can be used (P1 fixes are exempt). An edited entry is
 * left out of the sums it is checked against. The request ID must be unused.
 */
async function checkEntry(pool: PoolRow, input: PoolEntryInput, editingId?: string) {
  if (!pool.tasks.some((t) => t.taskId === input.taskId)) throw ApiError.badRequest('That task does not draw on this pool');
  const rules = rulesOf(pool);
  if (input.date < rules.termStart || input.endDate > rules.termEnd) {
    throw ApiError.badRequest(`These dates are outside the term (${rules.termStart} – ${rules.termEnd})`);
  }
  if (input.endDate < input.date) throw ApiError.badRequest('The end date must not be before the start date');
  const shaped = shapePool(pool);
  const others = shaped.entries.filter((e) => e.id !== editingId);
  const summary = summarisePool(rules, others, today(), shaped.approvals);
  const month = summary.rows.find((r) => r.month === input.date.slice(0, 7));
  if (month && round2(month.used + input.actualHours) > rules.monthlyMax) {
    throw ApiError.badRequest(`This takes the month over the ${rules.monthlyMax} h monthly maximum. Date the work into next month.`);
  }
  const available = Math.max(0, summary.balance) + summary.extraRemaining;
  if (input.actualHours > available && input.priority !== 'P1') {
    throw ApiError.badRequest(
      `Only ${round2(available)} h is left in the pool and approved extra hours. The client needs to approve more first (P1 fixes are exempt).`
    );
  }

  const taken = await prisma.taskTimeEntry.findFirst({
    where: { requestId: input.requestId, ...(editingId && { id: { not: editingId } }) },
    select: { id: true },
  });
  if (taken) throw ApiError.conflict('This request ID is already used. Make a new one and save again.');
}

/** The entry's work fields, as saved on create and edit. */
const entryData = (input: PoolEntryInput) => ({
  taskId: input.taskId,
  workDate: new Date(input.date),
  workEndDate: new Date(input.endDate),
  hours: input.actualHours,
  requestId: input.requestId,
  priority: input.priority,
  category: input.category,
  description: input.description,
  staff: input.staff,
  note: input.notes?.trim() || null,
});

/** A new or edited entry waits for the client: tell the customer's client users. */
async function askClientToApprove(customerId: string, entryId: string, input: PoolEntryInput, edited: boolean) {
  const clients = await prisma.clientUser.findMany({ where: { customerId, isActive: true }, select: { id: true } });
  for (const c of clients) {
    notify({
      userId: c.id,
      userType: 'CLIENT',
      type: 'timesheet',
      title: edited ? 'Edited time entry to approve' : 'Time entry to approve',
      body: `${input.requestId} — ${round2(input.actualHours)} h · ${input.description}`,
      link: '/client/tasks',
      entityType: 'TaskTimeEntry',
      entityId: entryId,
    });
  }
}

const reloadPool = async (poolId: string) =>
  shapePool(await prisma.timeSheetPool.findUniqueOrThrow({ where: { id: poolId }, include: poolInclude }));

/** Log time against a pool. The entry waits for the client's approval. */
async function addEntry(pool: PoolRow, input: PoolEntryInput, actor: TimeActor) {
  await checkEntry(pool, input);
  const entry = await prisma.taskTimeEntry.create({
    data: {
      customerId: pool.customerId,
      poolId: pool.id,
      ...entryData(input),
      approvalStatus: 'PENDING',
      authorId: actor.id,
      authorType: actor.type,
      authorName: actor.name,
    },
  });
  await askClientToApprove(pool.customerId, entry.id, input, false);
  return reloadPool(pool.id);
}

function ownedEntry(pool: PoolRow, entryId: string) {
  const entry = pool.entries.find((e) => e.id === entryId);
  if (!entry) throw ApiError.notFound('Time entry not found');
  return entry;
}

/** The admin edits an entry; it goes back to the client for approval. */
export async function updatePoolEntry(customerId: string, poolId: string, entryId: string, input: PoolEntryInput) {
  const pool = await ownedPool(customerId, poolId);
  ownedEntry(pool, entryId);
  await checkEntry(pool, input, entryId);
  await prisma.taskTimeEntry.update({
    where: { id: entryId },
    data: { ...entryData(input), approvalStatus: 'PENDING', rejectReason: null, decidedAt: null, decidedById: null, decidedByName: null },
  });
  await askClientToApprove(customerId, entryId, input, true);
  return reloadPool(poolId);
}

/** The admin removes an entry; its hours return to the pool. */
export async function deletePoolEntry(customerId: string, poolId: string, entryId: string) {
  const pool = await ownedPool(customerId, poolId);
  ownedEntry(pool, entryId);
  await prisma.taskTimeEntry.delete({ where: { id: entryId } });
  return reloadPool(poolId);
}

/** The client approves an entry (it is settled) or rejects it with a reason. */
export async function decidePoolEntry(customerId: string, poolId: string, entryId: string, input: EntryDecisionInput, actor: TimeActor) {
  const pool = await ownedPool(customerId, poolId);
  const entry = ownedEntry(pool, entryId);
  if (entry.approvalStatus !== 'PENDING') throw ApiError.badRequest('This time entry is already decided');
  const rejected = input.decision === 'REJECTED';
  const reason = rejected ? input.reason?.trim() || null : null;
  await prisma.taskTimeEntry.update({
    where: { id: entryId },
    data: { approvalStatus: input.decision, rejectReason: reason, decidedAt: new Date(), decidedById: actor.id, decidedByName: actor.name },
  });
  const message = {
    type: 'timesheet',
    title: rejected ? 'Time entry rejected' : 'Time entry approved',
    body: `${entry.requestId ?? ''} — ${actor.name}${reason ? `: ${reason}` : ''}`,
    entityType: 'TaskTimeEntry',
    entityId: entryId,
  };
  notifySuperAdmins({ ...message, link: '/admin/tasks' });
  if (entry.authorType === 'EMPLOYEE') notify({ ...message, userId: entry.authorId, userType: 'EMPLOYEE', link: '/employee/tasks' });
  return reloadPool(poolId);
}

export async function addPoolEntry(customerId: string, poolId: string, input: PoolEntryInput, actor: TimeActor) {
  return addEntry(await ownedPool(customerId, poolId), input, actor);
}

/** A team member logs time only on a pool task they are assigned to. */
export async function addEmployeePoolEntry(userId: string, poolId: string, input: PoolEntryInput, actor: TimeActor) {
  const assigned = await prisma.task.findFirst({ where: { id: input.taskId, assignees: { some: { userId } } }, select: { id: true } });
  if (!assigned) throw ApiError.notFound('Task not found');
  const pool = await prisma.timeSheetPool.findUnique({ where: { id: poolId }, include: poolInclude });
  if (!pool) throw ApiError.notFound('Pool not found');
  return addEntry(pool, input, actor);
}

/** The client (or the admin on their behalf) approves extra hours beyond the pool. */
export async function approveExtraHours(customerId: string, poolId: string, input: ExtraApprovalInput, actor: TimeActor) {
  await ownedPool(customerId, poolId);
  await prisma.timeSheetExtraApproval.create({
    data: {
      poolId,
      approvedOn: new Date(today()),
      hours: input.hours,
      reference: input.reference?.trim() || null,
      approvedById: actor.id,
      approvedByType: actor.type,
      approvedByName: actor.name,
    },
  });
  return shapePool(await prisma.timeSheetPool.findUniqueOrThrow({ where: { id: poolId }, include: poolInclude }));
}
