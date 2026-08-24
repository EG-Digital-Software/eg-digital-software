import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/customer.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomerQuerySchema,
} from '../validators/customer.validator.js';

const router = Router();
router.use(authenticate, authorize(Role.SUPER_ADMIN));

router.get('/', validate({ query: listCustomerQuerySchema }), ctrl.list);
// Must precede `/:clientId` or "next-client-id" would be read as a Client ID.
router.get('/next-client-id', ctrl.nextClientId);
router.get('/:clientId', ctrl.getOne);
router.post('/', validate({ body: createCustomerSchema }), ctrl.create);
router.put('/:clientId', validate({ body: updateCustomerSchema }), ctrl.update);
router.delete('/:clientId', ctrl.archive);

export default router;
