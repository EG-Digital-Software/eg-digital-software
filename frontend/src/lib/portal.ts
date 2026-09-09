/**
 * Portal URL scheme. Every portal owns its own auth URLs, prefixed by the portal
 * slug — e.g. /client/login, /admin/login — so nothing overlaps.
 *
 *   URL slug   →  internal role key (used by the auth page config + API portal)
 *   admin      →  super-admin  (SUPER_ADMIN)
 *   client     →  client       (CLIENT)
 *   employee   →  employee     (EMPLOYEE)
 */
export type PortalSlug = 'admin' | 'client' | 'employee';
export type RoleKey = 'super-admin' | 'client' | 'employee';
export type PortalRole = 'SUPER_ADMIN' | 'CLIENT' | 'EMPLOYEE';

export const PORTALS: PortalSlug[] = ['admin', 'client', 'employee'];

export const PORTAL_ROLEKEY: Record<PortalSlug, RoleKey> = {
  admin: 'super-admin',
  client: 'client',
  employee: 'employee',
};

export const PORTAL_ROLE: Record<PortalSlug, PortalRole> = {
  admin: 'SUPER_ADMIN',
  client: 'CLIENT',
  employee: 'EMPLOYEE',
};

/** Reverse: role key → portal slug (for building URLs from a session role). */
export const ROLEKEY_PORTAL: Record<RoleKey, PortalSlug> = {
  'super-admin': 'admin',
  client: 'client',
  employee: 'employee',
};

/** Coerce a URL param to a valid portal slug (defaults to admin). */
export function toPortal(param?: string): PortalSlug {
  return param && param in PORTAL_ROLEKEY ? (param as PortalSlug) : 'admin';
}

/** Dashboard home per role (used after login). Keyed loosely so a legacy role
 *  the backend may still return simply falls through to the default. */
export const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: '/admin/dashboard',
  CLIENT: '/client/dashboard',
  EMPLOYEE: '/employee/tasks',
};

export const authPaths = {
  login: (p: PortalSlug) => `/${p}/login`,
  register: (p: PortalSlug) => `/${p}/register`,
  forgot: (p: PortalSlug) => `/${p}/forgot-password`,
  reset: (p: PortalSlug) => `/${p}/reset-password`,
};
