import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { lookupAbn } from '../services/abn.service.js';
import { asyncHandler, ok } from '../utils/http.js';

const router = Router();

// Accept the spaced form operators paste from the register ("51 824 753 556");
// the service strips to bare digits and checks the ATO checksum.
const lookupQuerySchema = z.object({
  abn: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 11, 'ABN must be 11 digits'),
});

// The register is a shared government service — keep our call rate polite.
const abnLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many ABN lookups, please try again shortly.' },
});

router.get(
  '/lookup',
  authenticate,
  abnLimiter,
  validate({ query: lookupQuerySchema }),
  asyncHandler(async (req, res) => {
    const { abn } = req.query as unknown as { abn: string };
    return ok(res, await lookupAbn(abn));
  })
);

export default router;
