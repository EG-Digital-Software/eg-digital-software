/**
 * Portal URL scheme. Every portal owns its own auth URLs, prefixed by the portal
 * slug — e.g. /client/login, /admin/login — so nothing overlaps.
 *
 *   URL slug   →  internal role key (used by the auth page config + API portal)
 *   admin      →  super-admin  (SUPER_ADMIN)
 *   client     →  client       (CLIENT)
 *   supplier   →  supplier     (SUPPLIER)
 *   employee   →  employee     (EMPLOYEE)
 */
export type PortalSlug = 'admin' | 'client' | 'supplier' | 'employee';
export type RoleKey = 'super-admin' | 'client' | 'supplier' | 'employee';
export type PortalRole = 'SUPER_ADMIN' | 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE';

export const PORTALS: PortalSlug[] = ['admin', 'client', 'supplier', 'employee'];

export const PORTAL_ROLEKEY: Record<PortalSlug, RoleKey> = {
  admin: 'super-admin',
  client: 'client',
  supplier: 'supplier',
  employee: 'employee',
};

export const PORTAL_ROLE: Record<PortalSlug, PortalRole> = {
  admin: 'SUPER_ADMIN',
  client: 'CLIENT',
  supplier: 'SUPPLIER',
  employee: 'EMPLOYEE',
};

/** Reverse: role key → portal slug (for building URLs from a session role). */
export const ROLEKEY_PORTAL: Record<RoleKey, PortalSlug> = {
  'super-admin': 'admin',
  client: 'client',
  supplier: 'supplier',
  employee: 'employee',
};

/** Coerce a URL param to a valid portal slug (defaults to admin). */
export function toPortal(param?: string): PortalSlug {
  return param && param in PORTAL_ROLEKEY ? (param as PortalSlug) : 'admin';
}

/** Dashboard home per role (used after login). */
export const ROLE_HOME: Record<PortalRole, string> = {
  SUPER_ADMIN: '/admin/dashboard',
  CLIENT: '/client/dashboard',
  SUPPLIER: '/supplier/dashboard',
  EMPLOYEE: '/employee/dashboard',
};

export const authPaths = {
  login: (p: PortalSlug) => `/${p}/login`,
  register: (p: PortalSlug) => `/${p}/register`,
  forgot: (p: PortalSlug) => `/${p}/forgot-password`,
  reset: (p: PortalSlug) => `/${p}/reset-password`,
};
