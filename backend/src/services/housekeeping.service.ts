import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';

/**
 * Nothing ever removed spent auth tokens, so `RefreshToken` and
 * `PasswordResetToken` grew without bound — every login, refresh and reset left
 * a row behind for good. This sweep drops the ones that can no longer be used.
 *
 * A short grace period is kept after expiry so a token presented moments late
 * still produces "expired", not "unknown token".
 */
const GRACE_DAYS = 7;

export interface HousekeepingResult {
  refreshTokensDeleted: number;
  resetTokensDeleted: number;
}

export async function runTokenCleanup(): Promise<HousekeepingResult> {
  const cutoff = new Date(Date.now() - GRACE_DAYS * 86_400_000);

  const [refreshTokens, resetTokens] = await Promise.all([
    prisma.refreshToken.deleteMany({
      // Expired past the grace period, or revoked (rotated / logged out).
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] },
    }),
  ]);

  const result = {
    refreshTokensDeleted: refreshTokens.count,
    resetTokensDeleted: resetTokens.count,
  };
  logger.info({ ...result }, 'Token cleanup complete');
  return result;
}
