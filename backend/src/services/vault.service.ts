import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { decryptSecret, encryptSecret } from '../utils/secretBox.js';
import { getPin } from './accessPoint.service.js';

/**
 * Password vault shared by the three portals.
 *
 *  - Admin: every login — Eloma Group's own (customerId null) and every client's.
 *  - Team member: Eloma Group logins shared with them (whole team, or picked by
 *    name / team role), plus the logins of clients they work on (account
 *    manager, or assigned to one of the client's tasks). They can add and edit
 *    their clients' logins; Eloma Group logins are view-only for them.
 *  - Client: only their own company's logins, which they manage.
 *
 * The vault opens with the user's Access Point PIN and hands back a key that
 * lapses after 10 minutes without use. Every unlock, reveal, copy and change is
 * written to VaultLog (never the secret itself).
 */

export const VAULT_KEY_HEADER = 'x-vault-key';
const UNLOCK_TTL_SEC = 10 * 60;
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60_000;
export const ROTATION_DAYS = 90;

export const FOLDERS = ['Software', 'Hosting & domains', 'Suppliers', 'Social media', 'Other'] as const;
/** No longer offered; still accepted so a login already filed there can be saved. */
export const RETIRED_FOLDERS = ['Banking & finance'] as const;
export const TWO_FACTOR = ['Off', 'Authenticator app', 'SMS', 'Email', 'Security key'] as const;
export const ACCESS = ['ADMINS', 'TEAM', 'PICK'] as const;

const keySecret = crypto.createHmac('sha256', env.JWT_SECRET).update('vault-unlock').digest();
const fpSecret = crypto.createHmac('sha256', env.JWT_SECRET).update('vault-fingerprint').digest();

export interface Actor {
  id: string;
  type: Role;
  name: string;
  /** Client logins: their company. */
  customerId?: string | null;
}

export type VaultAction =
  | 'UNLOCKED'
  | 'PIN_FAILED'
  | 'REVEALED'
  | 'COPIED'
  | 'ADDED'
  | 'EDITED'
  | 'ROTATED'
  | 'DELETED'
  | 'SECURITY_CHECK';

/* ─── unlock ──────────────────────────────────────────────── */

function signKey(actor: Actor) {
  return jwt.sign({ sub: actor.id, role: actor.type, v: 1 }, keySecret, { expiresIn: UNLOCK_TTL_SEC });
}

export async function unlock(actor: Actor, pin: string) {
  const fails = await prisma.vaultLog.count({
    where: { userId: actor.id, action: 'PIN_FAILED', createdAt: { gte: new Date(Date.now() - FAIL_WINDOW_MS) } },
  });
  if (fails >= MAX_FAILS) throw new ApiError(429, 'Too many wrong PINs — please wait 15 minutes and try again');
  const mine = await getPin(actor.id, actor.type);
  const given = Buffer.from(String(pin ?? '').trim());
  const expected = Buffer.from(mine);
  const okPin = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!okPin) {
    await log(actor, 'PIN_FAILED', null);
    const left = MAX_FAILS - fails - 1;
    throw ApiError.badRequest(left > 0 ? `Wrong PIN — ${left} attempt${left === 1 ? '' : 's'} left` : 'Wrong PIN');
  }
  await log(actor, 'UNLOCKED', null);
  return { key: signKey(actor), ttlSeconds: UNLOCK_TTL_SEC };
}

/** Throw unless `key` is a live unlock by this user. */
export function assertUnlocked(actor: Actor, key: unknown) {
  try {
    if (typeof key !== 'string' || !key) throw new Error('missing');
    const p = jwt.verify(key, keySecret) as { sub: string; role: Role };
    if (p.sub === actor.id && p.role === actor.type) return;
  } catch {
    /* fall through */
  }
  throw new ApiError(423, 'Vault is locked — enter your PIN to open it');
}

/** A fresh 10-minute key for a user who is still active in the vault. */
export function touch(actor: Actor) {
  return { key: signKey(actor), ttlSeconds: UNLOCK_TTL_SEC };
}

/* ─── scope ───────────────────────────────────────────────── */

