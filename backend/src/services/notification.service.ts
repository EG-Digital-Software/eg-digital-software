import type { Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { pushTo } from './push.service.js';

/** What the app needs to open the right screen when a push is tapped. */
const pushData = (input: Omit<NotifyInput, 'userId' | 'userType'>) => ({
  type: input.type,
  link: input.link ?? null,
  entityType: input.entityType ?? null,
  entityId: input.entityId ?? null,
});

/**
 * Push with the task's customer (clientId) added, so the admin app can open the
 * task itself — admin task routes are per customer. Fire-and-forget.
 */
function pushWithClient(
  targets: Array<{ userId: string; userType: Role }>,
  input: Omit<NotifyInput, 'userId' | 'userType'>
): void {
  const data: Record<string, unknown> = pushData(input);
  const lookup =
    input.entityType?.toLowerCase() === 'task' && input.entityId
      ? prisma.task
          .findUnique({ where: { id: input.entityId }, select: { customer: { select: { clientId: true } } } })
          .then((t) => t?.customer.clientId ?? null)
          .catch(() => null)
      : Promise.resolve(null);
  void lookup.then((clientId) => {
    if (clientId) data.clientId = clientId;
    pushTo(targets, { title: input.title, body: input.body, data });
  });
}

interface NotifyInput {
  userId: string;
  userType: Role;
  type: string;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

/** The account table backing each role — for role-wide fan-out notifications. */
interface FanoutDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    select: Record<string, boolean>;
  }): Promise<Array<{ id: string }>>;
}

function accountDelegate(role: Role): FanoutDelegate {
  switch (role) {
    case 'SUPER_ADMIN':
      return prisma.adminUser as unknown as FanoutDelegate;
    case 'CLIENT':
      return prisma.clientUser as unknown as FanoutDelegate;
    case 'SUPPLIER':
      return prisma.supplierUser as unknown as FanoutDelegate;
    case 'EMPLOYEE':
      return prisma.employeeUser as unknown as FanoutDelegate;
    default:
      throw new Error(`Unknown role: ${role as string}`);
  }
}

/** Create a notification and push it to the user's phones (fire-and-forget — never breaks the primary flow). */
export function notify(input: NotifyInput): void {
  prisma.notification
    .create({ data: input })
    .catch((err) => logger.error({ err }, 'Notification create failed'));
  pushWithClient([{ userId: input.userId, userType: input.userType }], input);
}

/** Notify every approved, active user of a given role. */
export function notifyRole(role: Role, input: Omit<NotifyInput, 'userId' | 'userType'>): void {
  accountDelegate(role)
    .findMany({
      where: { isActive: true, approvalStatus: 'APPROVED' },
      select: { id: true },
    })
    .then((users: Array<{ id: string }>) => {
      pushWithClient(
        users.map((u) => ({ userId: u.id, userType: role })),
        input
      );
      return prisma.notification.createMany({
        data: users.map((u) => ({ ...input, userId: u.id, userType: role })),
      });
    })
    .catch((err: unknown) => logger.error({ err }, 'notifyRole failed'));
}

export const notifySuperAdmins = (input: Omit<NotifyInput, 'userId' | 'userType'>) =>
  notifyRole('SUPER_ADMIN', input);

export async function list(userId: string, limit = 20) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);
  return { items, unread };
}

export function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function markRead(userId: string, id: string) {
  await prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}
