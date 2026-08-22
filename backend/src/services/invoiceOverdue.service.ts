import { InvoiceStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { D } from '../utils/money.js';
import { sendInvoiceOverdueClient, sendInvoiceOverdueDigestAdmin } from './email/templates.js';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Has this exact reminder already gone to this user today? (idempotent) */
async function alreadySentToday(userId: string, type: string, entityId?: string): Promise<boolean> {
  const count = await prisma.notification.count({
    where: { userId, type, entityId, createdAt: { gte: startOfToday() } },
  });
  return count > 0;
}

/**
 * Statuses that flip to OVERDUE once the due date passes.
 *
 * PARTIALLY_PAID is deliberately excluded: `status` holds one value, and
 * overwriting it would erase the fact that money has already come in. Those
 * invoices are still surfaced as overdue everywhere it matters — the Billing
 * Overdue tab and the "N days overdue" badge derive from the balance and due
 * date, not from this column — and they still receive the reminders below.
 */
const FLIPPABLE: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.PENDING];

export interface OverdueResult {
  markedOverdue: number;
  overdueTotal: number;
  notificationsCreated: number;
}

/**
 * Daily invoice-overdue sweep. Marks newly-overdue invoices, then notifies the
 * client users on each affected customer and sends the Super Admins a digest.
 * Safe to run more than once a day — duplicate notifications are suppressed.
 */
export async function runInvoiceOverdueSweep(): Promise<OverdueResult> {
  const result: OverdueResult = { markedOverdue: 0, overdueTotal: 0, notificationsCreated: 0 };

  // ── 1. Flip newly-overdue invoices ─────────────────────
  // Anything due before today that still carries a balance.
  const flipped = await prisma.invoice.updateMany({
    where: {
      dueDate: { lt: startOfToday() },
      status: { in: FLIPPABLE },
      amountPaid: { lt: prisma.invoice.fields.total },
    },
    data: { status: InvoiceStatus.OVERDUE },
  });
  result.markedOverdue = flipped.count;

  // ── 2. Everything still owed past its due date ─────────
  const overdue = await prisma.invoice.findMany({
    where: {
      dueDate: { lt: startOfToday() },
      status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT] },
      amountPaid: { lt: prisma.invoice.fields.total },
    },
    select: {
      id: true,
      invoiceNumber: true,
      dueDate: true,
      total: true,
      amountPaid: true,
      currency: true,
      customerId: true,
    },
  });
  result.overdueTotal = overdue.length;

  if (overdue.length === 0) {
    logger.info({ ...result }, 'Invoice overdue sweep: nothing outstanding');
    return result;
  }

  // ── 3. Per-customer client reminders ───────────────────
  const clientUsers = await prisma.clientUser.findMany({
    where: { isActive: true, approvalStatus: 'APPROVED', customerId: { not: null } },
    select: { id: true, email: true, firstName: true, customerId: true },
  });
  type ClientUser = (typeof clientUsers)[number];
  const clientsByCustomer = new Map<string, ClientUser[]>();
  for (const u of clientUsers) {
    if (!u.customerId) continue;
    const arr = clientsByCustomer.get(u.customerId) ?? [];
    arr.push(u);
    clientsByCustomer.set(u.customerId, arr);
  }

  // Batch each user's invoices into one email, so a customer with five overdue
  // invoices gets one message rather than five.
  const emailByUser = new Map<
    ClientUser,
    Array<{ invoiceNumber: string; balance: string; days: number }>
  >();

  for (const inv of overdue) {
    const recipients = clientsByCustomer.get(inv.customerId) ?? [];
    if (recipients.length === 0) continue;

    const days = Math.floor((startOfToday().getTime() - inv.dueDate.getTime()) / 86_400_000);
    const balance = inv.total.minus(inv.amountPaid).toFixed(2);

    for (const user of recipients) {
      if (await alreadySentToday(user.id, 'invoice-overdue', inv.id)) continue;
      await prisma.notification.create({
        data: {
          userId: user.id,
          userType: 'CLIENT',
          type: 'invoice-overdue',
          title: 'Invoice overdue',
          body: `${inv.invoiceNumber} is ${days} day${days === 1 ? '' : 's'} overdue — ${inv.currency} ${balance} outstanding`,
          link: `/client/invoices/${inv.id}`,
          entityType: 'Invoice',
          entityId: inv.id,
        },
      });
      result.notificationsCreated++;
      const lines = emailByUser.get(user) ?? [];
      lines.push({ invoiceNumber: inv.invoiceNumber, balance, days });
      emailByUser.set(user, lines);
    }
  }

  for (const [user, lines] of emailByUser) {
    sendInvoiceOverdueClient({ email: user.email, firstName: user.firstName }, lines);
  }

  // ── 4. Super Admin digest ──────────────────────────────
  const outstandingTotal = overdue
    .reduce((sum, inv) => sum.plus(inv.total.minus(inv.amountPaid)), D(0))
    .toFixed(2);

  const admins = await prisma.adminUser.findMany({
    where: { isActive: true, approvalStatus: 'APPROVED' },
    select: { id: true, email: true, firstName: true },
  });
  for (const admin of admins) {
    if (await alreadySentToday(admin.id, 'invoice-overdue-digest')) continue;
    await prisma.notification.create({
      data: {
        userId: admin.id,
        userType: 'SUPER_ADMIN',
        type: 'invoice-overdue-digest',
        title: 'Overdue invoices',
        body: `${overdue.length} invoice${overdue.length === 1 ? '' : 's'} overdue — ${outstandingTotal} outstanding`,
        link: '/admin/billing',
        entityType: 'InvoiceDigest',
      },
    });
    result.notificationsCreated++;
    sendInvoiceOverdueDigestAdmin(
      { email: admin.email, firstName: admin.firstName },
      { count: overdue.length, outstanding: outstandingTotal, newlyOverdue: result.markedOverdue }
    );
  }

  logger.info({ ...result }, 'Invoice overdue sweep complete');
  return result;
}
