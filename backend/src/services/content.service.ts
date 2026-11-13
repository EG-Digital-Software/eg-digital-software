import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { notify } from './notification.service.js';
import * as meta from './social/meta.service.js';
import * as publish from './social/meta.publish.js';
import type { Actor } from './social/social.service.js';

/**
 * Content Calendar (a task tab, switched on per task by the admin/team).
 *
 * The team plans posts — a design from the task's attachments plus caption,
 * hashtags and an optional first comment — on a monthly calendar. A post goes
 * to the client for approval; only an approved post can be scheduled. At its
 * time the scheduler publishes it to the chosen platforms through the
 * customer's Meta connection (the same one the Social Media Dashboard uses),
 * while auto-publish is on for the task. Every attempt is logged per platform.
 *
 * Status flow:
 *   DRAFT → AWAITING_APPROVAL → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED
 *                    ↘ CHANGES_REQUESTED (back to the team)     ↘ FAILED (retry)
 * Changing the design or caption of an approved post sends it back to DRAFT.
 */

export const PLATFORMS = ['fb', 'ig'] as const;
type Platform = (typeof PLATFORMS)[number];
const PLATFORM_NAME: Record<Platform, string> = { fb: 'Facebook', ig: 'Instagram' };

export const TIME_ZONES = ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth', 'Australia/Hobart', 'Australia/Darwin'] as const;

const isStaff = (a: Actor) => a.type !== 'CLIENT';
/** The client decides, like the Approval tab; an admin may record a decision for them. Team members cannot. */
const canDecide = (a: Actor) => a.type === 'CLIENT' || a.type === 'SUPER_ADMIN';

/** Statuses after the client approved. */
const APPROVED_STATES = ['APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED'];

interface ActivityItem {
  label: string;
  meta: string;
  kind: 'info' | 'good' | 'bad' | 'plan';
  at: string;
}

const MAX = { title: 120, caption: 5000, hashtags: 1000, comment: 1000 };
const IG = { caption: 2200, hashtags: 30, imageBytes: 8 * 1024 * 1024, videoBytes: 300 * 1024 * 1024, minRatio: 0.8, maxRatio: 1.91 };
const FB = { caption: 63206, imageBytes: 10 * 1024 * 1024, videoBytes: 1024 * 1024 * 1024 };

// ─── Access ────────────────────────────────────────────────

export async function ensureCalendarTask(customerId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, customerId },
    select: { id: true, title: true, showContentCalendar: true, contentAutoPublish: true },
  });
  if (!task) throw ApiError.notFound('Task not found');
  if (!task.showContentCalendar) throw ApiError.notFound('The Content Calendar is not switched on for this task');
  return task;
}

function requireStaff(a: Actor) {
  if (!isStaff(a)) throw ApiError.forbidden('Only the admin or team can change the content calendar');
}

async function findPost(customerId: string, taskId: string, postId: string) {
  const post = await prisma.contentPost.findFirst({ where: { id: postId, taskId, customerId } });
  if (!post) throw ApiError.notFound('Post not found');
  return post;
}

function stamp(actor: Actor | string, at = new Date()) {
  const who = typeof actor === 'string' ? actor : actor.name;
  return `${who} · ${at.toISOString()}`;
}

function withActivity(post: { activity: Prisma.JsonValue }, item: Omit<ActivityItem, 'at'>): Prisma.InputJsonValue {
  const list = Array.isArray(post.activity) ? (post.activity as unknown as ActivityItem[]) : [];
  return [...list, { ...item, at: new Date().toISOString() }].slice(-100) as unknown as Prisma.InputJsonValue;
}

// ─── Connection + checks ───────────────────────────────────

type MetaConn = Awaited<ReturnType<typeof loadMetaConnection>>;

async function loadMetaConnection(customerId: string) {
  return prisma.socialConnection.findUnique({ where: { customerId_provider: { customerId, provider: 'meta' } } });
}

