import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/portal.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listSupplierProductQuerySchema } from '../validators/client.validator.js';

const router = Router();
router.use(authenticate, authorize(Role.SUPPLIER));

router.get('/dashboard', ctrl.supplierDashboard);
router.get('/products', validate({ query: listSupplierProductQuerySchema }), ctrl.supplierProducts);

export default router;