/** Customers a team member works on: account manager, or assigned to one of their tasks. */
async function employeeCustomerIds(employeeId: string): Promise<string[]> {
  const [managed, tasks] = await Promise.all([
    prisma.customer.findMany({ where: { accountManagerId: employeeId }, select: { id: true } }),
    prisma.task.findMany({
      where: { assignees: { some: { userId: employeeId, userType: Role.EMPLOYEE } } },
      select: { customerId: true },
      distinct: ['customerId'],
    }),
  ]);
  return [...new Set([...managed.map((c) => c.id), ...tasks.map((t) => t.customerId)])];
}

async function employeeRoleIds(employeeId: string): Promise<string[]> {
  const rows = await prisma.employeeTeamRole.findMany({ where: { employeeId }, select: { roleId: true } });
  return rows.map((r) => r.roleId);
}

interface Scope {
  /** Entries this user can see. */
  where: Prisma.VaultEntryWhereInput;
  /** Customers whose logins this user may add / edit (null = any, admin). */
  editableCustomers: string[] | null;
  /** May add / edit Eloma Group's own logins. */
  companyEdit: boolean;
  /** May delete. */
  canDelete: boolean;
}

async function scopeFor(actor: Actor): Promise<Scope> {
  if (actor.type === Role.SUPER_ADMIN) {
    return { where: {}, editableCustomers: null, companyEdit: true, canDelete: true };
  }
  if (actor.type === Role.CLIENT) {
    if (!actor.customerId) throw ApiError.forbidden('No customer is linked to this account');
    return {
      where: { customerId: actor.customerId },
      editableCustomers: [actor.customerId],
      companyEdit: false,
      canDelete: true,
    };
  }
  if (actor.type === Role.EMPLOYEE) {
    const [customers, roles] = await Promise.all([employeeCustomerIds(actor.id), employeeRoleIds(actor.id)]);
    const company: Prisma.VaultEntryWhereInput = {
      customerId: null,
      OR: [
        { access: 'TEAM' },
        { access: 'PICK', accessEmployeeIds: { has: actor.id } },
        ...(roles.length ? [{ access: 'PICK', accessRoleIds: { hasSome: roles } }] : []),
      ],
    };
    return {
      where: { OR: [company, ...(customers.length ? [{ customerId: { in: customers } }] : [])] },
      editableCustomers: customers,
      companyEdit: false,
      canDelete: false,
    };
  }
  throw ApiError.forbidden('The vault is not available in this portal');
}

async function findVisible(actor: Actor, id: string) {
  const scope = await scopeFor(actor);
  const entry = await prisma.vaultEntry.findFirst({ where: { AND: [{ id }, scope.where] } });
  if (!entry) throw ApiError.notFound('Login not found');
  return { entry, scope };
}

function canEdit(scope: Scope, customerId: string | null) {
  if (customerId === null) return scope.companyEdit;
  return scope.editableCustomers === null || scope.editableCustomers.includes(customerId);
}

/* ─── helpers ─────────────────────────────────────────────── */

export function scoreStrength(pw: string): 'STRONG' | 'FAIR' | 'WEAK' {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const common = /^(password|passw0rd|123456|qwerty|letmein|welcome|admin|demo)/i.test(pw);
  if (common || pw.length < 8 || classes < 2) return 'WEAK';
  if (pw.length >= 12 && classes >= 3) return 'STRONG';
  return 'FAIR';
}

const fingerprint = (pw: string) => crypto.createHmac('sha256', fpSecret).update(pw).digest('hex');

function encrypt(plain: string) {
  const enc = encryptSecret(plain);
  if (!enc) throw ApiError.internal('Vault encryption is not set up on the server (CREDENTIAL_ENC_KEY)');
  return enc;
}

function log(actor: Actor, action: VaultAction, entry: { id: string; name: string; customerId: string | null } | null) {
  return prisma.vaultLog.create({
    data: {
      entryId: entry?.id ?? null,
      entryName: entry?.name ?? null,
      customerId: entry ? entry.customerId : actor.type === Role.CLIENT ? actor.customerId ?? null : null,
      userId: actor.id,
      userType: actor.type,
      userName: actor.name,
      action,
    },
  });
}

/* ─── read ────────────────────────────────────────────────── */