/** What each platform can do for this customer right now. */
function platformState(conn: MetaConn) {
  const scopes = new Set((conn?.scopes ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  // Older connections may not have recorded their permissions — Meta then has the final word.
  const hasScopes = (need: readonly string[]) => scopes.size === 0 || need.every((s) => scopes.has(s));
  const targets = conn ? publish.resolveTargets(conn) : { fb: null, ig: null };
  const expired = conn?.status === 'EXPIRED';
  const one = (p: Platform, t: { name: string } | null) => {
    const connected = !!conn && !!t;
    const canPublish = connected && !expired && hasScopes(publish.PUBLISH_SCOPES[p]);
    let note: string;
    if (!conn) note = 'Not connected · Connect Meta in Accounts';
    else if (!t) note = p === 'fb' ? 'No Facebook Page selected on the Meta connection' : 'No Instagram account linked to the selected Page';
    else if (expired) note = 'Connection expired · Reconnect Meta';
    else if (!hasScopes(publish.PUBLISH_SCOPES[p])) note = 'Connected, but publishing permission not granted · Reconnect Meta';
    else note = p === 'fb' ? 'Connected · Page post' : 'Connected · Feed post';
    return { key: p, name: t ? `${PLATFORM_NAME[p]} · ${t.name}` : PLATFORM_NAME[p], connected, canPublish, note };
  };
  return { fb: one('fb', targets.fb), ig: one('ig', targets.ig) };
}

type PostRow = Prisma.ContentPostGetPayload<object>;

interface Check {
  ok: boolean;
  title: string;
  detail: string;
}

function hashtagCount(text: string) {
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function composeMessage(p: { caption: string; hashtags: string }) {
  return [p.caption.trim(), p.hashtags.trim()].filter(Boolean).join('\n\n');
}

/** Pre-publish checks. Scheduling and publishing need every one of them to pass. */
function checksFor(post: PostRow, platforms: ReturnType<typeof platformState>): Check[] {
  const chosen = post.platforms.filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p));
  const out: Check[] = [];

  out.push(
    APPROVED_STATES.includes(post.status) && post.approvedAt
      ? { ok: true, title: 'Client approved', detail: `Approved by ${post.approvedByName ?? 'the client'}` }
      : { ok: false, title: 'Client approval', detail: post.status === 'AWAITING_APPROVAL' ? 'Waiting for the client to approve' : 'Send the post to the client for approval' }
  );

  out.push(chosen.length ? { ok: true, title: 'Platforms chosen', detail: chosen.map((p) => PLATFORM_NAME[p]).join(' and ') } : { ok: false, title: 'Platforms chosen', detail: 'Choose at least one platform' });

  // Design
  const video = !!post.mediaType?.startsWith('video/');
  if (!post.mediaUrl) {
    out.push(
      chosen.includes('ig')
        ? { ok: false, title: 'Design', detail: 'Instagram needs an image or video — pick a design from Attachments' }
        : { ok: true, title: 'Design', detail: 'No design — Facebook will publish a text post' }
    );
  } else {
    const problems: string[] = [];
    const size = post.mediaSize ?? 0;
    const type = (post.mediaType ?? '').toLowerCase();
    if (chosen.includes('ig')) {
      if (video) {
        if (!['video/mp4', 'video/quicktime'].includes(type)) problems.push('Instagram takes MP4 or MOV videos');
        if (size > IG.videoBytes) problems.push('Instagram videos must be under 300 MB');
      } else {
        if (!['image/jpeg', 'image/jpg'].includes(type)) problems.push('Instagram takes JPEG images only');
        if (size > IG.imageBytes) problems.push('Instagram images must be under 8 MB');
        if (post.mediaWidth && post.mediaHeight) {
          const r = post.mediaWidth / post.mediaHeight;
          if (r < IG.minRatio - 0.005 || r > IG.maxRatio + 0.005) problems.push(`Instagram needs a shape between 4:5 and 1.91:1 (this is ${post.mediaWidth} × ${post.mediaHeight})`);
        }
      }
    }
    if (chosen.includes('fb')) {
      if (!video && !/^image\/(jpeg|jpg|png|gif|bmp|tiff|webp)$/.test(type)) problems.push('Facebook takes JPEG, PNG, GIF, BMP, TIFF or WebP images');
      if (!video && size > FB.imageBytes) problems.push('Facebook images must be under 10 MB');
      if (video && size > FB.videoBytes) problems.push('Facebook videos must be under 1 GB');
    }
    const dims = post.mediaWidth && post.mediaHeight ? ` · ${post.mediaWidth} × ${post.mediaHeight}` : '';
    out.push(
      problems.length
        ? { ok: false, title: 'Design fits the platforms', detail: problems.join('; ') }
        : { ok: true, title: 'Design fits the platforms', detail: `${post.mediaName ?? 'Design'}${dims}` }
    );
    // Meta downloads the file from our storage, so it must be on a public https address.
    out.push(
      /^https:\/\//i.test(post.mediaUrl)
        ? { ok: true, title: 'Design is online', detail: 'Meta can download the file' }
        : { ok: false, title: 'Design is online', detail: 'The file is stored on this computer only — upload it on the live portal' }
    );
  }

  // Caption
  const message = composeMessage(post);
  const capProblems: string[] = [];
  if (chosen.includes('ig') && message.length > IG.caption) capProblems.push(`Instagram allows ${IG.caption.toLocaleString()} characters (this is ${message.length.toLocaleString()})`);
  if (chosen.includes('ig') && hashtagCount(message) > IG.hashtags) capProblems.push(`Instagram allows ${IG.hashtags} hashtags (this has ${hashtagCount(message)})`);
  if (chosen.includes('fb') && message.length > FB.caption) capProblems.push('Too long for Facebook');
  if (!message && !post.mediaUrl) capProblems.push('Write a caption or add a design');
  out.push(capProblems.length ? { ok: false, title: 'Caption length', detail: capProblems.join('; ') } : { ok: true, title: 'Caption length', detail: 'Within limits for the selected platforms' });

  // Accounts
  const notReady = chosen.filter((p) => !platforms[p].canPublish);
  out.push(
    !chosen.length
      ? { ok: false, title: 'Accounts connected', detail: 'Choose a platform first' }
      : notReady.length
        ? { ok: false, title: 'Accounts connected', detail: notReady.map((p) => `${PLATFORM_NAME[p]}: ${platforms[p].note}`).join('; ') }
        : { ok: true, title: 'Accounts connected', detail: `${chosen.map((p) => PLATFORM_NAME[p]).join(' and ')} ready to publish` }
  );
  return out;
}

// ─── Reading ───────────────────────────────────────────────

function shapePost(p: PostRow & { logs?: { platform: string; result: string; permalink: string | null; createdAt: Date }[] }, platforms: ReturnType<typeof platformState>) {
  const published: Record<string, string | null> = {};
  for (const l of p.logs ?? []) if (l.result === 'PUBLISHED') published[l.platform] = l.permalink;
  return {
    id: p.id,
    title: p.title,
    caption: p.caption,
    hashtags: p.hashtags,
    firstComment: p.firstComment,
    media: p.mediaUrl ? { url: p.mediaUrl, name: p.mediaName, type: p.mediaType, size: p.mediaSize, width: p.mediaWidth, height: p.mediaHeight } : null,
    platforms: p.platforms,
    scheduledAt: p.scheduledAt,
    timeZone: p.timeZone,
    status: p.status,
    approvedAt: p.approvedAt,
    approvedByName: p.approvedByName,
    publishedAt: p.publishedAt,
    lastError: p.lastError,
    activity: p.activity,
    createdByName: p.createdByName,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    published,
    checks: checksFor(p, platforms),
  };
}

export async function getCalendar(customerId: string, taskId: string, viewer: Actor) {
  const task = await ensureCalendarTask(customerId, taskId);
  const [posts, conn, logs, attachments, customer] = await Promise.all([
    prisma.contentPost.findMany({
      where: { taskId },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      include: { logs: { select: { platform: true, result: true, permalink: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
    }),
    loadMetaConnection(customerId),
    prisma.contentPublishLog.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' }, take: 50, include: { post: { select: { title: true } } } }),
    // Designs come from the task's Attachments tab (images and videos only).
    prisma.taskAttachment.findMany({
      where: { taskId, kind: 'TASK', commentId: null, approvalId: null, OR: [{ contentType: { startsWith: 'image/' } }, { contentType: { startsWith: 'video/' } }] },
      orderBy: { createdAt: 'desc' },
      select: { id: true, fileName: true, url: true, size: true, contentType: true, createdAt: true },
    }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { companyName: true, tradingAs: true } }),
  ]);
  const platforms = platformState(conn);
  return {
    customerName: customer?.tradingAs || customer?.companyName || '',
    taskTitle: task.title,
    autoPublish: task.contentAutoPublish,
    canEdit: isStaff(viewer),
    canApprove: canDecide(viewer),
    viewer: { name: viewer.name, role: viewer.type },
    metaConfigured: meta.metaConfigured(),
    connection: conn
      ? {
          id: conn.id,
          name: conn.externalName,
          status: conn.status,
          lastError: conn.lastError,
          tokenExpiresAt: conn.tokenExpiresAt,
          connectedByName: conn.connectedByName,
          connectedAt: conn.createdAt,
          scopes: conn.scopes,
          assets: {
            pages: ((conn.assets as unknown as meta.MetaAssets)?.pages ?? []).map((p) => ({ id: p.id, name: p.name, ig: p.ig })),
          },
          selected: conn.selected,
        }
      : null,
    platforms: [platforms.fb, platforms.ig],
    timeZones: TIME_ZONES,
    posts: posts.map((p) => shapePost(p, platforms)),
    log: logs.map((l) => ({
      id: l.id,
      postId: l.postId,
      post: l.post.title,
      platform: l.platform,
      result: l.result,
      permalink: l.permalink,
      error: l.error,
      trigger: l.trigger,
      at: l.createdAt,
    })),
    attachments,
  };
}

// ─── Writing (team) ────────────────────────────────────────

export interface PostInput {
  title?: string;
  caption?: string;
  hashtags?: string;
  firstComment?: string;
  /** A file from the task's Attachments tab; null clears the design. */
  attachmentId?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  platforms?: string[];
  scheduledAt?: string | null;
  timeZone?: string;
}

function clean(input: PostInput) {
  const s = (v: unknown, max: number, label: string) => {
    if (v === undefined) return undefined;
    if (typeof v !== 'string') throw ApiError.badRequest(`${label} must be text`);
    if (v.length > max) throw ApiError.badRequest(`${label} is too long (max ${max} characters)`);
    return v;
  };
  const dim = (v: unknown) => (v === undefined ? undefined : v === null ? null : Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) < 100_000 ? Math.round(Number(v)) : null);
  let scheduledAt: Date | null | undefined;
  if (input.scheduledAt !== undefined) {
    if (input.scheduledAt === null || input.scheduledAt === '') scheduledAt = null;
    else {
      const d = new Date(input.scheduledAt);
      if (Number.isNaN(d.getTime())) throw ApiError.badRequest('The schedule date is not valid');
      scheduledAt = d;
    }
  }
  if (input.timeZone !== undefined && !(TIME_ZONES as readonly string[]).includes(input.timeZone)) throw ApiError.badRequest('Unknown time zone');
  let platforms: string[] | undefined;
  if (input.platforms !== undefined) {
    if (!Array.isArray(input.platforms)) throw ApiError.badRequest('Platforms must be a list');
    platforms = [...new Set(input.platforms.filter((p) => (PLATFORMS as readonly string[]).includes(p)))];
  }
  const title = s(input.title, MAX.title, 'Title');
  if (title !== undefined && !title.trim()) throw ApiError.badRequest('Give the post a title');
  return {
    title: title?.trim(),
    caption: s(input.caption, MAX.caption, 'Caption'),
    hashtags: s(input.hashtags, MAX.hashtags, 'Hashtags'),
    firstComment: s(input.firstComment, MAX.comment, 'First comment'),
    mediaWidth: dim(input.mediaWidth),
    mediaHeight: dim(input.mediaHeight),
    platforms,
    scheduledAt,
    timeZone: input.timeZone,
  };
}

async function mediaFromAttachment(taskId: string, attachmentId: string) {
  const a = await prisma.taskAttachment.findFirst({ where: { id: attachmentId, taskId, kind: 'TASK' } });
  if (!a) throw ApiError.badRequest('That file is not in this task’s attachments');
  if (!a.contentType?.startsWith('image/') && !a.contentType?.startsWith('video/')) throw ApiError.badRequest('Pick an image or video as the design');
  return { mediaUrl: a.url, mediaName: a.fileName, mediaType: a.contentType, mediaSize: a.size };
}

export async function createPost(customerId: string, taskId: string, actor: Actor, input: PostInput) {
  requireStaff(actor);
  await ensureCalendarTask(customerId, taskId);
  const c = clean(input);
  if (!c.title) throw ApiError.badRequest('Give the post a title');
  const media = input.attachmentId ? await mediaFromAttachment(taskId, input.attachmentId) : {};
  const post = await prisma.contentPost.create({
    data: {
      taskId,
      customerId,
      title: c.title,
      caption: c.caption ?? '',
      hashtags: c.hashtags ?? '',
      firstComment: c.firstComment ?? '',
      ...media,
      mediaWidth: input.attachmentId ? c.mediaWidth ?? null : null,
      mediaHeight: input.attachmentId ? c.mediaHeight ?? null : null,
      platforms: c.platforms ?? [],
      scheduledAt: c.scheduledAt ?? null,
      timeZone: c.timeZone ?? 'Australia/Sydney',
      createdById: actor.id,
      createdByName: actor.name,
      activity: [{ label: 'Post created', meta: stamp(actor), kind: 'info', at: new Date().toISOString() }] as unknown as Prisma.InputJsonValue,
    },
  });
  return { id: post.id };
}

export async function updatePost(customerId: string, taskId: string, postId: string, actor: Actor, input: PostInput) {
  requireStaff(actor);
  await ensureCalendarTask(customerId, taskId);
  const post = await findPost(customerId, taskId, postId);
  if (post.status === 'PUBLISHING') throw ApiError.badRequest('This post is being published right now');
  if (post.status === 'PUBLISHED') throw ApiError.badRequest('A published post cannot be changed');
  const c = clean(input);
  const data: Prisma.ContentPostUpdateInput = {};
  if (c.title !== undefined) data.title = c.title;
  if (c.caption !== undefined) data.caption = c.caption;
  if (c.hashtags !== undefined) data.hashtags = c.hashtags;
  if (c.firstComment !== undefined) data.firstComment = c.firstComment;
  if (input.attachmentId !== undefined) {
    if (input.attachmentId === null) Object.assign(data, { mediaUrl: null, mediaName: null, mediaType: null, mediaSize: null, mediaWidth: null, mediaHeight: null });
    else Object.assign(data, await mediaFromAttachment(taskId, input.attachmentId), { mediaWidth: c.mediaWidth ?? null, mediaHeight: c.mediaHeight ?? null });
  }
  if (c.platforms !== undefined) data.platforms = c.platforms;
  if (c.scheduledAt !== undefined) data.scheduledAt = c.scheduledAt;
  if (c.timeZone !== undefined) data.timeZone = c.timeZone;

  // What the client approved is the design and the words. Changing either sends it back.
  const contentChanged =
    (c.caption !== undefined && c.caption !== post.caption) ||
    (c.hashtags !== undefined && c.hashtags !== post.hashtags) ||
    (c.firstComment !== undefined && c.firstComment !== post.firstComment) ||
    (input.attachmentId !== undefined && (data.mediaUrl ?? null) !== post.mediaUrl);
  const items: Omit<ActivityItem, 'at'>[] = [];
  if (contentChanged && APPROVED_STATES.includes(post.status)) {
    data.status = 'DRAFT';
    data.approvedAt = null;
    data.approvedByName = null;
    items.push({ label: 'Design or caption changed after approval — needs approval again', meta: stamp(actor), kind: 'bad' });
  } else if (contentChanged && post.status === 'AWAITING_APPROVAL') {
    items.push({ label: 'Edited while waiting for approval', meta: stamp(actor), kind: 'info' });
  }
  // A scheduled post whose time is cleared drops back to approved.
  if (post.status === 'SCHEDULED' && !contentChanged && c.scheduledAt === null) {
    data.status = 'APPROVED';
    items.push({ label: 'Schedule removed', meta: stamp(actor), kind: 'info' });
  } else if (post.status === 'SCHEDULED' && !contentChanged && c.scheduledAt && c.scheduledAt.getTime() !== post.scheduledAt?.getTime()) {
    if (c.scheduledAt.getTime() < Date.now()) throw ApiError.badRequest('Pick a time in the future');
    items.push({ label: 'Schedule changed', meta: stamp(actor), kind: 'plan' });
  }
  if (post.status === 'SCHEDULED' && !contentChanged && c.platforms !== undefined && !c.platforms.length) throw ApiError.badRequest('A scheduled post needs at least one platform');

  let activity: Prisma.JsonValue = post.activity;
  for (const it of items) activity = withActivity({ activity }, it) as Prisma.JsonValue;
  if (items.length) data.activity = activity as Prisma.InputJsonValue;
  await prisma.contentPost.update({ where: { id: post.id }, data });
  return { ok: true };
}

export async function deletePost(customerId: string, taskId: string, postId: string, actor: Actor) {
  requireStaff(actor);
  await ensureCalendarTask(customerId, taskId);
  const post = await findPost(customerId, taskId, postId);
  if (post.status === 'PUBLISHING') throw ApiError.badRequest('This post is being published right now');
  // Only the calendar entry is removed — a post already on Facebook/Instagram stays there.
  await prisma.contentPost.delete({ where: { id: post.id } });
  return { ok: true };
}

export async function setAutoPublish(customerId: string, taskId: string, actor: Actor, on: boolean) {
  requireStaff(actor);
  await ensureCalendarTask(customerId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { contentAutoPublish: !!on } });
  return { autoPublish: !!on };
}

// ─── Approval ──────────────────────────────────────────────

export async function requestApproval(customerId: string, taskId: string, postId: string, actor: Actor) {
  requireStaff(actor);
  const task = await ensureCalendarTask(customerId, taskId);
  const post = await findPost(customerId, taskId, postId);
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(post.status)) throw ApiError.badRequest('This post is not a draft');
  if (!post.mediaUrl && !post.caption.trim()) throw ApiError.badRequest('Add a design or a caption before sending it for approval');
  await prisma.contentPost.update({
    where: { id: post.id },
    data: { status: 'AWAITING_APPROVAL', activity: withActivity(post, { label: 'Sent to client for approval', meta: stamp(actor), kind: 'info' }) },
  });
  // Let the customer's client logins know there is something to approve.
  const clients = await prisma.clientUser.findMany({ where: { customerId, isActive: true, approvalStatus: 'APPROVED' }, select: { id: true } });
  for (const c of clients) {
    notify({
      userId: c.id,
      userType: 'CLIENT',
      type: 'CONTENT_APPROVAL',
      title: 'Post waiting for your approval',
      body: `${task.title} — Content Calendar: ${post.title}`,
      link: '/client/tasks',
      entityType: 'task',
      entityId: taskId,
    });
  }
  return { ok: true };
}

