import { CustomerAccountStatus } from '@prisma/client';

/** An account with no invoice this recent is treated as dormant. */
export const DORMANT_AFTER_MONTHS = 6;

/** Start of the activity window: an invoice older than this no longer counts. */
export function dormancyCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - DORMANT_AFTER_MONTHS);
  return cutoff;
}

/**
 * Resolve the account standing shown in the UI.
 *
 * A pinned DORMANT or SUSPENDED override always wins. When left at ACTIVE the
 * standing is derived from activity: an account with no invoice in the last
 * {@link DORMANT_AFTER_MONTHS} months (or none at all) reads as DORMANT.
 */
export function effectiveAccountStatus(
  stored: CustomerAccountStatus,
  invoiceDates: Array<Date | string | null | undefined>
): CustomerAccountStatus {
  if (stored !== CustomerAccountStatus.ACTIVE) return stored;

  const cutoff = dormancyCutoff();
  const hasRecent = invoiceDates.some((d) => d != null && new Date(d) >= cutoff);
  return hasRecent ? CustomerAccountStatus.ACTIVE : CustomerAccountStatus.DORMANT;
}
