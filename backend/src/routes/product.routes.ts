import { Router } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/product.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createProductSchema,
  updateProductSchema,
  listProductQuerySchema,
} from '../validators/product.validator.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

router.use(authenticate, authorize(Role.SUPER_ADMIN));

router.get('/', validate({ query: listProductQuerySchema }), ctrl.list);
// Must precede /:id so "categories" is not read as a product id.
router.get('/categories', ctrl.categories);
router.get('/:id', ctrl.getOne);
router.post('/', validate({ body: createProductSchema }), ctrl.create);
router.post('/bulk-import', upload.single('file'), ctrl.bulkImport);
router.put('/:id', validate({ body: updateProductSchema }), ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
