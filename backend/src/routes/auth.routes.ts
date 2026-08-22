import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
});
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/auth.validator.js';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), ctrl.login);
router.post(
  '/register',
  authLimiter,
  avatarUpload.single('avatar'),
  validate({ body: registerSchema }),
  ctrl.register
);
router.post('/refresh', ctrl.refresh);
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.put('/me', authenticate, validate({ body: updateProfileSchema }), ctrl.updateProfile);
router.post('/avatar', authenticate, avatarUpload.single('avatar'), ctrl.uploadAvatar);
router.delete('/avatar', authenticate, ctrl.removeAvatar);
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  ctrl.changePassword
);
router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  ctrl.forgotPassword
);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), ctrl.resetPassword);

export default router;
