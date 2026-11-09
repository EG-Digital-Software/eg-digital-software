import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Prisma, type Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Access Point lock. Every admin, team member and client login has its own
 * 6-digit PIN, unique across everyone. A task's Access Point tab stays locked
 * until the signed-in user enters their PIN; that unlock, and every change made
 * in the tab while it is open, is recorded on the task (who, when, what).
 *
 * An unlock hands back a short-lived key the tab sends with each request. The
 * key is signed with a secret derived for this purpose only, so it can never
 * pass as a login token. The tab drops it the moment it is left — that is the
 * lock — and it expires on its own after UNLOCK_TTL regardless.
 */

export const ACCESS_KEY_HEADER = 'x-access-point-key';
const UNLOCK_TTL = '30m';
/** Wrong PINs allowed per user in FAIL_WINDOW before unlocking is paused. */
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60_000;

const keySecret = crypto.createHmac('sha256', env.JWT_SECRET).update('access-point-unlock').digest();

export interface Actor {
  id: string;
  type: Role;
  name: string;
}

export type AccessPointAction = 'UNLOCKED' | 'ADDED' | 'EDITED' | 'DELETED' | 'PIN_FAILED';

const randomPin = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const isUniqueClash = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** The user's PIN, issued on first ask. */
export async function getPin(userId: string, userType: Role): Promise<string> {
  const found = await prisma.accessPin.findUnique({ where: { userId_userType: { userId, userType } } });
  if (found) return found.pin;
  for (let i = 0; i < 20; i++) {
    try {
      const row = await prisma.accessPin.create({ data: { userId, userType, pin: randomPin() } });
      return row.pin;
    } catch (e) {
      if (!isUniqueClash(e)) throw e;
      // Either the PIN is taken or a parallel request already issued this user's.
      const mine = await prisma.accessPin.findUnique({ where: { userId_userType: { userId, userType } } });
      if (mine) return mine.pin;
    }
  }
  throw ApiError.internal('Could not issue a PIN — please try again');
}

/** Replace the user's PIN with a new one. */
export async function regeneratePin(userId: string, userType: Role): Promise<string> {
  await getPin(userId, userType);
  for (let i = 0; i < 20; i++) {
    try {
      const row = await prisma.accessPin.update({
        where: { userId_userType: { userId, userType } },
        data: { pin: randomPin() },
      });
      return row.pin;
    } catch (e) {
      if (!isUniqueClash(e)) throw e;
    }
  }
  throw ApiError.internal('Could not issue a PIN — please try again');
}

export function record(taskId: string, actor: Actor, action: AccessPointAction, detail?: string | null) {
  return prisma.accessPointLog.create({
    data: { taskId, userId: actor.id, userType: actor.type, userName: actor.name, action, detail: detail ?? null },
  });
}

/** Check the signed-in user's PIN; on success record the unlock and return a key. */
export async function unlock(taskId: string, actor: Actor, pin: string): Promise<string> {
  const fails = await prisma.accessPointLog.count({
    where: { userId: actor.id, action: 'PIN_FAILED', createdAt: { gte: new Date(Date.now() - FAIL_WINDOW_MS) } },
  });
  if (fails >= MAX_FAILS) {
    throw new ApiError(429, 'Too many wrong PINs — please wait 15 minutes and try again');
  }
  const mine = await getPin(actor.id, actor.type);
  const given = Buffer.from(String(pin ?? '').trim());
  const expected = Buffer.from(mine);
  const okPin = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!okPin) {
    await record(taskId, actor, 'PIN_FAILED');
    const left = MAX_FAILS - fails - 1;
    throw ApiError.badRequest(left > 0 ? `Wrong PIN — ${left} attempt${left === 1 ? '' : 's'} left` : 'Wrong PIN');
  }
  await record(taskId, actor, 'UNLOCKED');
  return jwt.sign({ sub: actor.id, role: actor.type, tid: taskId }, keySecret, { expiresIn: UNLOCK_TTL });
}

