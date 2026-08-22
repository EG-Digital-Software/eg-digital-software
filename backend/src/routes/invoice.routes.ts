import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/invoice.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createInvoiceSchema,
  updateInvoiceStatusSchema,
  listInvoiceQuerySchema,
} from '../validators/invoice.validator.js';

const router = Router();
router.use(authenticate, authorize(Role.SUPER_ADMIN));

router.get('/', validate({ query: listInvoiceQuerySchema }), ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', validate({ body: createInvoiceSchema }), ctrl.create);
router.put('/:id/status', validate({ body: updateInvoiceStatusSchema }), ctrl.updateStatus);

export default router;
