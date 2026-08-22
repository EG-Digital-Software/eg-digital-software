import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/portal.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listEmployeeCustomerQuerySchema } from '../validators/client.validator.js';

const router = Router();
router.use(authenticate, authorize(Role.EMPLOYEE));

router.get('/dashboard', ctrl.employeeDashboard);
router.get('/customers', validate({ query: listEmployeeCustomerQuerySchema }), ctrl.employeeCustomers);
router.get('/licences', ctrl.employeeLicences);

export default router;
