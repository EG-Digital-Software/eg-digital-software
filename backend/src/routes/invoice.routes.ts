import { Router } from 'express';
import * as ctrl from '../controllers/invoice.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authorizeTab } from '../middleware/staffAccess.js';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  updateInvoiceStatusSchema,
  listInvoiceQuerySchema,
} from '../validators/invoice.validator.js';

const router = Router();
router.use(authenticate);
// Raising an invoice from a customer's Invoices sub-tab (edit level) needs no Billing tab.
router.post('/', authorizeTab(['billing', 'customers.invoices']), validate({ body: createInvoiceSchema }), ctrl.create);
router.use(authorizeTab(['billing'], ['customers', 'payments', 'dashboard']));

router.get('/', validate({ query: listInvoiceQuerySchema }), ctrl.list);
// Must precede `/:id` or "next-reference" would be read as an invoice id.
router.get('/next-reference', ctrl.nextReference);
router.get('/:id', ctrl.getOne);
router.post('/:id/send', ctrl.send);
router.put('/:id', validate({ body: updateInvoiceSchema }), ctrl.update);
router.put('/:id/status', validate({ body: updateInvoiceStatusSchema }), ctrl.updateStatus);
router.delete('/:id', ctrl.remove);

export default router;
