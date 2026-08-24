import argon2 from 'argon2';
import crypto from 'node:crypto';
import type { Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  durationToMs,
} from '../utils/tokens.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { storage } from './storage/index.js';
import { notifySuperAdmins } from './notification.service.js';
import * as accounts from './accounts.js';
import type { Account } from './accounts.js';

const AVATAR_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function hashPassword(password: string) {
  return argon2.hash(password);
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

/** Strip the password hash; the `role` is already synthesized onto Account. */
export function publicUser(account: Account) {
  const { passwordHash: _pw, ...rest } = account;
  void _pw;
  return rest;
}

async function issueTokens(account: Account) {
  const accessToken = signAccessToken({
    sub: account.id,
    role: account.role,
    email: account.email,
  });
  const refreshToken = signRefreshToken(account.id, account.role);
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: account.id,
      userType: account.role,
      expiresAt: new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES)),
    },
  });
  return { accessToken, refreshToken };
}

type RegisterRole = 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE';

/**
 * Self-registration for Client, Supplier and Employee portals. Each portal has
 * its own accounts table, but an email may exist in AT MOST ONE table across
 * the whole platform (checked here). Every request starts PENDING and cannot
 * log in until a Super Admin approves it. Client requests must additionally
 * match an existing Customer (by Client ID + email) and are linked to it.
 */
export async function registerUser(input: {
  role: RegisterRole;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  clientId?: string;
  avatar?: { buffer: Buffer; mimetype: string };
}) {
  const email = input.email.toLowerCase();

  // Global uniqueness — no overlap across any of the four portals.
  if (await accounts.emailExistsAnywhere(email)) {
    throw ApiError.conflict('An account with this email already exists');
  }

  let customerId: string | undefined;
  let firstName = input.firstName;
  let lastName = input.lastName;

  if (input.role === 'CLIENT') {
    if (!input.clientId) throw ApiError.badRequest('Client ID is required');
    const customer = await prisma.customer.findUnique({ where: { clientId: input.clientId } });
    if (!customer) throw ApiError.badRequest('No customer found for that Client ID');
    const matches = [customer.contactEmail, customer.billingEmail]
      .filter(Boolean)
      .map((e) => e!.toLowerCase());
    if (!matches.includes(email)) {
      throw ApiError.badRequest('Email does not match our records for this Client ID');
    }
    customerId = customer.id;
    // The customer record no longer carries a personal name — keep the name the
    // registrant entered on the sign-up form.
  }

  let avatarUrl: string | undefined;
  if (input.avatar && AVATAR_EXT[input.avatar.mimetype]) {
    const ext = AVATAR_EXT[input.avatar.mimetype];
    avatarUrl = await storage.save(
      `avatars/reg-${Date.now()}.${ext}`,
      input.avatar.buffer,
      input.avatar.mimetype
    );
  }

  const account = await accounts.createAccount(input.role, {
    firstName,
    lastName,
    email,
    passwordHash: await hashPassword(input.password),
    approvalStatus: 'PENDING',
    avatarUrl,
    ...(input.role === 'CLIENT' ? { customerId } : {}),
  });

  const roleLabel = { CLIENT: 'Client', SUPPLIER: 'Supplier', EMPLOYEE: 'Employee' }[input.role];
  notifySuperAdmins({
    type: 'registration',
    title: `New ${roleLabel} registration`,
    body: `${firstName} ${lastName} (${email}) is awaiting approval`,
    link: '/admin/approvals',
    entityType: 'User',
    entityId: account.id,
  });

  return publicUser(account);
}

/**
 * Sign in. When `portal` is supplied (from a portal-specific login page) the
 * lookup is scoped to that portal's table — a Supplier can never sign in on the
 * Client page, and vice-versa. Without a portal (e.g. Super Admin login) the
 * email is resolved across tables (still unique platform-wide).
 */
export async function login(email: string, password: string, portal?: Role) {
  const account = portal
    ? await accounts.findByEmailForRole(portal, email)
    : await accounts.findByEmailAnywhere(email);

  if (!account || !account.isActive) throw ApiError.unauthorized('Invalid email or password');

  const valid = await verifyPassword(account.passwordHash, password);
  if (!valid) throw ApiError.unauthorized('Invalid email or password');

  if (account.approvalStatus === 'PENDING') {
    throw ApiError.forbidden('Your account is awaiting Admin approval');
  }
  if (account.approvalStatus === 'REJECTED') {
    throw ApiError.forbidden('Your account request was declined. Please contact EG Digital.');
  }

  const updated = await accounts.updateAccount(account.role, account.id, {
    lastLoginAt: new Date(),
  });
  const tokens = await issueTokens(updated);
  return { user: publicUser(updated), ...tokens };
}

