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

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** A team member acting in an admin section through a granted tab. */
      staff?: boolean;
    }
  }
}

/** Union of the tabs granted by every role the team member holds. */
export async function employeeTabs(employeeId: string): Promise<StaffTab[]> {
  const links = await prisma.employeeTeamRole.findMany({
    where: { employeeId },
    select: { role: { select: { tabs: true } } },
  });
  const granted = new Set(links.flatMap((l) => l.role.tabs));
  return STAFF_TABS.filter((t) => granted.has(t));
}

/** True for the admin, or a team member let in through a granted tab. */
export function isAdminLike(req: Request): boolean {
  return req.user?.role === 'SUPER_ADMIN' || req.staff === true;
}

/**
 * Admin-section guard. The admin always passes; a team member passes when one
 * of their roles grants any of `tabs`. `read` lists extra tabs that may only
 * read (GET) — e.g. the Billing tab needs the customer list to raise invoices.
 * Roles are read per request so a change takes effect immediately.
 */
export function authorizeTab(tabs: StaffTab[], read: StaffTab[] = []) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(ApiError.unauthorized());
      if (req.user.role === 'SUPER_ADMIN') return next();
      if (req.user.role === 'EMPLOYEE') {
        const allowed = req.method === 'GET' || req.method === 'HEAD' ? [...tabs, ...read] : tabs;
        const granted = await employeeTabs(req.user.sub);
        if (granted.some((t) => allowed.includes(t))) {
          req.staff = true;
          return next();
        }
      }
      return next(ApiError.forbidden('You do not have access to this resource'));
    } catch (e) {
      return next(e);
    }
  };
}
