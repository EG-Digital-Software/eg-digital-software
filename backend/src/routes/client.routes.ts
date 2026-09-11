import { Router } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/client.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { buildTaskRouter } from './task.routes.js';
import {
  listClientInvoiceQuerySchema,
  listClientProductQuerySchema,
} from '../validators/client.validator.js';

const router = Router();
router.use(authenticate, authorize(Role.CLIENT));

// Signed agreement uploads: no size cap — the filled + flattened PDF is stored raw.
const docUpload = multer({ storage: multer.memoryStorage() });

// Read-only view of this customer's task board, plus comments/attachments.
router.use('/tasks', buildTaskRouter(true));

router.get('/profile', ctrl.profile);
router.get('/dashboard', ctrl.dashboard);
router.get('/invoices', validate({ query: listClientInvoiceQuerySchema }), ctrl.invoices);
router.get('/invoices/:id', ctrl.invoice);
router.get('/products', validate({ query: listClientProductQuerySchema }), ctrl.products);
router.get('/available-products', ctrl.availableProducts);
// A client can add a product to their own account; it starts PENDING approval.
router.post('/products', ctrl.addProduct);

// Submit a filled + signed copy of an agreement PDF for admin approval.
router.post('/documents/:documentId/sign', docUpload.single('file'), ctrl.signDocument);

export default router;