export async function list(actor: Actor) {
  const scope = await scopeFor(actor);
  const entries = await prisma.vaultEntry.findMany({
    where: scope.where,
    orderBy: [{ name: 'asc' }],
    include: { customer: { select: { id: true, clientId: true, companyName: true, tradingAs: true } } },
  });

  // Reused = same password fingerprint as another login this user can see.
  const fpCount = new Map<string, number>();
  for (const e of entries) fpCount.set(e.passwordFp, (fpCount.get(e.passwordFp) ?? 0) + 1);
  const rotateBefore = Date.now() - ROTATION_DAYS * 86_400_000;

  const items = entries.map((e) => ({
    id: e.id,
    customerId: e.customerId,
    customer: e.customer
      ? { id: e.customer.id, clientId: e.customer.clientId, name: e.customer.tradingAs?.trim() || e.customer.companyName || e.customer.clientId }
      : null,
    name: e.name,
    url: e.url,
    username: e.username,
    folder: e.folder,
    strength: e.strength,
    reused: (fpCount.get(e.passwordFp) ?? 0) > 1,
    rotationDue: e.passwordChangedAt.getTime() < rotateBefore,
    twoFactor: e.twoFactor,
    access: e.access,
    accessEmployeeIds: e.accessEmployeeIds,
    accessRoleIds: e.accessRoleIds,
    ownerName: e.ownerName,
    passwordChangedAt: e.passwordChangedAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    canEdit: canEdit(scope, e.customerId),
    canDelete: scope.canDelete && canEdit(scope, e.customerId),
  }));

  return {
    items,
    permissions: {
      companyEdit: scope.companyEdit,
      editableCustomers: scope.editableCustomers,
      canDelete: scope.canDelete,
    },
  };
}

/** Customers the user can pick when adding a login, plus (admin) people and roles for sharing. */
export async function meta(actor: Actor) {
  const scope = await scopeFor(actor);
  const customerWhere: Prisma.CustomerWhereInput =
    scope.editableCustomers === null ? {} : { id: { in: scope.editableCustomers } };
  const [customers, employees, roles] = await Promise.all([
    prisma.customer.findMany({
      where: customerWhere,
      select: { id: true, clientId: true, companyName: true, tradingAs: true },
      orderBy: { companyName: 'asc' },
    }),
    actor.type === Role.SUPER_ADMIN
      ? prisma.employeeUser.findMany({
          where: { isActive: true, approvalStatus: 'APPROVED' },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { firstName: 'asc' },
        })
      : Promise.resolve([]),
    actor.type === Role.SUPER_ADMIN
      ? prisma.teamRole.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
  ]);
  return {
    folders: FOLDERS,
    twoFactor: TWO_FACTOR,
    customers: customers.map((c) => ({
      id: c.id,
      clientId: c.clientId,
      name: c.tradingAs?.trim() || c.companyName || c.clientId,
    })),
    employees: employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() })),
    roles,
  };
}

/** Decrypt one login's password (and notes) — logged as a reveal or a copy. */
export async function reveal(actor: Actor, id: string, kind: 'REVEALED' | 'COPIED') {
  const { entry } = await findVisible(actor, id);
  const password = decryptSecret(entry.passwordEnc);
  if (password === null) throw ApiError.internal('This password could not be decrypted');
  await log(actor, kind, entry);
  return { password, notes: entry.notesEnc ? decryptSecret(entry.notesEnc) : null };
}

export async function logs(actor: Actor, entryId?: string) {
  const scope = await scopeFor(actor);
  let where: Prisma.VaultLogWhereInput;
  if (entryId) {
    await findVisible(actor, entryId);
    where = { entryId };
  } else if (actor.type === Role.SUPER_ADMIN) {
    where = {};
  } else if (actor.type === Role.CLIENT) {
    where = { customerId: actor.customerId };
  } else {
    const visible = await prisma.vaultEntry.findMany({ where: scope.where, select: { id: true } });
    where = { OR: [{ entryId: { in: visible.map((v) => v.id) } }, { userId: actor.id, userType: actor.type }] };
  }
  const rows = await prisma.vaultLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  return rows.map((r) => ({
    id: r.id,
    entryId: r.entryId,
    entryName: r.entryName,
    userName: r.userName,
    userType: r.userType,
    action: r.action,
    createdAt: r.createdAt,
  }));
}

/* ─── write ───────────────────────────────────────────────── */

