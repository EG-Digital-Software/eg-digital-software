import { Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { storage } from './storage/index.js';
import { notify, notifySuperAdmins } from './notification.service.js';
import { getResolvedAccountManager } from './settings.service.js';

/**
 * Client feedback & testimonials.
 *
 *  - Reviews: once a task is COMPLETED, the client can star-rate it (one review
 *    per task). Admins decide whether a review is shown publicly; the client
 *    decides how their name appears (or keeps it team-only).
 *  - Testimonials: client-written words (+ optional photo / video). Nothing is
 *    used until the client approves the final wording; an admin edit goes back
 *    to the client to accept first.
 */

export const REVIEW_TAGS = ['Communication', 'Speed', 'Quality of work', 'Value for money', 'Friendly team'] as const;
export const DISPLAY_AS = ['COMPANY', 'PERSON', 'PRIVATE'] as const;
export const REVIEW_STATUS = ['NEW', 'PUBLISHED', 'HIDDEN'] as const;
export const USES = ['WEBSITE', 'PROPOSALS', 'SOCIAL', 'CASE_STUDY'] as const;
export const REVIEW_SITES = ['google', 'facebook', 'clutch', 'trustpilot'] as const;
export type ReviewSite = (typeof REVIEW_SITES)[number];

/** Completed tasks older than this aren't offered for a new review. */
const READY_WINDOW_DAYS = 120;
const REVIEW_LINKS_KEY = 'reviewLinks';
/** At or below this rating the account manager and admins are alerted. */
const LOW_RATING = 2;

export interface ClientActor {
  userId: string;
  customerId: string;
  firstName: string;
  lastName: string;
}

// ─── shared helpers ──────────────────────────────────────

const companyLabel = (c: { companyName: string | null; tradingAs: string | null }) => {
  const name = c.companyName?.trim() || c.tradingAs?.trim() || 'Your company';
  const trading = c.tradingAs?.trim();
  return trading && trading !== name ? `${stripPty(name)} (${trading})` : stripPty(name);
};
/** "3Two1 Import Pty. Ltd." → "3Two1 Import" for display names. */
const stripPty = (n: string) => n.replace(/\s+(pty\.?\s*ltd\.?|pty\.?\s*limited|ltd\.?|limited)$/i, '').trim() || n;

function displayNameFor(
  displayAs: string,
  company: { companyName: string | null; tradingAs: string | null },
  firstName: string
) {
  if (displayAs === 'PRIVATE') return null;
  const shortCo = stripPty(company.companyName?.trim() || company.tradingAs?.trim() || '');
  if (displayAs === 'PERSON') return shortCo ? `${firstName}, ${shortCo}` : firstName;
  return companyLabel(company);
}

const readyCutoff = () => new Date(Date.now() - READY_WINDOW_DAYS * 86_400_000);

/** Completed tasks of these customers with no review yet (newest first). */
function pendingTasks(customerIds?: string[]) {
  return prisma.task.findMany({
    where: {
      progress: 'COMPLETED',
      completedAt: { gte: readyCutoff() },
      feedback: { is: null },
      ...(customerIds ? { customerId: { in: customerIds } } : {}),
    },
    orderBy: { completedAt: 'desc' },
    select: {
      id: true,
      taskNumber: true,
      title: true,
      completedAt: true,
      customer: { select: { id: true, clientId: true, companyName: true, tradingAs: true } },
    },
    take: 300,
  });
}

// ─── review-site links (admin setting) ───────────────────

export async function getReviewLinks(): Promise<Record<ReviewSite, string | null>> {
  const row = await prisma.setting.findUnique({ where: { key: REVIEW_LINKS_KEY } });
  const v = (row?.value ?? {}) as Partial<Record<ReviewSite, string | null>>;
  return Object.fromEntries(REVIEW_SITES.map((k) => [k, v[k] || null])) as Record<ReviewSite, string | null>;
}

export async function updateReviewLinks(input: Partial<Record<ReviewSite, string | null>>) {
  const current = await getReviewLinks();
  const value = { ...current };
  for (const k of REVIEW_SITES) if (k in input) value[k] = input[k]?.trim() || null;
  await prisma.setting.upsert({
    where: { key: REVIEW_LINKS_KEY },
    create: { key: REVIEW_LINKS_KEY, value },
    update: { value },
  });
  return value;
}

// ─── client portal ───────────────────────────────────────

const reviewOut = (r: Prisma.TaskFeedbackGetPayload<{ include: { task: { select: { title: true; taskNumber: true } } } }>) => ({
  id: r.id,
  taskId: r.taskId,
  taskTitle: r.task.title,
  taskNumber: r.task.taskNumber,
  rating: r.rating,
  tags: r.tags,
  comment: r.comment,
  displayAs: r.displayAs,
  displayName: r.displayName,
  status: r.status,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export async function clientOverview(actor: ClientActor) {
  const [customer, assignedMgr, ready, reviews, testimonials, links] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: actor.customerId },
      select: {
        companyName: true,
        tradingAs: true,
        accountManager: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    }),
    getResolvedAccountManager(),
    pendingTasks([actor.customerId]),
    prisma.taskFeedback.findMany({
      where: { customerId: actor.customerId },
      orderBy: { createdAt: 'desc' },
      include: { task: { select: { title: true, taskNumber: true } } },
    }),
    prisma.testimonial.findMany({ where: { customerId: actor.customerId }, orderBy: { createdAt: 'desc' } }),
    getReviewLinks(),
  ]);
  if (!customer) throw ApiError.notFound('Customer not found');
  const mgr = customer.accountManager ?? assignedMgr;
  const shortCo = stripPty(customer.companyName?.trim() || customer.tradingAs?.trim() || '');
  return {
    company: {
      name: customer.companyName ?? customer.tradingAs ?? '',
      tradingAs: customer.tradingAs,
      label: companyLabel(customer),
    },
    me: { firstName: actor.firstName, lastName: actor.lastName },
    displayOptions: [
      { value: 'COMPANY', label: companyLabel(customer) },
      { value: 'PERSON', label: shortCo ? `${actor.firstName}, ${shortCo}` : actor.firstName },
      { value: 'PRIVATE', label: "Team only — don't show publicly" },
    ],
    accountManager: mgr
      ? { name: `${mgr.firstName} ${mgr.lastName}`.trim(), firstName: mgr.firstName, email: mgr.email, phone: mgr.phone }
      : null,
    tags: REVIEW_TAGS,
    ready: ready.map((t) => ({ taskId: t.id, taskNumber: t.taskNumber, title: t.title, completedAt: t.completedAt })),
    reviews: reviews.map(reviewOut),
    testimonials,
    reviewLinks: links,
  };
}