export async function decide(customerId: string, taskId: string, postId: string, actor: Actor, approve: boolean, note?: string) {
  if (!canDecide(actor)) throw ApiError.forbidden('Only the client or an admin can approve posts');
  await ensureCalendarTask(customerId, taskId);
  const post = await findPost(customerId, taskId, postId);
  if (post.status !== 'AWAITING_APPROVAL') throw ApiError.badRequest('This post is not waiting for approval');
  const text = typeof note === 'string' ? note.trim().slice(0, 1000) : '';
  const onBehalf = actor.type === 'SUPER_ADMIN' ? ' (admin, for the client)' : '';
  await prisma.contentPost.update({
    where: { id: post.id },
    data: approve
      ? {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedByName: `${actor.name}${onBehalf}`,
          activity: withActivity(post, { label: text ? `Approved — “${text}”` : 'Approved', meta: stamp(`${actor.name}${onBehalf}`), kind: 'good' }),
        }
      : {
          status: 'CHANGES_REQUESTED',
          activity: withActivity(post, { label: text ? `Changes requested — “${text}”` : 'Changes requested', meta: stamp(`${actor.name}${onBehalf}`), kind: 'bad' }),
        },
  });
  if (post.createdById) {
    const creator = await prisma.adminUser.findUnique({ where: { id: post.createdById }, select: { id: true } });
    const employee = creator ? null : await prisma.employeeUser.findUnique({ where: { id: post.createdById }, select: { id: true } });
    const target = creator ? { userId: creator.id, userType: 'SUPER_ADMIN' as const } : employee ? { userId: employee.id, userType: 'EMPLOYEE' as const } : null;
    if (target && target.userId !== actor.id) {
      notify({
        ...target,
        type: 'CONTENT_APPROVAL',
        title: approve ? 'Post approved' : 'Changes requested on a post',
        body: `${post.title}${text ? ` — ${text.slice(0, 140)}` : ''}`,
        link: target.userType === 'SUPER_ADMIN' ? '/admin/tasks' : '/employee/tasks',
        entityType: 'task',
        entityId: taskId,
      });
    }
  }
  return { ok: true };
}

