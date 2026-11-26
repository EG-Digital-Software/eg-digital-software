import type { Role } from '@prisma/client';
import { isDemoContext, prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';

/**
 * Push notifications to the mobile app through Expo's push service, which hands
 * them to FCM (Android) / APNs (iOS). Phones register an Expo push token after
 * sign-in; every in-app notification — and every new chat message for a client —
 * is also pushed so it reaches the phone whether or not the app is open.
 *
 * Everything here is fire-and-forget: a push failure never breaks the action
 * that triggered it.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts up to 100 messages per request. */
const BATCH = 100;

export interface PushTarget {
  userId: string;
  userType: Role;
}

export interface PushMessage {
  title: string;
  body?: string;
  /** Read by the app when the notification is tapped (where to open). */
  data?: Record<string, unknown>;
}

const isExpoToken = (t: string) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);

/** Save (or move) this phone's token to the signed-in user. */
export async function registerDevice(user: PushTarget, token: string, platform?: string) {
  if (!isExpoToken(token)) throw new Error('Not an Expo push token');
  await prisma.pushDevice.upsert({
    where: { token },
    create: { token, userId: user.userId, userType: user.userType, platform: platform ?? null },
    // A phone that changes account follows the latest sign-in.
    update: { userId: user.userId, userType: user.userType, platform: platform ?? null, lastSeenAt: new Date() },
  });
}

/** Forget this phone (sign-out or notifications turned off) — only for its own user. */
export async function unregisterDevice(user: PushTarget, token: string) {
  await prisma.pushDevice.deleteMany({ where: { token, userId: user.userId, userType: user.userType } });
}

/** Push one message to every phone of the given users. */
export function pushTo(targets: PushTarget[], message: PushMessage): void {
  // The demo portal never reaches a real phone.
  if (!targets.length || isDemoContext()) return;
  void (async () => {
    const devices = await prisma.pushDevice.findMany({
      where: { OR: targets.map((t) => ({ userId: t.userId, userType: t.userType })) },
      select: { token: true },
    });
    const tokens = [...new Set(devices.map((d) => d.token))];
    if (!tokens.length) return;

    const body = (message.body ?? '').replace(/\s+/g, ' ').trim();
    const messages = tokens.map((to) => ({
      to,
      title: message.title,
      body: body.length > 180 ? `${body.slice(0, 177)}…` : body,
      data: message.data ?? {},
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    }));

    for (let i = 0; i < messages.length; i += BATCH) {
      await send(messages.slice(i, i + BATCH));
    }
  })().catch((err) => logger.warn({ err }, 'Push notification failed'));
}

/** Push one message to every registered phone (all accounts). */
export function pushToAllDevices(message: PushMessage): void {
  if (isDemoContext()) return;
  void prisma.pushDevice
    .findMany({ distinct: ['userId', 'userType'], select: { userId: true, userType: true } })
    .then((users) => pushTo(users, message))
    .catch((err) => logger.warn({ err }, 'Push to all devices failed'));
}

/** Push to every active portal login of a customer (optionally skipping some users). */
export function pushToCustomer(customerId: string, message: PushMessage, skipUserIds: string[] = []): void {
  void prisma.clientUser
    .findMany({ where: { customerId, isActive: true }, select: { id: true } })
    .then((users) =>
      pushTo(
        users.filter((u) => !skipUserIds.includes(u.id)).map((u) => ({ userId: u.id, userType: 'CLIENT' as Role })),
        message
      )
    )
    .catch((err) => logger.warn({ err, customerId }, 'Push to customer failed'));
}

type Ticket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

async function send(batch: Array<{ to: string }>) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  // Optional: only needed if "enhanced push security" is turned on for the Expo project.
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(batch) });
  if (!res.ok) {
    logger.warn({ status: res.status, body: await res.text().catch(() => '') }, 'Expo push request rejected');
    return;
  }
  const json = (await res.json().catch(() => null)) as { data?: Ticket[] } | null;
  const tickets = json?.data ?? [];
  // Uninstalled apps / revoked tokens: drop them so we stop sending.
  const dead = tickets
    .map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? batch[i]?.to : null))
    .filter((t): t is string => !!t);
  if (dead.length) await prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
  const other = tickets.filter((t) => t.status === 'error' && t.details?.error !== 'DeviceNotRegistered');
  if (other.length) logger.warn({ errors: other.slice(0, 5) }, 'Some push notifications were not accepted');
}
