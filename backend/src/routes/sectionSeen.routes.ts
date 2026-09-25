import { Router } from 'express';
import * as ctrl from '../controllers/sectionSeen.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate); // any authenticated role

router.get('/', ctrl.state);
router.post('/', ctrl.mark);

export default router;
