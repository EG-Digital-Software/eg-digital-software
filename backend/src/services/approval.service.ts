import argon2 from 'argon2';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { encryptSecret, decryptSecret } from '../utils/secretBox.js';
import { publicUser } from './auth.service.js';
import { sendAccountApproved, sendAccountRejected } from './email/templates.js';
import { notify } from './notification.service.js';
import * as accounts from './accounts.js';

const ROLE_HOME: Record<string, string> = {
  CLIENT: '/client/dashboard',
  SUPPLIER: '/supplier/dashboard',
  EMPLOYEE: '/employee/dashboard',
};

const strip = (u: accounts.Account) => {
  // Never expose the auth hash or the reversible reveal copy in list responses.
  const { passwordHash: _pw, passwordEnc: _enc, ...rest } = u as accounts.Account & {
    passwordEnc?: string | null;
  };
  void _pw;
  void _enc;
  return rest;
};

export async function listPending() {
  const users = await accounts.listPendingAll();
  return users.map(strip);
}

/**
 * Registration requests with history. Approvals used to show only PENDING rows,
 * so once a request was actioned it disappeared — there was no record of who
 * was approved or rejected, and no way to correct a mistake.
 */
export async function listRequests(params: {
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  role?: 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE';
  search?: string;
  skip: number;
  take: number;
}) {
  const { items, total, counts } = await accounts.listRegistrations({
    status: params.status,
    role: params.role,
    search: params.search,
  });
  return {
    items: items.slice(params.skip, params.skip + params.take).map(strip),
    total,
    counts,
  };
}

export async function pendingCount() {
  return accounts.pendingCountAll();
}

export async function approve(userId: string, approverId: string) {
  const account = await accounts.findSignupById(userId);
  if (!account) throw ApiError.notFound('Request not found');
  // A rejection can be reversed — rejecting by mistake used to be permanent.
  if (account.approvalStatus === 'APPROVED') {
    throw ApiError.badRequest('This account is already approved');
  }
  const updated = await accounts.updateAccount(account.role, userId, {
    approvalStatus: 'APPROVED',
    isActive: true,
    approvedById: approverId,
  });
  sendAccountApproved({ email: updated.email, firstName: updated.firstName, role: updated.role });
  notify({
    userId: updated.id,
    userType: updated.role,
    type: 'account',
    title: 'Account approved',
    body: 'Your account has been approved — welcome to EG Digital!',
    link: ROLE_HOME[updated.role] ?? '/',
  });
  return publicUser(updated);
}

/**
 * Rejects a pending request, or revokes an already-approved account. Revoking
 * deactivates the login immediately; there was previously no way to withdraw
 * access once granted.
 */
export async function reject(userId: string, approverId: string) {
  const account = await accounts.findSignupById(userId);
  if (!account) throw ApiError.notFound('Request not found');
  if (account.approvalStatus === 'REJECTED') {
    throw ApiError.badRequest('This request is already rejected');
  }
  const updated = await accounts.updateAccount(account.role, userId, {
    approvalStatus: 'REJECTED',
    isActive: false,
    approvedById: approverId,
  });
  sendAccountRejected({ email: updated.email, firstName: updated.firstName, role: updated.role });
  return publicUser(updated);
}

// ── Admin-provisioned team (EMPLOYEE) accounts ───────────────────────────────
// An admin creates these directly from the Approvals page: APPROVED immediately,
// and — like admin-provisioned client logins — a reversible AES copy of the
// password is stored so the admin can reveal and reset it later. Login always
// uses the argon2 hash; the reversible copy is view-only and needs
// CREDENTIAL_ENC_KEY configured.

// Fields safe to return to the admin (never the hash or the encrypted copy).
const EMPLOYEE_PUBLIC = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  designation: true,
  approvalStatus: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createEmployee(
  input: { firstName: string; lastName?: string; email: string; designation?: string; password: string },
  approverId: string
) {
  const firstName = input.firstName.trim();
  const lastName = (input.lastName ?? '').trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();
  const designation = input.designation?.trim() || null;

  if (!firstName) throw ApiError.badRequest('First name is required');
  if (!email) throw ApiError.badRequest('A login email is required');
  if (password.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');
  if (await accounts.emailExistsAnywhere(email)) {
    throw ApiError.badRequest('That login email is already in use by another account');
  }

  return prisma.employeeUser.create({
    data: {
      firstName,
      lastName,
      email,
      designation,
      passwordHash: await argon2.hash(password),
      passwordEnc: encryptSecret(password),
      approvalStatus: 'APPROVED',
      isActive: true,
      approvedById: approverId,
    },
    select: EMPLOYEE_PUBLIC,
  });
}

/**
 * Reveal a team member's current password. Returns available=false when no
 * reveal copy exists (self-registered, or set before encryption was configured);
 * the admin can still reset it.
 */
export async function revealEmployeePassword(id: string) {
  const emp = await prisma.employeeUser.findUnique({
    where: { id },
    select: { email: true, passwordEnc: true },
  });
  if (!emp) throw ApiError.notFound('Team member not found');
  const password = decryptSecret(emp.passwordEnc);
  return { email: emp.email, password, available: password !== null };
}

/** Reset a team member's password (admin only): updates the argon2 hash used to
 *  authenticate and the reversible copy the admin can later reveal. */
export async function changeEmployeePassword(id: string, password?: string) {
  const emp = await prisma.employeeUser.findUnique({ where: { id }, select: { id: true } });
  if (!emp) throw ApiError.notFound('Team member not found');
  const pw = password?.trim() || '';
  if (pw.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');
  await prisma.employeeUser.update({
    where: { id },
    data: { passwordHash: await argon2.hash(pw), passwordEnc: encryptSecret(pw) },
  });
  return { id };
}
