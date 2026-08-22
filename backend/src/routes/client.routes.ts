import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/client.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  listClientInvoiceQuerySchema,
  listClientProductQuerySchema,
} from '../validators/client.validator.js';

const router = Router();
router.use(authenticate, authorize(Role.CLIENT));

router.get('/profile', ctrl.profile);
router.get('/dashboard', ctrl.dashboard);
router.get('/invoices', validate({ query: listClientInvoiceQuerySchema }), ctrl.invoices);
router.get('/invoices/:id', ctrl.invoice);
router.get('/products', validate({ query: listClientProductQuerySchema }), ctrl.products);

export default router;
