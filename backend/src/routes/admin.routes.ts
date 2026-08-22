import { Router } from 'express';
import { Role } from '@prisma/client';
import * as approvals from '../controllers/approval.controller.js';
import * as settings from '../controllers/settings.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  paymentSettingsSchema,
  organisationSettingsSchema,
  listRegistrationQuerySchema,
} from '../validators/settings.validator.js';
import { asyncHandler, ok } from '../utils/http.js';
import { runLicenceReminders } from '../services/reminder.service.js';
import { runInvoiceOverdueSweep } from '../services/invoiceOverdue.service.js';
import { runTokenCleanup } from '../services/housekeeping.service.js';

const router = Router();
router.use(authenticate, authorize(Role.SUPER_ADMIN));

router.get('/registrations', validate({ query: listRegistrationQuerySchema }), approvals.list);
router.get('/registrations/count', approvals.count);
router.post('/registrations/:id/approve', approvals.approve);
router.post('/registrations/:id/reject', approvals.reject);

// Payment configuration (gateway keys, bank transfer details, card surcharge).
router.get('/payment-settings', settings.getPayment);
router.put('/payment-settings', validate({ body: paymentSettingsSchema }), settings.updatePayment);

// Organisation / issuing entity shown on invoices.
router.get('/organisation', settings.getOrganisation);
router.put(
  '/organisation',
  validate({ body: organisationSettingsSchema }),
  settings.updateOrganisation
);

// Manually trigger the daily licence-expiry reminder job.
router.post(
  '/licences/run-reminders',
  asyncHandler(async (_req, res) => ok(res, await runLicenceReminders(), 'Reminders processed'))
);

// Manually trigger the daily invoice-overdue sweep.
router.post(
  '/invoices/run-overdue-sweep',
  asyncHandler(async (_req, res) =>
    ok(res, await runInvoiceOverdueSweep(), 'Overdue sweep processed')
  )
);

// Manually trigger the nightly expired-token cleanup.
router.post(
  '/maintenance/cleanup-tokens',
  asyncHandler(async (_req, res) => ok(res, await runTokenCleanup(), 'Token cleanup complete'))
);

export default router;
