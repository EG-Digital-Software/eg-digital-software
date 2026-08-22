import { LicenceStatus } from '@prisma/client';

/**
 * Licence status thresholds (configurable in future via settings):
 *   30+ days  → ACTIVE
 *   8–30 days → EXPIRING_SOON
 *   0–7 days  → CRITICAL
 *   < 0 days  → EXPIRED
 * SUSPENDED is set manually and is never auto-overwritten.
 */
export const LICENCE_THRESHOLDS = { expiringSoon: 30, critical: 7 };

export function daysRemaining(expiry: Date | null | undefined, now = new Date()): number | null {
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function computeLicenceStatus(
  expiry: Date | null | undefined,
  current?: LicenceStatus,
  now = new Date()
): LicenceStatus {
  if (current === LicenceStatus.SUSPENDED) return LicenceStatus.SUSPENDED;
  if (!expiry) return LicenceStatus.ACTIVE; // perpetual licence
  const days = daysRemaining(expiry, now)!;
  if (days < 0) return LicenceStatus.EXPIRED;
  if (days <= LICENCE_THRESHOLDS.critical) return LicenceStatus.CRITICAL;
  if (days <= LICENCE_THRESHOLDS.expiringSoon) return LicenceStatus.EXPIRING_SOON;
  return LicenceStatus.ACTIVE;
}