// ─── Scheduling + publishing ───────────────────────────────

function failedChecks(post: PostRow, platforms: ReturnType<typeof platformState>) {
  return checksFor(post, platforms).filter((c) => !c.ok);
}

export async function schedule(customerId: string, taskId: string, postId: string, actor: Actor) {
  requireStaff(actor);
  await ensureCalendarTask(customerId, taskId);
  const post = await findPost(customerId, taskId, postId);
  if (!['APPROVED', 'FAILED'].includes(post.status)) throw ApiError.badRequest(post.status === 'SCHEDULED' ? 'This post is already scheduled' : 'Only an approved post can be scheduled');
  if (!post.scheduledAt) throw ApiError.badRequest('Choose a date and time first');
  if (post.scheduledAt.getTime() < Date.now()) throw ApiError.badRequest('Pick a time in the future (or use Publish now)');
  const bad = failedChecks(post, platformState(await loadMetaConnection(customerId)));
  if (bad.length) throw ApiError.badRequest(`Not ready to schedule: ${bad.map((c) => `${c.title} — ${c.detail}`).join('; ')}`);
  await prisma.contentPost.update({
    where: { id: post.id },
    data: {
      status: 'SCHEDULED',
      lastError: null,
      activity: withActivity(post, { label: `Scheduled for ${post.platforms.map((p) => PLATFORM_NAME[p as Platform] ?? p).join(' and ')}`, meta: stamp(actor), kind: 'plan' }),
    },
  });
  return { ok: true };
}