export interface ReviewInput {
  rating: number;
  tags: string[];
  comment?: string | null;
  displayAs: (typeof DISPLAY_AS)[number];
}

async function alertLowRating(customerId: string, taskTitle: string, rating: number, feedbackId: string) {
  if (rating > LOW_RATING) return;
  try {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { companyName: true, tradingAs: true, accountManagerId: true },
    });
    const who = c ? companyLabel(c) : 'A client';
    const msg = {
      type: 'FEEDBACK_LOW',
      title: `${rating}-star review from ${who}`,
      body: `"${taskTitle}" was rated ${rating} of 5. Please get in touch within 2 business days.`,
      link: '/admin/feedback',
      entityType: 'feedback',
      entityId: feedbackId,
    };
    notifySuperAdmins(msg);
    const mgrId = c?.accountManagerId ?? (await getResolvedAccountManager())?.id;
    if (mgrId) notify({ ...msg, userId: mgrId, userType: Role.EMPLOYEE });
  } catch (err) {
    logger.error({ err }, 'Low-rating alert failed');
  }
}

export async function createReview(actor: ClientActor, taskId: string, input: ReviewInput) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, customerId: actor.customerId },
    select: { id: true, title: true, progress: true, feedback: { select: { id: true } } },
  });
  if (!task) throw ApiError.notFound('Task not found');
  if (task.progress !== 'COMPLETED') throw ApiError.badRequest('Only completed tasks can be reviewed');
  if (task.feedback) throw ApiError.conflict('This task already has a review — edit it instead');
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: actor.customerId },
    select: { companyName: true, tradingAs: true },
  });
  const created = await prisma.taskFeedback.create({
    data: {
      taskId,
      customerId: actor.customerId,
      clientUserId: actor.userId,
      clientName: `${actor.firstName} ${actor.lastName}`.trim(),
      rating: input.rating,
      tags: input.tags,
      comment: input.comment?.trim() || null,
      displayAs: input.displayAs,
      displayName: displayNameFor(input.displayAs, customer, actor.firstName),
    },
    include: { task: { select: { title: true, taskNumber: true } } },
  });
  void alertLowRating(actor.customerId, task.title, input.rating, created.id);
  return reviewOut(created);
}

