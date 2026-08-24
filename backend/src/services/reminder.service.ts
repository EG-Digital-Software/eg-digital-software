import { LicenceStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { computeLicenceStatus, daysRemaining } from '../utils/licence.js';
import { sendLicenceReminderClient, sendLicenceDigestAdmin } from './email/templates.js';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Has this exact reminder already been sent to this user today? (idempotent) */
async function alreadySentToday(userId: string, type: string, entityId?: string): Promise<boolean> {
  const count = await prisma.notification.count({
    where: { userId, type, entityId, createdAt: { gte: startOfToday() } },
  });
  return count > 0;
}

export interface ReminderResult {
  expiringSoon: number;
  critical: number;
  expired: number;
  notificationsCreated: number;
}

/**
 * Daily licence-expiry reminder. Notifies Super Admins with a digest and each
 * customer's Client users about their own expiring/critical/expired licences.
 * Safe to run more than once per day — duplicates are suppressed.
 */
export async function runLicenceReminders(): Promise<ReminderResult> {
  const rows = await prisma.customerProduct.findMany({
    where: { expiryDate: { not: null } },
    include: {
      product: { select: { name: true } },
      customer: { select: { id: true, companyName: true, contactPerson: true } },
    },
  });

  const result: ReminderResult = { expiringSoon: 0, critical: 0, expired: 0, notificationsCreated: 0 };
  const attention: typeof rows = [];

  for (const cp of rows) {
    const status = computeLicenceStatus(cp.expiryDate, cp.status);
    if (status === LicenceStatus.EXPIRED) result.expired++;
    else if (status === LicenceStatus.CRITICAL) result.critical++;
    else if (status === LicenceStatus.EXPIRING_SOON) result.expiringSoon++;
    else continue; // ACTIVE / SUSPENDED — no reminder
    attention.push(cp);
  }

  if (attention.length === 0) {
    logger.info('Licence reminders: nothing to notify');
    return result;
  }

  // ── Per-customer client reminders ──────────────────────
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

  // Collect per-user email digests — only for users who got a NEW reminder today
  // (this naturally throttles email to once per user per day).
  const emailByUser = new Map<
    ClientUser,
    Array<{ product: string; message: string; expired: boolean }>
  >();

  for (const cp of attention) {
    const recipients = clientsByCustomer.get(cp.customer.id) ?? [];
    if (recipients.length === 0) continue;
    const days = daysRemaining(cp.expiryDate)!;
    const expired = days < 0;
    const title = expired ? 'Licence expired' : 'Licence expiring soon';
    const message = expired
      ? `expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
      : `expires in ${days} day${days === 1 ? '' : 's'}`;
    const body = `${cp.product.name} ${message}`;

    for (const user of recipients) {
      if (await alreadySentToday(user.id, 'licence', cp.id)) continue;
      await prisma.notification.create({
        data: {
          userId: user.id,
          userType: 'CLIENT',
          type: 'licence',
          title,
          body,
          link: '/client/licences',
          entityType: 'CustomerProduct',
          entityId: cp.id,
        },
      });
      result.notificationsCreated++;
      const lines = emailByUser.get(user) ?? [];
      lines.push({ product: cp.product.name, message, expired });
      emailByUser.set(user, lines);
    }
  }

  // One digest email per affected client user.
  for (const [user, lines] of emailByUser) {
    sendLicenceReminderClient({ email: user.email, firstName: user.firstName }, lines);
  }

  // ── Super Admin daily digest ───────────────────────────
  const admins = await prisma.adminUser.findMany({
    where: { isActive: true, approvalStatus: 'APPROVED' },
    select: { id: true, email: true, firstName: true },
  });
  const digestBody = `${result.critical} critical · ${result.expiringSoon} expiring soon · ${result.expired} expired`;
  for (const admin of admins) {
    if (await alreadySentToday(admin.id, 'licence-digest')) continue;
    await prisma.notification.create({
      data: {
        userId: admin.id,
        userType: 'SUPER_ADMIN',
        type: 'licence-digest',
        title: 'Licence reminders',
        body: `${attention.length} licence${attention.length === 1 ? '' : 's'} need attention — ${digestBody}`,
        link: '/admin/dashboard',
        entityType: 'LicenceDigest',
      },
    });
    result.notificationsCreated++;
    sendLicenceDigestAdmin(
      { email: admin.email, firstName: admin.firstName },
      {
        critical: result.critical,
        expiringSoon: result.expiringSoon,
        expired: result.expired,
        total: attention.length,
      }
    );
  }

  logger.info({ ...result }, 'Licence reminders sent');
  return result;
}
