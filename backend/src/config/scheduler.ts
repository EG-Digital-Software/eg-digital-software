import cron from 'node-cron';
import { logger } from './logger.js';
import { runLicenceReminders } from '../services/reminder.service.js';
import { runInvoiceOverdueSweep } from '../services/invoiceOverdue.service.js';
import { runTokenCleanup } from '../services/housekeeping.service.js';

/**
 * Registers scheduled jobs. Runs in the app process (fine for a single App
 * Service instance). For multi-instance deployments, guard with a distributed
 * lock or move to an external scheduler (e.g. Azure Functions timer trigger).
 */
export function startScheduler() {
  // Daily licence-expiry reminders at 08:00 (server timezone).
  cron.schedule('0 8 * * *', () => {
    logger.info('⏰ Running daily licence reminders');
    runLicenceReminders().catch((err) => logger.error({ err }, 'Licence reminder job failed'));
  });

  // Daily invoice-overdue sweep at 07:30, before the licence reminders so the
  // Billing status column is already up to date when admins start the day.
  cron.schedule('30 7 * * *', () => {
    logger.info('⏰ Running daily invoice overdue sweep');
    runInvoiceOverdueSweep().catch((err) =>
      logger.error({ err }, 'Invoice overdue sweep failed')
    );
  });

  // Nightly auth-token cleanup at 03:00, off-peak.
  cron.schedule('0 3 * * *', () => {
    logger.info('⏰ Running nightly token cleanup');
    runTokenCleanup().catch((err) => logger.error({ err }, 'Token cleanup failed'));
  });

  logger.info('Scheduler started — token cleanup 03:00, invoice overdue sweep 07:30, licence reminders 08:00');
}