export async function unschedule(customerId: string, taskId: string, postId: string, actor: Actor) {
  requireStaff(actor);
  await ensureCalendarTask(customerId, taskId);
  const post = await findPost(customerId, taskId, postId);
  if (post.status !== 'SCHEDULED') throw ApiError.badRequest('This post is not scheduled');
  await prisma.contentPost.update({
    where: { id: post.id },
    data: { status: 'APPROVED', activity: withActivity(post, { label: 'Unscheduled', meta: stamp(actor), kind: 'info' }) },
  });
  return { ok: true };
}

/** Publish now (in the background — the page follows the status). */
export async function publishNow(customerId: string, taskId: string, postId: string, actor: Actor) {
  requireStaff(actor);
  await ensureCalendarTask(customerId, taskId);
  const post = await findPost(customerId, taskId, postId);
  if (!['APPROVED', 'SCHEDULED', 'FAILED'].includes(post.status)) throw ApiError.badRequest('Only an approved post can be published');
  const bad = failedChecks(post, platformState(await loadMetaConnection(customerId)));
  if (bad.length) throw ApiError.badRequest(`Not ready to publish: ${bad.map((c) => `${c.title} — ${c.detail}`).join('; ')}`);
  const claimed = await claim(post.id, post.status);
  if (!claimed) throw ApiError.conflict('This post is already being published');
  void runPublish(post.id, actor.name).catch((err) => logger.error({ err, postId: post.id }, 'Content publish failed'));
  return { ok: true };
}

