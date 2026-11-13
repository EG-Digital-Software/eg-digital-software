import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { Actor } from './social/social.service.js';

/**
 * SEO Dashboard, Local Listing and Azure Performance tabs. Each is a report
 * the team fills in by hand (figures per month, findings, listings, keywords,
 * resources, work log). Nothing here is sample data: a new report is empty
 * until the team enters something.
 */

export const REPORT_KINDS = ['seo', 'local', 'azure'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

const FLAG = {
  seo: 'showSeoDashboard',
  local: 'showLocalListing',
  azure: 'showAzurePerformance',
} as const;

const TAB_NAME: Record<ReportKind, string> = {
  seo: 'SEO Dashboard',
  local: 'Local Listing',
  azure: 'Azure Performance',
};

/** Top-level keys of ReportDashboard.data the team may write. */
const DATA_KEYS = [
  'cfg', // site / business / client details and targets
  'months', // figures per month: { 'YYYY-MM': {...} }
  'findings', // site / listing check findings with steps
  'pages', // SEO key pages checked
  'countries', // SEO countries and their pages
  'kw', // keywords / local searches with positions per month
  'lists', // local listings and their status
  'nap', // local business details check rows
  'res', // Azure resources
  'recs', // Azure recommendations
  'inc', // Azure incidents
  'base', // starting point (before the work)
  'work', // work log
  'notes', // account manager summary
  'insights', // team insight progress (owner, status, steps ticked)
  'meta', // last update: when, by whom, source
] as const;

const isStaff = (a: Actor) => a.type !== 'CLIENT';

export function parseKind(kind: string): ReportKind {
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) throw ApiError.notFound('Unknown report');
  return kind as ReportKind;
}

async function ensureReportTask(customerId: string, taskId: string, kind: ReportKind) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, customerId },
    select: {
      id: true,
      title: true,
      showSeoDashboard: true,
      showLocalListing: true,
      showAzurePerformance: true,
      assignees: { select: { name: true } },
    },
  });
  if (!task) throw ApiError.notFound('Task not found');
  if (!task[FLAG[kind]]) throw ApiError.notFound(`The ${TAB_NAME[kind]} is not switched on for this task`);
  return task;
}

export async function getReport(customerId: string, taskId: string, kindRaw: string, viewer: Actor) {
  const kind = parseKind(kindRaw);
  const task = await ensureReportTask(customerId, taskId, kind);
  const [report, customer] = await Promise.all([
    prisma.reportDashboard.findUnique({ where: { taskId_kind: { taskId, kind } } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { companyName: true, tradingAs: true } }),
  ]);
  return {
    kind,
    customerName: customer?.tradingAs || customer?.companyName || '',
    taskTitle: task.title,
    canEdit: isStaff(viewer),
    viewer: { name: viewer.name, role: viewer.type },
    team: [...new Set(task.assignees.map((a) => a.name).filter(Boolean))],
    today: new Date().toISOString().slice(0, 10),
    data: (report?.data ?? {}) as Record<string, unknown>,
    updatedAt: report?.updatedAt ?? null,
    updatedByName: report?.updatedByName ?? null,
  };
}

export async function saveReport(
  customerId: string,
  taskId: string,
  kindRaw: string,
  actor: Actor,
  patch: Record<string, unknown>
) {
  if (!isStaff(actor)) throw ApiError.forbidden('Only the admin or team can change this report');
  const kind = parseKind(kindRaw);
  await ensureReportTask(customerId, taskId, kind);
  const existing = await prisma.reportDashboard.findUnique({ where: { taskId_kind: { taskId, kind } } });
  const next = { ...((existing?.data ?? {}) as Record<string, unknown>) };
  let changed = false;
  for (const k of DATA_KEYS) {
    if (patch[k] !== undefined) {
      next[k] = patch[k];
      changed = true;
    }
  }
  if (!changed) throw ApiError.badRequest('Nothing to save');
  if (JSON.stringify(next).length > 2_000_000) throw ApiError.badRequest('Too much report data in one save');
  const saved = await prisma.reportDashboard.upsert({
    where: { taskId_kind: { taskId, kind } },
    create: { taskId, kind, data: next as Prisma.InputJsonValue, updatedById: actor.id, updatedByName: actor.name },
    update: { data: next as Prisma.InputJsonValue, updatedById: actor.id, updatedByName: actor.name },
  });
  return { ok: true, updatedAt: saved.updatedAt, updatedByName: saved.updatedByName };
}
