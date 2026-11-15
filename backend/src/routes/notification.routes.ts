import { Router } from 'express';
import * as ctrl from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate); // any authenticated role

router.get('/', ctrl.list);
router.get('/count', ctrl.count);
router.post('/:id/read', ctrl.markRead);
router.post('/read-all', ctrl.markAllRead);
// Mobile app push notifications: this phone's Expo push token.
router.post('/devices', ctrl.registerDevice);
router.post('/devices/remove', ctrl.unregisterDevice);

export default router;
