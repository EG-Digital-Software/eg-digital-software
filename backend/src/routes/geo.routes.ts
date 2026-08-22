import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reverseGeocode } from '../services/geo.service.js';
import { asyncHandler, ok } from '../utils/http.js';

const router = Router();

const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

// The upstream provider is a shared free service — keep our call rate polite.
const geoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many location lookups, please try again shortly.' },
});

router.get(
  '/reverse',
  authenticate,
  geoLimiter,
  validate({ query: reverseQuerySchema }),
  asyncHandler(async (req, res) => {
    const { lat, lon } = req.query as unknown as { lat: number; lon: number };
    return ok(res, await reverseGeocode(lat, lon));
  })
);

export default router;
