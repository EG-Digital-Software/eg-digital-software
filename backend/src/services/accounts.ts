import type { Role, AccountStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

/**
 * Account table router.
 *
 * Every portal has its OWN accounts table (AdminUser / ClientUser /
 * SupplierUser / EmployeeUser) — there is no shared user store. This module is
 * the single place that maps a `Role` to the correct Prisma delegate and
 * enforces the one global rule that spans all four tables: an email address may
 * exist in AT MOST ONE table (no overlap, no duplicate accounts).
 */

export const ALL_ROLES: Role[] = ['SUPER_ADMIN', 'CLIENT', 'SUPPLIER', 'EMPLOYEE'];
export const SIGNUP_ROLES: Role[] = ['CLIENT', 'SUPPLIER', 'EMPLOYEE'];

/** A normalized account shape shared by all four tables (+ synthesized role). */
export interface Account {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  approvalStatus: AccountStatus;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  role: Role;
  customerId?: string | null;
  approvedById?: string | null;
  // Present on pending-list rows for CLIENT accounts.
  customer?: { clientId: string; companyName: string | null } | null;
}

// The four delegates share the same operations we need. We centralize the
// (safe) structural cast here so the rest of the codebase stays fully typed.
interface Delegate {
  findUnique(args: { where: Record<string, unknown>; include?: unknown }): Promise<unknown>;
  findMany(args?: unknown): Promise<unknown[]>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
  count(args?: unknown): Promise<number>;
}

function model(role: Role): Delegate {
  switch (role) {
    case 'SUPER_ADMIN':
      return prisma.adminUser as unknown as Delegate;
    case 'CLIENT':
      return prisma.clientUser as unknown as Delegate;
    case 'SUPPLIER':
      return prisma.supplierUser as unknown as Delegate;
    case 'EMPLOYEE':
      return prisma.employeeUser as unknown as Delegate;
    default:
      throw new Error(`Unknown role: ${role as string}`);
  }
}

function normalize(role: Role, u: unknown): Account {
  return { ...(u as Record<string, unknown>), role } as Account;
}

/** Look up an account in a specific portal's table by email. */
export async function findByEmailForRole(role: Role, email: string): Promise<Account | null> {
  const u = await model(role).findUnique({ where: { email: email.toLowerCase() } });
  return u ? normalize(role, u) : null;
}

/** Search every table for an email. Returns the single owning account (or null). */
export async function findByEmailAnywhere(email: string): Promise<Account | null> {
  const e = email.toLowerCase();
  for (const role of ALL_ROLES) {
    const u = await model(role).findUnique({ where: { email: e } });
    if (u) return normalize(role, u);
  }
  return null;
}

/** True if the email already belongs to ANY portal — used to block duplicates. */
export async function emailExistsAnywhere(email: string): Promise<boolean> {
  return (await findByEmailAnywhere(email)) !== null;
}

export async function findById(role: Role, id: string): Promise<Account | null> {
  const u = await model(role).findUnique({ where: { id } });
  return u ? normalize(role, u) : null;
}

export async function updateAccount(
  role: Role,
  id: string,
  data: Record<string, unknown>
): Promise<Account> {
  const u = await model(role).update({ where: { id }, data });
  return normalize(role, u);
}

export async function createAccount(
  role: Role,
  data: Record<string, unknown>
): Promise<Account> {
  const u = await model(role).create({ data });
  return normalize(role, u);
}

export interface RegistrationQuery {
  status?: AccountStatus;
  role?: Role;
  search?: string;
}

/**
 * Registration requests across the three self-signup portals.
 *
 * The three tables are separate models with no shared parent, so there is no
 * single query that can order and page across them. Rows are fetched per table
 * (bounded by FETCH_CAP), merged, then sorted — fine for sign-up requests,
 * which are low-volume by nature. `total` is counted in the database so the
 * pager stays accurate regardless.
 */
const FETCH_CAP = 500;

export async function listRegistrations(
  q: RegistrationQuery
): Promise<{ items: Account[]; total: number; counts: Record<string, number> }> {
  const where: Record<string, unknown> = {};
  if (q.status) where.approvalStatus = q.status;
  if (q.search) {
    const like = { contains: q.search.trim(), mode: 'insensitive' };
    where.OR = [{ firstName: like }, { lastName: like }, { email: like }];
  }

  const roles = q.role ? [q.role] : SIGNUP_ROLES;
  const wanted = (role: Role) => roles.includes(role);

  const [clients, suppliers, employees] = await Promise.all([
    wanted('CLIENT')
      ? prisma.clientUser.findMany({
          where: where as Prisma.ClientUserWhereInput,
          include: { customer: { select: { clientId: true, companyName: true } } },
          orderBy: { createdAt: 'desc' },
          take: FETCH_CAP,
        })
      : Promise.resolve([]),
    wanted('SUPPLIER')
      ? prisma.supplierUser.findMany({
          where: where as Prisma.SupplierUserWhereInput,
          orderBy: { createdAt: 'desc' },
          take: FETCH_CAP,
        })
      : Promise.resolve([]),
    wanted('EMPLOYEE')
      ? prisma.employeeUser.findMany({
          where: where as Prisma.EmployeeUserWhereInput,
          orderBy: { createdAt: 'desc' },
          take: FETCH_CAP,
        })
      : Promise.resolve([]),
  ]);

  const items = [
    ...clients.map((u) => normalize('CLIENT', u)),
    ...suppliers.map((u) => normalize('SUPPLIER', u)),
    ...employees.map((u) => normalize('EMPLOYEE', u)),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Status tallies for the tab badges — always across every role, ignoring the
  // status filter itself so the tabs do not depend on which one is selected.
  const tallyWhere = q.search || q.role ? { ...where } : {};
  delete (tallyWhere as Record<string, unknown>).approvalStatus;
  const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  await Promise.all(
    (['PENDING', 'APPROVED', 'REJECTED'] as AccountStatus[]).map(async (status) => {
      const w = { ...tallyWhere, approvalStatus: status };
      const [a, b, c] = await Promise.all([
        wanted('CLIENT')
          ? prisma.clientUser.count({ where: w as Prisma.ClientUserWhereInput })
          : 0,
        wanted('SUPPLIER')
          ? prisma.supplierUser.count({ where: w as Prisma.SupplierUserWhereInput })
          : 0,
        wanted('EMPLOYEE')
          ? prisma.employeeUser.count({ where: w as Prisma.EmployeeUserWhereInput })
          : 0,
      ]);
      counts[status] = a + b + c;
    })
  );

  const total = q.status
    ? counts[q.status]
    : counts.PENDING + counts.APPROVED + counts.REJECTED;

  return { items, total, counts };
}

/** All PENDING self-signup requests across the three portals, with client info. */
export async function listPendingAll(): Promise<Account[]> {
  const [clients, suppliers, employees] = await Promise.all([
    prisma.clientUser.findMany({
      where: { approvalStatus: 'PENDING' },
      include: { customer: { select: { clientId: true, companyName: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.supplierUser.findMany({
      where: { approvalStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.employeeUser.findMany({
      where: { approvalStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return [
    ...clients.map((u) => normalize('CLIENT', u)),
    ...suppliers.map((u) => normalize('SUPPLIER', u)),
    ...employees.map((u) => normalize('EMPLOYEE', u)),
  ];
}

export async function pendingCountAll(): Promise<number> {
  const [a, b, c] = await Promise.all([
    prisma.clientUser.count({ where: { approvalStatus: 'PENDING' } }),
    prisma.supplierUser.count({ where: { approvalStatus: 'PENDING' } }),
    prisma.employeeUser.count({ where: { approvalStatus: 'PENDING' } }),
  ]);
  return a + b + c;
}

/** Find a pending account by id in any of the self-signup portals. */
export async function findSignupById(id: string): Promise<Account | null> {
  for (const role of SIGNUP_ROLES) {
    const u = await model(role).findUnique({ where: { id } });
    if (u) return normalize(role, u);
  }
  return null;
}

/**
 * Resolve display names + emails for a batch of (userId, userType) pairs — used
 * by the activity feed which references users polymorphically.
 */
export async function resolveActors(
  refs: Array<{ userId: string; userType: Role | null }>
): Promise<Map<string, { firstName: string; lastName: string; email: string }>> {
  const byRole = new Map<Role, Set<string>>();
  for (const r of refs) {
    if (!r.userType) continue;
    const set = byRole.get(r.userType) ?? new Set<string>();
    set.add(r.userId);
    byRole.set(r.userType, set);
  }
  const out = new Map<string, { firstName: string; lastName: string; email: string }>();
  await Promise.all(
    [...byRole.entries()].map(async ([role, ids]) => {
      const rows = (await model(role).findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, firstName: true, lastName: true, email: true },
      } as Prisma.ClientUserFindManyArgs)) as Array<{
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      }>;
      for (const row of rows) {
        out.set(row.id, { firstName: row.firstName, lastName: row.lastName, email: row.email });
      }
    })
  );
  return out;
}
