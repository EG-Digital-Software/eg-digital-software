import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePreviewClient } from '../middleware/previewClient.js';
import { asyncHandler, ok } from '../utils/http.js';
import { ApiError } from '../utils/ApiError.js';
import { findById } from '../services/accounts.js';
import { resolveCustomerId } from '../services/client.service.js';
import * as fb from '../services/feedback.service.js';

/**
 * Client feedback & testimonials.
 *   /feedback/public/*  — website widget (no auth; featured, client-approved only)
 *   /feedback/client/*  — the client portal's Feedback page
 *   /feedback/admin/*   — the admin Feedback page (super admin)
 */
const router = Router();

const publicLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
router.get(
  '/public/testimonials',
  publicLimiter,
  asyncHandler(async (_req, res) => {
    // Read by the marketing website from another origin; nothing private is returned.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return ok(res, await fb.publicTestimonials());
  })
);

// Photos and ~1 minute videos recorded in the browser.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 150 * 1024 * 1024 } });

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.enum(fb.REVIEW_TAGS)).max(fb.REVIEW_TAGS.length).default([]),
  comment: z.string().trim().max(4000).nullable().optional(),
  displayAs: z.enum(fb.DISPLAY_AS).default('COMPANY'),
});
const createReviewSchema = reviewSchema.extend({ taskId: z.string().uuid() });
const opt = (max: number) => z.string().trim().max(max).nullable().optional();
const usesSchema = z.array(z.enum(fb.USES)).max(fb.USES.length);
const testimonialSchema = z.object({
  problem: opt(2000),
  change: opt(2000),
  recommend: opt(2000),
  personName: z.string().trim().min(1, 'Your name is required').max(120),
  jobTitle: opt(120),
  companyName: z.string().trim().min(1, 'Company is required').max(200),
  photoUrl: z.string().url().max(2048).nullable().optional(),
  videoUrl: z.string().url().max(2048).nullable().optional(),
  videoSeconds: z.number().int().min(0).max(600).nullable().optional(),
  uses: usesSchema,
  taskId: z.string().uuid().nullable().optional(),
  honest: z.literal(true, { errorMap: () => ({ message: 'Please confirm these are your own honest views' }) }),
});

// ─── client ──────────────────────────────────────────────

const client = Router();
client.use(authenticate, authorize(Role.CLIENT));
// Client feedback is a preview section — only the demo client gets in.
client.use(requirePreviewClient);
// An admin viewing the portal is read-only unless they opened it in Edit mode.
client.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.imp && !req.user.edit && req.method !== 'GET') {
    return next(ApiError.forbidden('Read-only: you are viewing this portal as an admin'));
  }
  next();
});

async function clientActor(req: Request): Promise<fb.ClientActor> {
  const { sub, role } = req.user!;
  const acc = await findById(role, sub);
  if (!acc || !acc.isActive) throw ApiError.unauthorized();
  return {
    userId: sub,
    customerId: await resolveCustomerId(sub),
    firstName: acc.firstName ?? '',
    lastName: acc.lastName ?? '',
  };
}

client.get('/', asyncHandler(async (req, res) => ok(res, await fb.clientOverview(await clientActor(req)))));
client.post(
  '/reviews',
  validate({ body: createReviewSchema }),
  asyncHandler(async (req, res) => {
    const { taskId, ...input } = req.body;
    return ok(res, await fb.createReview(await clientActor(req), taskId, input), 'Thanks for your review', 201);
  })
);
client.patch(
  '/reviews/:id',
  validate({ body: reviewSchema }),
  asyncHandler(async (req, res) => ok(res, await fb.updateReview(await clientActor(req), req.params.id, req.body), 'Review updated'))
);
client.post(
  '/testimonials/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file received');
    const kind = req.body.kind === 'video' ? 'video' : 'photo';
    const actor = await clientActor(req);
    return ok(res, await fb.saveTestimonialFile(actor.customerId, req.file, kind));
  })
);
client.post(
  '/testimonials',
  validate({ body: testimonialSchema }),
  asyncHandler(async (req, res) => {
    const { honest: _honest, ...input } = req.body;
    return ok(res, await fb.createTestimonial(await clientActor(req), input), 'Thank you — testimonial sent', 201);
  })
);
client.patch(
  '/testimonials/:id/uses',
  validate({ body: z.object({ uses: usesSchema }) }),
  asyncHandler(async (req, res) =>
    ok(res, await fb.clientUpdateTestimonialUses(await clientActor(req), req.params.id, req.body.uses), 'Saved')
  )
);
client.post(
  '/testimonials/:id/withdraw',
  asyncHandler(async (req, res) =>
    ok(res, await fb.clientWithdrawTestimonial(await clientActor(req), req.params.id), 'Testimonial withdrawn')
  )
);
client.post(
  '/testimonials/:id/decide',
  validate({ body: z.object({ accept: z.boolean() }) }),
  asyncHandler(async (req, res) =>
    ok(res, await fb.clientDecideEdit(await clientActor(req), req.params.id, req.body.accept), 'Saved')
  )
);

// ─── admin ───────────────────────────────────────────────

const admin = Router();
admin.use(authenticate, authorize(Role.SUPER_ADMIN));

const linkSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === '' || /^https:\/\/\S+$/i.test(v), 'Use a full https:// link')
  .nullable()
  .optional();

admin.get(
  '/reviews',
  asyncHandler(async (req, res) => {
    const customerId = typeof req.query.customerId === 'string' && req.query.customerId ? req.query.customerId : undefined;
    return ok(res, await fb.adminReviews(customerId));
  })
);
admin.patch(
  '/reviews/:id',
  validate({ body: z.object({ status: z.enum(fb.REVIEW_STATUS) }) }),
  asyncHandler(async (req, res) => ok(res, await fb.adminSetReviewStatus(req.params.id, req.body.status), 'Saved'))
);
admin.get('/testimonials', asyncHandler(async (_req, res) => ok(res, await fb.adminTestimonials())));
admin.patch(
  '/testimonials/:id',
  validate({
    body: z.object({
      service: z.string().trim().max(120).nullable().optional(),
      featured: z.boolean().optional(),
      pendingQuote: z.string().trim().max(4000).nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await fb.adminUpdateTestimonial(req.params.id, req.body), 'Saved'))
);
admin.post(
  '/testimonials/request',
  validate({ body: z.object({ customerId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => ok(res, await fb.requestTestimonial(req.body.customerId), 'Request sent'))
);
admin.get('/review-links', asyncHandler(async (_req, res) => ok(res, await fb.getReviewLinks())));
admin.put(
  '/review-links',
  validate({ body: z.object({ google: linkSchema, facebook: linkSchema, clutch: linkSchema, trustpilot: linkSchema }) }),
  asyncHandler(async (req, res) => ok(res, await fb.updateReviewLinks(req.body), 'Review links saved'))
);

router.use('/client', client);
router.use('/admin', admin);

export default router;