export interface EntryInput {
  customerId?: string | null;
  name: string;
  url?: string | null;
  username?: string | null;
  password?: string;
  folder: string;
  notes?: string | null;
  twoFactor?: string;
  access?: string;
  accessEmployeeIds?: string[];
  accessRoleIds?: string[];
}

function accessFields(input: EntryInput, customerId: string | null) {
  // Client logins are shared by the client relationship, not an access list.
  if (customerId) return { access: 'ADMINS', accessEmployeeIds: [], accessRoleIds: [] };
  const access = input.access ?? 'ADMINS';
  return {
    access,
    accessEmployeeIds: access === 'PICK' ? [...new Set(input.accessEmployeeIds ?? [])] : [],
    accessRoleIds: access === 'PICK' ? [...new Set(input.accessRoleIds ?? [])] : [],
  };
}

export async function create(actor: Actor, input: EntryInput) {
  const scope = await scopeFor(actor);
  const customerId = actor.type === Role.CLIENT ? actor.customerId! : input.customerId || null;
  if (!canEdit(scope, customerId)) throw ApiError.forbidden('You cannot add logins here');
  if (!input.password) throw ApiError.badRequest('Password is required');
  const entry = await prisma.vaultEntry.create({
    data: {
      customerId,
      name: input.name.trim(),
      url: input.url?.trim() || null,
      username: input.username?.trim() || null,
      passwordEnc: encrypt(input.password),
      passwordFp: fingerprint(input.password),
      strength: scoreStrength(input.password),
      folder: input.folder,
      notesEnc: input.notes?.trim() ? encrypt(input.notes.trim()) : null,
      twoFactor: input.twoFactor ?? 'Off',
      ...accessFields(input, customerId),
      ownerName: actor.name,
      createdById: actor.id,
      createdByType: actor.type,
    },
  });
  await log(actor, 'ADDED', entry);
  return { id: entry.id };
}

/** Update only the fields that were sent; a new password counts as a rotation. */
export async function update(actor: Actor, id: string, input: Partial<EntryInput>) {
  const { entry, scope } = await findVisible(actor, id);
  if (!canEdit(scope, entry.customerId)) throw ApiError.forbidden('You cannot edit this login');
  const data: Prisma.VaultEntryUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.url !== undefined) data.url = input.url?.trim() || null;
  if (input.username !== undefined) data.username = input.username?.trim() || null;
  if (input.folder !== undefined) data.folder = input.folder;
  if (input.twoFactor !== undefined) data.twoFactor = input.twoFactor;
  if (input.notes !== undefined) data.notesEnc = input.notes?.trim() ? encrypt(input.notes.trim()) : null;
  if (!entry.customerId && input.access !== undefined) Object.assign(data, accessFields(input as EntryInput, null));
  const rotated = !!input.password && fingerprint(input.password) !== entry.passwordFp;
  if (rotated) {
    data.passwordEnc = encrypt(input.password!);
    data.passwordFp = fingerprint(input.password!);
    data.strength = scoreStrength(input.password!);
    data.passwordChangedAt = new Date();
  }
  const saved = await prisma.vaultEntry.update({ where: { id }, data });
  await log(actor, rotated ? 'ROTATED' : 'EDITED', saved);
  return { id };
}

export async function remove(actor: Actor, id: string) {
  const { entry, scope } = await findVisible(actor, id);
  if (!scope.canDelete || !canEdit(scope, entry.customerId)) throw ApiError.forbidden('You cannot delete this login');
  await log(actor, 'DELETED', entry);
  await prisma.vaultEntry.delete({ where: { id } });
  return { id };
}

/* ─── security check ──────────────────────────────────────── */

const UA = 'EG-Vault-Security-Check';
const BREACH_API = 'https://api.xposedornot.com/v1/breach-analytics';
const PWNED_RANGE_API = 'https://api.pwnedpasswords.com/range/';

export interface BreachInfo {
  name: string;
  domain: string | null;
  logo: string | null;
  description: string | null;
  industry: string | null;
  date: string | null;
  records: number | null;
  dataClasses: string[];
  verified: boolean;
  passwordRisk: string | null;
  reference: string | null;
  added: string | null;
}

/**
 * Breaches an email address appears in, from XposedOrNot (free, no key) —
 * the same kind of data Have I Been Pwned shows.
 */
