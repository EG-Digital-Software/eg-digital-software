import { Router } from 'express';
import * as ctrl from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authorizeTab } from '../middleware/staffAccess.js';
import { seriesQuerySchema } from '../validators/dashboard.validator.js';

const router = Router();
router.use(authenticate, authorizeTab(['dashboard']));

router.get('/summary', ctrl.summary);
router.get('/revenue', validate({ query: seriesQuerySchema }), ctrl.series);
router.get('/sales', validate({ query: seriesQuerySchema }), ctrl.series);
router.get('/series', validate({ query: seriesQuerySchema }), ctrl.series);
router.get('/licences', ctrl.licences);
router.get('/low-stock', ctrl.lowStock);
router.get('/recent-activity', ctrl.recentActivity);
router.get('/tasks-overview', ctrl.taskOverview);

export default router;