/** Move a post to PUBLISHING only if nobody else did first (scheduler and Publish now can race). */
async function claim(postId: string, from: string) {
  const r = await prisma.contentPost.updateMany({ where: { id: postId, status: from }, data: { status: 'PUBLISHING', lastError: null } });
  return r.count === 1;
}

/** Publish a claimed (PUBLISHING) post to each chosen platform not already published. */
async function runPublish(postId: string, trigger: string) {
  const post = await prisma.contentPost.findUnique({ where: { id: postId }, include: { logs: true } });
  if (!post || post.status !== 'PUBLISHING') return;
  const conn = await loadMetaConnection(post.customerId);
  const targets = conn ? publish.resolveTargets(conn) : { fb: null, ig: null };
  const done = new Set(post.logs.filter((l) => l.result === 'PUBLISHED').map((l) => l.platform));
  const content: publish.PublishContent = {
    message: composeMessage(post),
    mediaUrl: post.mediaUrl,
    mediaType: post.mediaType,
    firstComment: post.firstComment,
  };
  const errors: string[] = [];
  const notes: string[] = [];
  let expired = false;
  for (const p of post.platforms) {
    if (done.has(p)) continue;
    const name = PLATFORM_NAME[p as Platform] ?? p;
    try {
      let res: publish.PublishResult;
      if (p === 'fb') {
        if (!targets.fb?.token) throw new Error('No Facebook Page connected');
        res = await publish.publishFacebook(targets.fb.pageId, targets.fb.token, content);
      } else if (p === 'ig') {
        if (!targets.ig?.token) throw new Error('No Instagram account connected');
        res = await publish.publishInstagram(targets.ig.igId, targets.ig.token, content);
      } else throw new Error('This platform cannot be published to');
      await prisma.contentPublishLog.create({
        data: { postId, taskId: post.taskId, customerId: post.customerId, platform: p, result: 'PUBLISHED', externalId: res.externalId, permalink: res.permalink, error: res.warning ?? null, trigger },
      });
      if (res.warning) notes.push(`${name}: ${res.warning}`);
    } catch (err) {
      const msg = (err as Error).message.slice(0, 500);
      if (err instanceof meta.MetaError && err.expired) expired = true;
      errors.push(`${name}: ${msg}`);
      await prisma.contentPublishLog.create({ data: { postId, taskId: post.taskId, customerId: post.customerId, platform: p, result: 'FAILED', error: msg, trigger } });
    }
  }
  if (expired && conn) {
    await prisma.socialConnection.update({ where: { id: conn.id }, data: { status: 'EXPIRED', lastError: 'Connection expired while publishing' } }).catch(() => undefined);
  }
  const who = trigger === 'auto' ? 'Auto-publish' : trigger;
  const fresh = await prisma.contentPost.findUnique({ where: { id: postId }, select: { activity: true } });
  const ok = errors.length === 0;
  await prisma.contentPost.update({
    where: { id: postId },
    data: {
      status: ok ? 'PUBLISHED' : 'FAILED',
      publishedAt: ok ? new Date() : undefined,
      lastError: ok ? (notes.length ? notes.join('; ') : null) : errors.join('; '),
      activity: withActivity(fresh ?? post, ok ? { label: 'Published', meta: stamp(who), kind: 'good' } : { label: `Failed to publish — ${errors.join('; ')}`, meta: stamp(who), kind: 'bad' }),
    },
  });
}

