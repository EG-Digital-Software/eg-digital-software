import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';

export interface AccessPayload {
  sub: string; // user id
  role: Role;
  email: string;
  /** Set when an admin is viewing a client portal (read-only impersonation). */
  imp?: boolean;
  /** Target customer id carried by an impersonation token. */
  cid?: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  } as SignOptions);
}

/**
 * Access token an admin uses to view a client's portal read-only. Signed with a
 * longer window than a normal access token so the admin isn't kicked out mid
 * investigation. There is no refresh counterpart — it simply expires (or the
 * admin exits) and the admin's own session resumes.
 */
export function signImpersonationToken(payload: AccessPayload): string {
  return jwt.sign({ ...payload, imp: true }, env.JWT_SECRET, {
    expiresIn: '2h',
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessPayload;
}

export function signRefreshToken(userId: string, role: Role): string {
  // A random jti guarantees a unique token string even when two tokens are
  // issued for the same user within the same second (otherwise identical
  // sub+role+iat payloads collide on the RefreshToken.token unique index).
  return jwt.sign({ sub: userId, role, jti: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES,
  } as SignOptions);
}

export function verifyRefreshToken(token: string): { sub: string; role: Role } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string; role: Role };
}

/** Parse a "7d" / "15m" style duration to milliseconds. */
export function durationToMs(d: string): number {
  const m = /^(\d+)([smhd])$/.exec(d.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]]!;
  return n * unit;
}
