import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { storage } from '../services/storage/index.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();

const downloadQuerySchema = z.object({
  url: z.string().url().max(2048),
  name: z.string().min(1).max(255),
});

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Save a stored file (chat/attachment/archive) under its own name. Redirects to
 * a short-lived signed storage link that carries Content-Disposition:
 * attachment, so the browser streams the file straight to disk — videos and
 * very large files download instead of opening in a tab or failing in memory.
 * Public like the files themselves (the container is publicly readable); only
 * files in our own storage are accepted, so this is not an open redirect.
 */
router.get(
  '/download',
  downloadLimiter,
  asyncHandler(async (req, res) => {
    const parsed = downloadQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Invalid download link' });
    const target = await storage.downloadUrl(parsed.data.url, parsed.data.name);
    if (!target) return res.status(404).json({ success: false, message: 'File not found' });
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, target);
  })
);

export default router;