export async function updateReview(actor: ClientActor, id: string, input: ReviewInput) {
  const existing = await prisma.taskFeedback.findFirst({
    where: { id, customerId: actor.customerId },
    include: { task: { select: { title: true } } },
  });
  if (!existing) throw ApiError.notFound('Review not found');
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: actor.customerId },
    select: { companyName: true, tradingAs: true },
  });
  const saved = await prisma.taskFeedback.update({
    where: { id },
    data: {
      rating: input.rating,
      tags: input.tags,
      comment: input.comment?.trim() || null,
      displayAs: input.displayAs,
      displayName: displayNameFor(input.displayAs, customer, actor.firstName),
      // Changed words go back to our team before they're shown again.
      status: existing.status === 'HIDDEN' ? 'HIDDEN' : 'NEW',
    },
    include: { task: { select: { title: true, taskNumber: true } } },
  });
  if (input.rating < existing.rating) void alertLowRating(actor.customerId, existing.task.title, input.rating, id);
  return reviewOut(saved);
}

/** Store a testimonial photo or video for this customer. */
export async function saveTestimonialFile(customerId: string, file: Express.Multer.File, kind: 'photo' | 'video') {
  const ok = kind === 'photo' ? /^image\/(png|jpe?g|webp)$/i.test(file.mimetype) : /^video\//i.test(file.mimetype);
  if (!ok) throw ApiError.badRequest(kind === 'photo' ? 'Upload a PNG or JPG image' : 'Upload a video file');
  const safeName = (file.originalname || kind).replace(/[^\w.-]+/g, '_').slice(-80);
  const key = `testimonials/${customerId}/${Date.now()}-${safeName}`;
  const url = await storage.save(key, file.buffer, file.mimetype);
  return { url };
}

