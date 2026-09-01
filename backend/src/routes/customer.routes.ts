import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/customer.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomerQuerySchema,
  addCredentialSchema,
  changePasswordSchema,
} from '../validators/customer.validator.js';

const router = Router();
router.use(authenticate, authorize(Role.SUPER_ADMIN));

router.get('/', validate({ query: listCustomerQuerySchema }), ctrl.list);
// Must precede `/:clientId` or "next-client-id" would be read as a Client ID.
router.get('/next-client-id', ctrl.nextClientId);
router.get('/:clientId', ctrl.getOne);
// Reveal the customer's portal password (admin-only, like every route here).
router.get('/:clientId/credential', ctrl.revealCredential);
// Multiple portal logins per customer — the admin can grant access to others.
router.get('/:clientId/credentials', ctrl.listCredentials);
router.post('/:clientId/credentials', validate({ body: addCredentialSchema }), ctrl.addCredential);
router.get('/:clientId/credentials/:userId/reveal', ctrl.revealCredentialById);
router.patch(
  '/:clientId/credentials/:userId/password',
  validate({ body: changePasswordSchema }),
  ctrl.changeCredentialPassword
);
router.delete('/:clientId/credentials/:userId', ctrl.removeCredential);
router.post('/', validate({ body: createCustomerSchema }), ctrl.create);
router.put('/:clientId', validate({ body: updateCustomerSchema }), ctrl.update);
router.delete('/:clientId', ctrl.archive);
// Permanent, irreversible delete — distinct from the soft archive above.
router.delete('/:clientId/permanent', ctrl.remove);

export default router;
