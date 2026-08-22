import type { ActivityAction, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { resolveActors } from './accounts.js';

interface LogInput {
  userId?: string | null;
  userType?: Role | null;
  action: ActivityAction;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

/** Fire-and-forget activity logging (never blocks the request path). */
export function logActivity(input: LogInput): void {
  prisma.activityLog
    .create({
      data: {
        userId: input.userId ?? undefined,
        userType: input.userType ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    })
    .catch(() => {
      /* swallow — auditing must never break the primary flow */
    });
}

export async function listActivity(limit = 20) {
  const rows = await prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  // Users are referenced polymorphically (userId + userType) across the four
  // account tables, so resolve their display names in a single batched pass.
  const actorMap = await resolveActors(
    rows.filter((r) => r.userId).map((r) => ({ userId: r.userId!, userType: r.userType }))
  );

  return rows.map((r) => ({
    ...r,
    user: r.userId ? (actorMap.get(r.userId) ?? null) : null,
  }));
}
