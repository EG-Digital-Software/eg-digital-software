import { CustomerStatus, type Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { resolveCustomerId } from './client.service.js';

/**
 * Server-computed change signatures for each portal's sidebar tabs, so a tab can
 * show its red dot from real data changes without the page being open. A
 * signature is `${count}:${latestUpdatedAtMs}` — it moves on add (count up),
 * update (latest timestamp up) and delete (count down). The client compares it
 * against what the viewer last acknowledged (SectionSeen).
 */
type AggResult = { _count: { _all: number }; _max: { updatedAt: Date | null } };

const AGG = { _count: { _all: true }, _max: { updatedAt: true } } as const;

function toSig(res: AggResult): string {
  return `${res._count._all}:${res._max.updatedAt ? res._max.updatedAt.getTime() : 0}`;
}

export async function tabSignatures(
  userId: string,
  role: Role,
  cid?: string
): Promise<Record<string, string>> {
  if (role === 'SUPER_ADMIN') return adminTabs();
  if (role === 'EMPLOYEE') return employeeTabs(userId);
  if (role === 'CLIENT') {
    const customerId = cid ?? (await resolveCustomerId(userId).catch(() => null));
    return customerId ? clientTabs(customerId) : {};
  }
  return {};
}

async function adminTabs(): Promise<Record<string, string>> {
  const [customers, tasks, invoices, products, payments, team] = await Promise.all([
    prisma.customer.aggregate(AGG),
    prisma.task.aggregate(AGG),
    prisma.invoice.aggregate(AGG),
    prisma.product.aggregate(AGG),
    prisma.payment.aggregate(AGG),
    prisma.employeeUser.aggregate(AGG),
  ]);
  return {
    '/admin/customers': toSig(customers),
    '/admin/tasks': toSig(tasks),
    '/admin/billing': toSig(invoices),
    '/admin/products': toSig(products),
    '/admin/payments': toSig(payments),
    '/admin/team': toSig(team),
  };
}

async function employeeTabs(userId: string): Promise<Record<string, string>> {
  const [tasks, customers] = await Promise.all([
    prisma.task.aggregate({ ...AGG, where: { assignees: { some: { userId } } } }),
    prisma.customer.aggregate({ ...AGG, where: { status: CustomerStatus.ACTIVE } }),
  ]);
  return {
    '/employee/tasks': toSig(tasks),
    '/employee/customers': toSig(customers),
  };
}

async function clientTabs(customerId: string): Promise<Record<string, string>> {
  const [licences, invoices, tasks, docs, customer] = await Promise.all([
    prisma.customerProduct.aggregate({ ...AGG, where: { customerId } }),
    prisma.invoice.aggregate({ ...AGG, where: { customerId } }),
    prisma.task.aggregate({ ...AGG, where: { customerId } }),
    // CustomerDocument has no updatedAt; fold in every lifecycle timestamp so the
    // dot fires on upload, client signing and admin approval alike.
    prisma.customerDocument.aggregate({
      _count: { _all: true },
      _max: { createdAt: true, submittedAt: true, signedAt: true, approvedAt: true },
      where: { customerId },
    }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { updatedAt: true } }),
  ]);
  const docsMax = Math.max(
    docs._max.createdAt?.getTime() ?? 0,
    docs._max.submittedAt?.getTime() ?? 0,
    docs._max.signedAt?.getTime() ?? 0,
    docs._max.approvedAt?.getTime() ?? 0
  );
  return {
    '/client/licences': toSig(licences),
    '/client/invoices': toSig(invoices),
    '/client/tasks': toSig(tasks),
    '/client/agreement': `${docs._count._all}:${docsMax}`,
    '/client/details': `1:${customer?.updatedAt ? customer.updatedAt.getTime() : 0}`,
  };
}