/**
 * Scheduler (every minute): publish scheduled posts whose time has come on tasks
 * with auto-publish on. Posts left PUBLISHING by a restart are marked failed so
 * they can be retried (only platforms not yet published are tried again).
 */
export async function runDueContentPosts() {
  const stuckBefore = new Date(Date.now() - 20 * 60_000);
  const stuck = await prisma.contentPost.findMany({ where: { status: 'PUBLISHING', updatedAt: { lt: stuckBefore } }, select: { id: true, activity: true } });
  for (const s of stuck) {
    await prisma.contentPost.update({
      where: { id: s.id },
      data: { status: 'FAILED', lastError: 'Publishing was interrupted — press Publish now to retry', activity: withActivity(s, { label: 'Publishing was interrupted', meta: stamp('Auto-publish'), kind: 'bad' }) },
    });
  }
  const due = await prisma.contentPost.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() }, task: { showContentCalendar: true, contentAutoPublish: true } },
    select: { id: true },
    orderBy: { scheduledAt: 'asc' },
    take: 20,
  });
  for (const d of due) {
    if (!(await claim(d.id, 'SCHEDULED'))) continue;
    await runPublish(d.id, 'auto').catch((err) => logger.error({ err, postId: d.id }, 'Auto-publish failed'));
  }
  return { published: due.length, recovered: stuck.length };
}