export async function refresh(refreshToken: string) {
  let payload: { sub: string; role: Role };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid refresh token');
  }
  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Refresh token expired or revoked');
  }
  const account = await accounts.findById(payload.role, payload.sub);
  if (!account || !account.isActive) throw ApiError.unauthorized('User not found');

  // Rotate: revoke the used token, issue a fresh pair.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  const tokens = await issueTokens(account);
  return { user: publicUser(account), ...tokens };
}

export async function logout(refreshToken?: string) {
  if (!refreshToken) return;
  await prisma.refreshToken
    .updateMany({ where: { token: refreshToken }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

export async function me(role: Role, userId: string) {
  const account = await accounts.findById(role, userId);
  if (!account) throw ApiError.notFound('User not found');
  return publicUser(account);
}

export async function setAvatar(role: Role, userId: string, avatarUrl: string | null) {
  const account = await accounts.updateAccount(role, userId, { avatarUrl });
  return publicUser(account);
}

/**
 * Update the signed-in user's own name and email.
 *
 * Email must stay unique across all four portal tables — the same rule
 * registration enforces — so a change is rejected if the address already
 * belongs to any other account.
 */
export async function updateProfile(
  role: Role,
  userId: string,
  input: { firstName?: string; lastName?: string; email?: string }
) {
  const account = await accounts.findById(role, userId);
  if (!account) throw ApiError.notFound('User not found');

  const email = input.email?.trim().toLowerCase();
  if (email && email !== account.email) {
    const owner = await accounts.findByEmailAnywhere(email);
    if (owner && owner.id !== userId) {
      throw ApiError.conflict('That email address is already in use');
    }
  }

  const updated = await accounts.updateAccount(role, userId, {
    ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
    ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
    ...(email ? { email } : {}),
  });
  return publicUser(updated);
}

/**
 * Change the password, sign every *other* device out, and hand this device a
 * fresh token pair.
 *
 * Revoking every refresh token (including the caller's own) used to log the
 * user out of the session they were sitting in — silently, whenever the access
 * token next expired.
 */
export async function changePassword(role: Role, userId: string, current: string, next: string) {
  const account = await accounts.findById(role, userId);
  if (!account) throw ApiError.notFound('User not found');
  const valid = await verifyPassword(account.passwordHash, current);
  if (!valid) throw ApiError.badRequest('Current password is incorrect');
  if (await verifyPassword(account.passwordHash, next)) {
    throw ApiError.badRequest('New password must be different from the current one');
  }

  const updated = await accounts.updateAccount(role, userId, {
    passwordHash: await hashPassword(next),
  });

  // Everything issued before this moment is dead.
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId, userType: role, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // …then re-establish just this session.
  const tokens = await issueTokens(updated);
  return {
    ...tokens,
    user: publicUser(updated),
    /** Other sessions that were signed out (this one is excluded). */
    sessionsRevoked: Math.max(count - 1, 0),
  };
}

/**
 * Forgot-password: always returns success (no user enumeration). When `portal`
 * is supplied the search is scoped to that portal; otherwise it spans all
 * tables. A single-use token records which portal (userType) it belongs to so
 * the reset lands in the right table. Token is logged in development only.
 */
export async function forgotPassword(email: string, portal?: Role) {
  const account = portal
    ? await accounts.findByEmailForRole(portal, email)
    : await accounts.findByEmailAnywhere(email);
  if (!account || !account.isActive) return;

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.passwordResetToken.create({
    data: {
      tokenHash,
      userId: account.id,
      userType: account.role,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  });
  if (env.NODE_ENV !== 'production') {
    logger.info({ email, role: account.role, resetToken: rawToken }, '🔑 Password reset token (dev only)');
  }
  // TODO: emailService.sendPasswordReset(account.email, rawToken)
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw ApiError.badRequest('Reset token is invalid or has expired');
  }
  // Consume the token first so a retry can't reuse it, then rotate credentials.
  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  await accounts.updateAccount(record.userType, record.userId, {
    passwordHash: await hashPassword(newPassword),
  });
  await prisma.refreshToken.updateMany({
    where: { userId: record.userId, userType: record.userType, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
