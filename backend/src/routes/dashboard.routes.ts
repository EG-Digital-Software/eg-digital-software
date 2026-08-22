import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/dashboard.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { seriesQuerySchema } from '../validators/dashboard.validator.js';

const router = Router();
router.use(authenticate, authorize(Role.SUPER_ADMIN));

router.get('/summary', ctrl.summary);
router.get('/revenue', validate({ query: seriesQuerySchema }), ctrl.series);
router.get('/sales', validate({ query: seriesQuerySchema }), ctrl.series);
router.get('/series', validate({ query: seriesQuerySchema }), ctrl.series);
router.get('/licences', ctrl.licences);
router.get('/low-stock', ctrl.lowStock);
router.get('/recent-activity', ctrl.recentActivity);

export default router;
