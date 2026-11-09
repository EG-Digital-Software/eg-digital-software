import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/payment.controller.js';
import * as invoiceCtrl from '../controllers/invoice.controller.js';
import * as settings from '../controllers/settings.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorizeTab } from '../middleware/staffAccess.js';
import { validate } from '../middleware/validate.js';
import {
  recordPaymentSchema,
  publicPaySchema,
  confirmCheckoutSchema,
  listPaymentQuerySchema,
} from '../validators/payment.validator.js';

const router = Router();

// Each checkout is a call to the gateway — stop a public link being hammered.
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many payment attempts, please try again shortly.' },
});

// Public endpoints for the pay page + gateway callbacks.
router.get('/public/invoice/:id', invoiceCtrl.getPublic);
router.get('/public/settings', settings.getPublicPayment);
router.get('/public/organisation', settings.getPublicOrganisation);
router.get('/public/quote/:id', ctrl.publicQuote);
router.post('/public/pay/:id', validate({ body: publicPaySchema }), ctrl.publicPay);
router.post('/public/checkout/:id', checkoutLimiter, ctrl.startCheckout);
router.post(
  '/public/checkout/:id/confirm',
  checkoutLimiter,
  validate({ body: confirmCheckoutSchema }),
  ctrl.confirmCheckout
);
router.post('/webhook', ctrl.webhook);
router.post('/webhook/worldline', ctrl.worldlineWebhook);

// Admin, or team members granted the Payments or Billing tab.
router.get(
  '/',
  authenticate,
  authorizeTab(['payments', 'billing']),
  validate({ query: listPaymentQuerySchema }),
  ctrl.list
);
router.get('/methods', authenticate, authorizeTab(['payments', 'billing']), ctrl.methods);
router.post('/create', authenticate, authorizeTab(['payments', 'billing']), ctrl.createIntent);
router.post(
  '/record',
  authenticate,
  authorizeTab(['payments', 'billing']),
  validate({ body: recordPaymentSchema }),
  ctrl.record
);

export default router;