/** Throw unless `key` is a live unlock of this task by this user. */
export function assertUnlocked(taskId: string, actor: { id: string; type: Role }, key: unknown) {
  try {
    if (typeof key !== 'string' || !key) throw new Error('missing');
    const p = jwt.verify(key, keySecret) as { sub: string; role: Role; tid: string };
    if (p.sub === actor.id && p.role === actor.type && p.tid === taskId) return;
  } catch {
    /* fall through */
  }
  throw new ApiError(423, 'Access Point is locked — enter your PIN to open it');
}

/** An entry on this task, when `noteId` is one of its Access Point entries. */
export function findEntry(taskId: string, noteId: string) {
  return prisma.taskNote.findFirst({ where: { id: noteId, taskId, kind: 'ACCESS_POINT' } });
}

/** The tab's entries and its record, newest record first. */
export async function getAccessPoint(taskId: string) {
  const [entries, log] = await Promise.all([
    prisma.taskNote.findMany({ where: { taskId, kind: 'ACCESS_POINT' }, orderBy: { createdAt: 'asc' } }),
    prisma.accessPointLog.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);
  return { entries, log };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Which entry a change touched — "entry by Jane Doe, added 08 Nov 2026" — never
 * its text: entries hold credentials, and the record outlives a deleted entry.
 */
export function describeEntry(note: { authorName: string; createdAt: Date }) {
  const d = note.createdAt;
  return `Entry by ${note.authorName}, added ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export interface PinHolder {
  userId: string;
  userType: Role;
  name: string;
  email: string;
  /** Customer's company, for client logins. */
  company: string | null;
  active: boolean;
  pin: string;
}

/**
 * Every login's PIN for the admin — admins, team members and client logins —
 * issuing one to anyone who hasn't been given theirs yet.
 */
export async function listPins(): Promise<PinHolder[]> {
  const select = { id: true, firstName: true, lastName: true, email: true, isActive: true } as const;
  const [admins, employees, clients, pins] = await Promise.all([
    prisma.adminUser.findMany({ select }),
    prisma.employeeUser.findMany({ select }),
    prisma.clientUser.findMany({
      select: { ...select, customer: { select: { companyName: true, contactPerson: true, clientId: true } } },
    }),
    prisma.accessPin.findMany({ select: { userId: true, userType: true, pin: true } }),
  ]);
  const byUser = new Map(pins.map((p) => [`${p.userType}:${p.userId}`, p.pin]));
  const people = [
    ...admins.map((u) => ({ u, type: 'SUPER_ADMIN' as Role, company: null as string | null })),
    ...employees.map((u) => ({ u, type: 'EMPLOYEE' as Role, company: null as string | null })),
    ...clients.map((u) => ({
      u,
      type: 'CLIENT' as Role,
      company: u.customer ? u.customer.companyName || u.customer.contactPerson || u.customer.clientId : null,
    })),
  ];
  const out: PinHolder[] = [];
  for (const { u, type, company } of people) {
    out.push({
      userId: u.id,
      userType: type,
      name: `${u.firstName} ${u.lastName}`.trim() || u.email,
      email: u.email,
      company,
      active: u.isActive,
      pin: byUser.get(`${type}:${u.id}`) ?? (await getPin(u.id, type)),
    });
  }
  return out;
}

/** Does this login exist? Guards the admin's "new PIN" for someone else. */
export async function userExists(userId: string, userType: Role) {
  const where = { where: { id: userId }, select: { id: true } };
  if (userType === 'SUPER_ADMIN') return !!(await prisma.adminUser.findUnique(where));
  if (userType === 'EMPLOYEE') return !!(await prisma.employeeUser.findUnique(where));
  if (userType === 'CLIENT') return !!(await prisma.clientUser.findUnique(where));
  return false;
}
