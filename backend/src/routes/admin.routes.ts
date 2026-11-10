import { Router } from 'express';
import { Role } from '@prisma/client';
import * as approvals from '../controllers/approval.controller.js';
import * as settings from '../controllers/settings.controller.js';
import * as payments from '../controllers/payment.controller.js';
import * as teamRoles from '../controllers/teamRole.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authorizeTab } from '../middleware/staffAccess.js';
import {
  paymentSettingsSchema,
  organisationSettingsSchema,
  listRegistrationQuerySchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  employeePasswordSchema,
  createTeamRoleSchema,
  updateTeamRoleSchema,
  employeeRolesSchema,
  accountManagerSettingSchema,
} from '../validators/settings.validator.js';
import { asyncHandler, ok } from '../utils/http.js';
import { runLicenceReminders } from '../services/reminder.service.js';
import { runInvoiceOverdueSweep } from '../services/invoiceOverdue.service.js';
import { runTokenCleanup } from '../services/housekeeping.service.js';
import { listAllArchiveFiles, listPreviewCustomers, taskActivityByCustomer, taskActivityByTask } from '../services/task.service.js';
import * as accessPoint from '../services/accessPoint.service.js';
import { ApiError } from '../utils/ApiError.js';

const router = Router();

// Task activity is shared with team members granted the Tasks tab, so it is
// registered ahead of the admin-only guard below.
// Latest task activity per customer — drives the "new activity" highlight on the
// admin Tasks company picker.
router.get(
  '/tasks/activity',
  authenticate,
  authorizeTab(['tasks']),
  asyncHandler(async (_req, res) => ok(res, await taskActivityByCustomer()))
);
// Per-task activity across all customers — drives the admin sidebar Tasks dot
// and the per-company dot on the Tasks picker.
router.get(
  '/tasks/activity/tasks',
  authenticate,
  authorizeTab(['tasks']),
  asyncHandler(async (_req, res) => ok(res, await taskActivityByTask()))
);

// Preview tab: every file archived on any task, in one place. Shared with team
// members granted the Preview tab, so it sits ahead of the admin-only guard too.
router.get(
  '/preview/archive',
  authenticate,
  authorizeTab(['preview']),
  asyncHandler(async (_req, res) => ok(res, await listAllArchiveFiles()))
);
router.get(
  '/preview/customers',
  authenticate,
  authorizeTab(['preview']),
  asyncHandler(async (_req, res) => ok(res, await listPreviewCustomers()))
);

router.use(authenticate, authorize(Role.SUPER_ADMIN));

// Access Point PINs — every admin, team member and client login, for the admin.
router.get('/access-pins', asyncHandler(async (_req, res) => ok(res, await accessPoint.listPins())));
router.post(
  '/access-pins/:userType/:userId/regenerate',
  asyncHandler(async (req, res) => {
    const userType = req.params.userType as Role;
    if (!(await accessPoint.userExists(req.params.userId, userType))) throw ApiError.notFound('User not found');
    return ok(res, { pin: await accessPoint.regeneratePin(req.params.userId, userType) }, 'New PIN issued');
  })
);

router.get('/registrations', validate({ query: listRegistrationQuerySchema }), approvals.list);
router.get('/registrations/count', approvals.count);
router.post('/registrations/:id/approve', approvals.approve);
router.post('/registrations/:id/reject', approvals.reject);
router.delete('/registrations/:id', approvals.remove);

// Admin-provisioned team (EMPLOYEE) logins: create, reveal password, reset password.
router.post('/employees', validate({ body: createEmployeeSchema }), approvals.createEmployee);
router.patch('/employees/:id', validate({ body: updateEmployeeSchema }), approvals.updateEmployee);
router.get('/employees/:id/password', approvals.revealEmployeePassword);
router.patch(
  '/employees/:id/password',
  validate({ body: employeePasswordSchema }),
  approvals.changeEmployeePassword
);
// Open a team member's portal AS them (impersonation) without their password.
router.post('/employees/:id/impersonate', approvals.impersonateEmployee);

// Team roles: each grants a set of admin tabs; a team member can hold several.
router.get('/team-roles', teamRoles.list);
router.post('/team-roles', validate({ body: createTeamRoleSchema }), teamRoles.create);
router.patch('/team-roles/:id', validate({ body: updateTeamRoleSchema }), teamRoles.update);
router.delete('/team-roles/:id', teamRoles.remove);
router.put('/employees/:id/roles', validate({ body: employeeRolesSchema }), teamRoles.setEmployeeRoles);

// Payment configuration (gateway keys, bank transfer details).
// Diagnostics — is outgoing email actually configured?
router.get('/email-status', settings.getEmailStatus);

router.get('/payment-settings', settings.getPayment);
router.put('/payment-settings', validate({ body: paymentSettingsSchema }), settings.updatePayment);
router.post('/payment-settings/worldline/test', payments.testWorldline);

// Organisation / issuing entity shown on invoices.
router.get('/organisation', settings.getOrganisation);
router.put(
  '/organisation',
  validate({ body: organisationSettingsSchema }),
  settings.updateOrganisation
);

// Single, global account manager shown to every client (set from Approvals).
router.get('/account-manager', settings.getAccountManager);
router.put(
  '/account-manager',
  validate({ body: accountManagerSettingSchema }),
  settings.updateAccountManager
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
