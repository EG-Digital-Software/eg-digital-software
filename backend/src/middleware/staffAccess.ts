import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Admin portal tabs an admin can grant to team members through team roles.
 * Team, Approvals and Settings are deliberately absent — they manage logins,
 * passwords and gateway keys, so they stay admin-only.
 */
export const STAFF_TABS = ['dashboard', 'customers', 'tasks', 'billing', 'products', 'payments', 'reports', 'preview'] as const;
export type StaffTab = (typeof STAFF_TABS)[number];

/**
 * Sub-tabs a role grants one by one, each with its own level. A tab listed here
 * is granted through its sections ("customers.agreement"); any other tab is a
 * single key ("billing"). Overview is the way into a customer, so it is always
 * granted with the tab. The Credential sub-tab stays admin-only.
 */
export const STAFF_SECTIONS: Partial<Record<StaffTab, readonly string[]>> = {
  customers: ['overview', 'agreement', 'products', 'invoices', 'task', 'history'],
};

/** Tabs that only ever show data — granted at view level whatever is asked. */
export const VIEW_ONLY_TABS: readonly StaffTab[] = ['dashboard', 'reports', 'preview'];

export type AccessLevel = 'view' | 'edit';
/** Permission key → level, e.g. { billing: 'edit', 'customers.agreement': 'view' }. */
export type AccessMap = Record<string, AccessLevel>;

/** Every valid permission key, in canonical order. */
export const ACCESS_KEYS: string[] = STAFF_TABS.flatMap((t) => {
  const sections = STAFF_SECTIONS[t];
  return sections ? sections.map((s) => `${t}.${s}`) : [t];
});

const tabOf = (key: string) => key.split('.')[0];

/**
 * Normalise a role's access map: known keys only, view-only tabs capped at view,
 * and a sectioned tab always carries its first section (Overview) at least at view.
 */
export function cleanAccess(input: Record<string, unknown>): AccessMap {
  const out: AccessMap = {};
  for (const key of ACCESS_KEYS) {
    const level = input[key];
    if (level !== 'view' && level !== 'edit') continue;
    out[key] = (VIEW_ONLY_TABS as readonly string[]).includes(tabOf(key)) ? 'view' : level;
  }
  for (const [tab, sections] of Object.entries(STAFF_SECTIONS)) {
    const first = `${tab}.${sections![0]}`;
    if (!out[first] && ACCESS_KEYS.some((k) => tabOf(k) === tab && out[k])) out[first] = 'view';
  }
  return out;
}

/** Tabs present in an access map, in canonical order. */
export function accessTabs(access: AccessMap): StaffTab[] {
  return STAFF_TABS.filter((t) => Object.keys(access).some((k) => tabOf(k) === t));
}

/**
 * A role's effective access. Roles saved before view/edit levels existed have no
 * access map — they keep full edit on every tab they grant, as they always had.
 */
export function roleAccess(role: { tabs: string[]; access: unknown }): AccessMap {
  if (role.access && typeof role.access === 'object' && !Array.isArray(role.access)) {
    return cleanAccess(role.access as Record<string, unknown>);
  }
  const all: Record<string, AccessLevel> = {};
  for (const key of ACCESS_KEYS) if (role.tabs.includes(tabOf(key))) all[key] = 'edit';
  return cleanAccess(all);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** A team member acting in an admin section through a granted tab. */
      staff?: boolean;
      /** The team member's merged role access, loaded once per request. */
      staffAccess?: AccessMap;
    }
  }
}

/** Merge of every role the team member holds — edit beats view. */
export async function employeeAccess(employeeId: string): Promise<AccessMap> {
  const links = await prisma.employeeTeamRole.findMany({
    where: { employeeId },
    select: { role: { select: { tabs: true, access: true } } },
  });
  const merged: AccessMap = {};
  for (const { role } of links) {
    for (const [key, level] of Object.entries(roleAccess(role))) {
      if (level === 'edit' || !merged[key]) merged[key] = level;
    }
  }
  return merged;
}

/** Union of the tabs granted by every role the team member holds. */
export async function employeeTabs(employeeId: string): Promise<StaffTab[]> {
  return accessTabs(await employeeAccess(employeeId));
}

/**
 * Level a team member holds for a key. A tab key ("customers") resolves to the
 * best level across its sections; a section key ("customers.task") to its own.
 */
export function levelFor(access: AccessMap, key: string): AccessLevel | null {
  if (key.includes('.')) return access[key] ?? null;
  let best: AccessLevel | null = null;
  for (const [k, level] of Object.entries(access)) {
    if (tabOf(k) !== key) continue;
    if (level === 'edit') return 'edit';
    best = 'view';
  }
  return best;
}

/** True for the admin, or a team member let in through a granted tab. */
export function isAdminLike(req: Request): boolean {
  return req.user?.role === 'SUPER_ADMIN' || req.staff === true;
}

const isRead = (req: Request) => req.method === 'GET' || req.method === 'HEAD';

async function accessOf(req: Request): Promise<AccessMap> {
  if (!req.staffAccess) req.staffAccess = await employeeAccess(req.user!.sub);
  return req.staffAccess;
}

/**
 * Admin-section guard. The admin always passes. A team member passes a read
 * (GET) when any of `keys` or `read` is granted at any level, and a write only
 * when one of `keys` is granted at edit level. A key is a tab ("billing") or a
 * sub-tab ("customers.invoices"). `read` lists extra keys that may only read —
 * e.g. the Billing tab needs the customer list to raise invoices. Roles are read
 * per request so a change takes effect immediately.
 */
export function authorizeTab(keys: string[], read: string[] = []) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(ApiError.unauthorized());
      if (req.user.role === 'SUPER_ADMIN') return next();
      if (req.user.role === 'EMPLOYEE') {
        const access = await accessOf(req);
        const ok = isRead(req)
          ? [...keys, ...read].some((k) => levelFor(access, k))
          : keys.some((k) => levelFor(access, k) === 'edit');
        if (ok) {
          req.staff = true;
          return next();
        }
        if (!isRead(req) && keys.some((k) => levelFor(access, k))) {
          return next(ApiError.forbidden('Your role can only view this section'));
        }
      }
      return next(ApiError.forbidden('You do not have access to this resource'));
    } catch (e) {
      return next(e);
    }
  };
}

/**
 * Narrower guard inside a tab: a team member needs `key` (a sub-tab) itself —
 * any level to read, edit to write. The admin always passes.
 */
export function requireSection(key: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(ApiError.unauthorized());
      if (req.user.role !== 'EMPLOYEE') return next();
      const level = levelFor(await accessOf(req), key);
      if (level === 'edit' || (level && isRead(req))) return next();
      return next(
        ApiError.forbidden(level ? 'Your role can only view this section' : 'You do not have access to this resource')
      );
    } catch (e) {
      return next(e);
    }
  };
}
