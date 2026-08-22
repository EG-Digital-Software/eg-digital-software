import { Router } from 'express';
import * as ctrl from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate); // any authenticated role

router.get('/', ctrl.list);
router.get('/count', ctrl.count);
router.post('/:id/read', ctrl.markRead);
router.post('/read-all', ctrl.markAllRead);

export default router;