async function emailBreaches(email: string) {
  let res: Response;
  try {
    res = await fetch(`${BREACH_API}?email=${encodeURIComponent(email)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError(502, 'The breach lookup service did not respond — please try again');
  }
  if (res.status === 429) throw new ApiError(429, 'Too many checks right now — please wait a minute and try again');
  if (res.status === 404) return { breaches: [] as BreachInfo[], pastes: 0, risk: null };
  if (!res.ok) throw new ApiError(502, 'The breach lookup service is unavailable — please try again');
  const j = (await res.json().catch(() => null)) as {
    ExposedBreaches?: { breaches_details?: Record<string, unknown>[] } | null;
    PastesSummary?: { cnt?: number } | null;
    BreachMetrics?: { risk?: { risk_label?: string; risk_score?: number }[] } | null;
  } | null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const breaches: BreachInfo[] = (j?.ExposedBreaches?.breaches_details ?? []).map((b) => ({
    name: str(b.breach) ?? 'Unknown breach',
    domain: str(b.domain),
    logo: str(b.logo),
    description: str(b.details),
    industry: str(b.industry),
    date: str(b.xposed_date) ?? (b.xposed_date != null ? String(b.xposed_date) : null),
    records: typeof b.xposed_records === 'number' ? b.xposed_records : Number(b.xposed_records) || null,
    dataClasses: (str(b.xposed_data) ?? '').split(';').map((s) => s.trim()).filter(Boolean),
    verified: b.verified === 'Yes',
    passwordRisk: str(b.password_risk),
    reference: str(b.references),
    added: str(b.added),
  }));
  // Newest first, like Have I Been Pwned.
  breaches.sort((a, b) => (b.added ?? b.date ?? '').localeCompare(a.added ?? a.date ?? ''));
  const risk = j?.BreachMetrics?.risk?.[0];
  return {
    breaches,
    pastes: Number(j?.PastesSummary?.cnt) || 0,
    risk: risk?.risk_label ? { label: risk.risk_label, score: Number(risk.risk_score) || 0 } : null,
  };
}

/**
 * How often a password appears in known leaks (Have I Been Pwned's free Pwned
 * Passwords range API). Only the first 5 characters of its SHA-1 hash leave
 * the server — never the password.
 */
async function pwnedCounts(passwords: string[]): Promise<(number | null)[]> {
  const ranges = new Map<string, Promise<Map<string, number> | null>>();
  const range = (prefix: string) => {
    if (!ranges.has(prefix)) {
      ranges.set(
        prefix,
        fetch(PWNED_RANGE_API + prefix, {
          headers: { 'User-Agent': UA, 'Add-Padding': 'true' },
          signal: AbortSignal.timeout(15_000),
        })
          .then(async (r) => {
            if (!r.ok) return null;
            const m = new Map<string, number>();
            for (const line of (await r.text()).split('\n')) {
              const [suffix, count] = line.trim().split(':');
              if (suffix && count) m.set(suffix.toUpperCase(), Number(count));
            }
            return m;
          })
          .catch(() => null)
      );
    }
    return ranges.get(prefix)!;
  };
  return Promise.all(
    passwords.map(async (pw) => {
      const sha = crypto.createHash('sha1').update(pw, 'utf8').digest('hex').toUpperCase();
      const m = await range(sha.slice(0, 5));
      return m ? (m.get(sha.slice(5)) ?? 0) : null;
    })
  );
}

export async function securityCheck(actor: Actor, email: string) {
  const scope = await scopeFor(actor);
  const entries = await prisma.vaultEntry.findMany({
    where: scope.where,
    select: { id: true, name: true, passwordEnc: true, customerId: true },
    orderBy: { name: 'asc' },
  });
  const plain = entries.map((e) => decryptSecret(e.passwordEnc));
  const [emailResult, counts] = await Promise.all([
    emailBreaches(email),
    pwnedCounts(plain.map((p) => p ?? '')),
  ]);
  await log(actor, 'SECURITY_CHECK', null);
  return {
    email,
    checkedAt: new Date().toISOString(),
    ...emailResult,
    passwords: entries.map((e, i) => ({
      entryId: e.id,
      name: e.name,
      // null = could not be checked (lookup failed or password unreadable).
      pwnedCount: plain[i] === null ? null : counts[i],
    })),
  };
}
