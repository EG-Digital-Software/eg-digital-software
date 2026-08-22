import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/payment.controller.js';
import * as invoiceCtrl from '../controllers/invoice.controller.js';
import * as settings from '../controllers/settings.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  recordPaymentSchema,
  publicPaySchema,
  listPaymentQuerySchema,
} from '../validators/payment.validator.js';

const router = Router();

// Public endpoints for the pay page + gateway callbacks.
router.get('/public/invoice/:id', invoiceCtrl.getPublic);
router.get('/public/settings', settings.getPublicPayment);
router.get('/public/organisation', settings.getPublicOrganisation);
router.get('/public/quote/:id', ctrl.publicQuote);
router.post('/public/pay/:id', validate({ body: publicPaySchema }), ctrl.publicPay);
router.post('/webhook', ctrl.webhook);

// Admin-only.
router.get(
  '/',
  authenticate,
  authorize(Role.SUPER_ADMIN),
  validate({ query: listPaymentQuerySchema }),
  ctrl.list
);
router.get('/methods', authenticate, authorize(Role.SUPER_ADMIN), ctrl.methods);
router.post('/create', authenticate, authorize(Role.SUPER_ADMIN), ctrl.createIntent);
router.post(
  '/record',
  authenticate,
  authorize(Role.SUPER_ADMIN),
  validate({ body: recordPaymentSchema }),
  ctrl.record
);

export default router;