const ownFile = (customerId: string, url?: string | null) => {
  if (!url) return null;
  // Demo-portal uploads live under a `demo/` folder (see storage demoAware).
  if (!storage.keyOf(url).replace(/^demo\//, '').startsWith(`testimonials/${customerId}/`)) throw ApiError.badRequest('Invalid file');
  return url;
};

export interface TestimonialInput {
  problem?: string | null;
  change?: string | null;
  recommend?: string | null;
  personName: string;
  jobTitle?: string | null;
  companyName: string;
  photoUrl?: string | null;
  videoUrl?: string | null;
  videoSeconds?: number | null;
  uses: (typeof USES)[number][];
  taskId?: string | null;
}

export const composeQuote = (i: { problem?: string | null; change?: string | null; recommend?: string | null }) =>
  [i.problem, i.change, i.recommend]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s)
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
    .join(' ');

export async function createTestimonial(actor: ClientActor, input: TestimonialInput) {
  const quote = composeQuote(input);
  if (!quote && !input.videoUrl) throw ApiError.badRequest('Write a few words or add a video');
  let service: string | null = null;
  if (input.taskId) {
    const t = await prisma.task.findFirst({ where: { id: input.taskId, customerId: actor.customerId }, select: { title: true } });
    service = t?.title ?? null;
  }
  const created = await prisma.testimonial.create({
    data: {
      customerId: actor.customerId,
      clientUserId: actor.userId,
      taskId: service ? input.taskId : null,
      problem: input.problem?.trim() || null,
      change: input.change?.trim() || null,
      recommend: input.recommend?.trim() || null,
      quote: quote || '(Video testimonial)',
      personName: input.personName.trim(),
      jobTitle: input.jobTitle?.trim() || null,
      companyName: input.companyName.trim(),
      photoUrl: ownFile(actor.customerId, input.photoUrl),
      videoUrl: ownFile(actor.customerId, input.videoUrl),
      videoSeconds: input.videoUrl ? (input.videoSeconds ?? null) : null,
      uses: input.uses,
      service,
    },
  });
  notifySuperAdmins({
    type: 'TESTIMONIAL_NEW',
    title: `New testimonial from ${created.companyName}`,
    body: created.quote.slice(0, 140),
    link: '/admin/feedback?tab=testimonials',
    entityType: 'testimonial',
    entityId: created.id,
  });
  return created;
}

async function ownTestimonial(actor: ClientActor, id: string) {
  const t = await prisma.testimonial.findFirst({ where: { id, customerId: actor.customerId } });
  if (!t) throw ApiError.notFound('Testimonial not found');
  return t;
}

export async function clientUpdateTestimonialUses(actor: ClientActor, id: string, uses: (typeof USES)[number][]) {
  const t = await ownTestimonial(actor, id);
  if (t.status === 'WITHDRAWN') throw ApiError.badRequest('This testimonial was withdrawn');
  return prisma.testimonial.update({
    where: { id },
    data: { uses, featured: uses.includes('WEBSITE') ? t.featured : false },
  });
}

export async function clientWithdrawTestimonial(actor: ClientActor, id: string) {
  await ownTestimonial(actor, id);
  return prisma.testimonial.update({
    where: { id },
    data: { status: 'WITHDRAWN', featured: false, pendingQuote: null },
  });
}

/** Accept or decline our tidied wording. */
export async function clientDecideEdit(actor: ClientActor, id: string, accept: boolean) {
  const t = await ownTestimonial(actor, id);
  if (t.status !== 'WITH_CUSTOMER' || !t.pendingQuote) throw ApiError.badRequest('There is no edit waiting for you');
  const saved = await prisma.testimonial.update({
    where: { id },
    data: { status: 'APPROVED', quote: accept ? t.pendingQuote : t.quote, pendingQuote: null },
  });
  notifySuperAdmins({
    type: 'TESTIMONIAL_EDIT',
    title: `${t.companyName} ${accept ? 'approved' : 'declined'} your testimonial edit`,
    link: '/admin/feedback?tab=testimonials',
    entityType: 'testimonial',
    entityId: id,
  });
  return saved;
}

// ─── admin ───────────────────────────────────────────────

export async function adminReviews(customerId?: string) {
  const where: Prisma.TaskFeedbackWhereInput = customerId ? { customerId } : {};
  const [reviews, pending, all, customers] = await Promise.all([
    prisma.taskFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        task: { select: { title: true, taskNumber: true, completedAt: true } },
        customer: { select: { id: true, clientId: true, companyName: true, tradingAs: true } },
      },
    }),
    pendingTasks(customerId ? [customerId] : undefined),
    prisma.taskFeedback.findMany({ where, select: { rating: true, status: true } }),
    prisma.customer.findMany({
      where: { OR: [{ taskFeedback: { some: {} } }, { tasks: { some: { progress: 'COMPLETED' } } }] },
      select: { id: true, clientId: true, companyName: true, tradingAs: true },
      orderBy: { companyName: 'asc' },
    }),
  ]);
  const total = all.length;
  const avg = total ? all.reduce((n, r) => n + r.rating, 0) / total : null;
  const co = (c: { id: string; clientId: string; companyName: string | null; tradingAs: string | null }) => ({
    id: c.id,
    clientId: c.clientId,
    name: companyLabel(c),
  });
  return {
    stats: {
      total,
      average: avg === null ? null : Math.round(avg * 10) / 10,
      low: all.filter((r) => r.rating <= LOW_RATING).length,
      published: all.filter((r) => r.status === 'PUBLISHED').length,
      pending: pending.length,
    },
    reviews: reviews.map((r) => ({
      id: r.id,
      customer: co(r.customer),
      taskId: r.taskId,
      taskTitle: r.task.title,
      taskNumber: r.task.taskNumber,
      completedAt: r.task.completedAt,
      clientName: r.clientName,
      rating: r.rating,
      tags: r.tags,
      comment: r.comment,
      displayAs: r.displayAs,
      displayName: r.displayName,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    pending: pending.map((t) => ({
      taskId: t.id,
      taskNumber: t.taskNumber,
      title: t.title,
      completedAt: t.completedAt,
      customer: co(t.customer),
    })),
    customers: customers.map(co),
  };
}

export async function adminSetReviewStatus(id: string, status: (typeof REVIEW_STATUS)[number]) {
  const r = await prisma.taskFeedback.findUnique({ where: { id } });
  if (!r) throw ApiError.notFound('Review not found');
  if (status === 'PUBLISHED' && r.displayAs === 'PRIVATE') {
    throw ApiError.badRequest('The client asked to keep this review team-only, so it cannot be published');
  }
  return prisma.taskFeedback.update({ where: { id }, data: { status } });
}

export async function adminTestimonials() {
  const rows = await prisma.testimonial.findMany({
    orderBy: { createdAt: 'desc' },
    include: { customer: { select: { id: true, clientId: true } } },
  });
  return rows.map(({ customer, ...t }) => ({ ...t, clientId: customer.clientId }));
}

export interface AdminTestimonialPatch {
  service?: string | null;
  featured?: boolean;
  pendingQuote?: string | null;
}

export async function adminUpdateTestimonial(id: string, patch: AdminTestimonialPatch) {
  const t = await prisma.testimonial.findUnique({ where: { id } });
  if (!t) throw ApiError.notFound('Testimonial not found');
  const data: Prisma.TestimonialUpdateInput = {};
  if (patch.service !== undefined) data.service = patch.service?.trim() || null;
  if (patch.featured !== undefined) {
    if (patch.featured && (t.status !== 'APPROVED' || !t.uses.includes('WEBSITE'))) {
      throw ApiError.badRequest('Only approved testimonials the client allowed on the website can be featured');
    }
    data.featured = patch.featured;
  }
  if (patch.pendingQuote !== undefined) {
    if (t.status === 'WITHDRAWN') throw ApiError.badRequest('This testimonial was withdrawn by the client');
    const q = patch.pendingQuote?.trim();
    if (q && q !== t.quote) {
      // Our edit goes back to the client; it isn't used until they approve it.
      data.pendingQuote = q;
      data.status = 'WITH_CUSTOMER';
      data.featured = false;
    } else {
      data.pendingQuote = null;
      if (t.status === 'WITH_CUSTOMER') data.status = 'APPROVED';
    }
  }
  const saved = await prisma.testimonial.update({ where: { id }, data });
  if (saved.status === 'WITH_CUSTOMER' && t.status !== 'WITH_CUSTOMER') {
    void notifyClients(t.customerId, {
      type: 'TESTIMONIAL_EDIT',
      title: 'Please check our edit to your testimonial',
      body: 'We tidied the wording. It is only used once you approve it.',
      link: '/client/feedback',
    });
  }
  return saved;
}

async function notifyClients(customerId: string, msg: { type: string; title: string; body?: string; link: string }) {
  const users = await prisma.clientUser.findMany({ where: { customerId, isActive: true }, select: { id: true } });
  for (const u of users) notify({ ...msg, userId: u.id, userType: Role.CLIENT });
  return users.length;
}

/** Invite a company's portal users to share a testimonial. */
export async function requestTestimonial(customerId: string) {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!c) throw ApiError.notFound('Customer not found');
  const sent = await notifyClients(customerId, {
    type: 'TESTIMONIAL_REQUEST',
    title: 'Would you share a testimonial?',
    body: 'A few words about working with us. About 3 minutes, and nothing is used until you approve it.',
    link: '/client/feedback/testimonial',
  });
  if (!sent) throw ApiError.badRequest('This company has no active portal users to ask');
  return { sent };
}

/** Featured testimonials for the public website widget (client-approved, website use allowed). */
export async function publicTestimonials() {
  const rows = await prisma.testimonial.findMany({
    where: { featured: true, status: 'APPROVED', uses: { has: 'WEBSITE' } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { id: true, quote: true, personName: true, jobTitle: true, companyName: true, service: true, photoUrl: true },
  });
  return rows;
}
