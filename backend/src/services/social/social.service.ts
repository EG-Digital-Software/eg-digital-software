import jwt from 'jsonwebtoken';
import { Prisma, type Role } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { encryptSecret } from '../../utils/secretBox.js';
import * as meta from './meta.service.js';
import * as tiktok from './tiktok.service.js';
import { fetchPeriods, type Period } from './meta.periods.js';
import { storage } from '../storage/index.js';
import * as extra from './platforms.sync.js';

/**
 * Social Media Dashboard data. Figures belong to the customer (their accounts),
 * so every task of that customer with the dashboard switched on shows the same
 * numbers; notes, goals, budgets and hand-entered posts/campaigns belong to the
 * task. Nothing here is sample data — an empty dashboard means nothing has been
 * connected or entered yet.
 */

export interface Actor {
  id: string;
  type: Role;
  name: string;
}

/** Organic platforms (dashboard keys) and ad platforms, as stored in SocialMetricDaily.platform. */
export const ORGANIC = ['ig', 'fb', 'tt', 'li', 'yt'] as const;
export const ADS = ['google_ads', 'meta_ads'] as const;
const ALL_PLATFORMS: readonly string[] = [...ORGANIC, ...ADS];

/** First day the dashboard can show (its calendar starts here). */
export const FIRST_DAY = '2025-01-01';

const isStaff = (a: Actor) => a.type !== 'CLIENT';

export async function ensureDashboardTask(customerId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, customerId }, select: { id: true, showSocialDashboard: true } });
  if (!task) throw ApiError.notFound('Task not found');
  if (!task.showSocialDashboard) throw ApiError.notFound('The Social Media Dashboard is not switched on for this task');
  return task;
}

/** Connecting accounts is offered on the Social Media Dashboard and on the Content Calendar. */
async function ensureConnectTask(customerId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, customerId }, select: { id: true, showSocialDashboard: true, showContentCalendar: true } });
  if (!task) throw ApiError.notFound('Task not found');
  if (!task.showSocialDashboard && !task.showContentCalendar) throw ApiError.notFound('Social accounts are not used on this task');
  return task;
}

// ─── Reading ────────────────────────────────────────────────

/** Platforms a connection fills automatically (so hand-entered figures are not accepted for them). */
function connectedPlatforms(conns: { provider: string; status: string; selected: Prisma.JsonValue }[]) {
  const out = new Set<string>();
  for (const c of conns) {
    if (c.provider === 'tiktok') {
      out.add('tt');
      continue;
    }
    if (extra.isExtra(c.provider)) {
      for (const p of extra.platformsOf(c)) out.add(p);
      continue;
    }
    if (c.provider !== 'meta') continue;
    const s = (c.selected ?? {}) as meta.MetaSelection;
    if (s.pageId) out.add('fb');
    if (s.igId) out.add('ig');
    if (s.adAccountId) out.add('meta_ads');
  }
  return out;
}

function shapeConnection(c: {
  id: string;
  provider: string;
  externalName: string | null;
  status: string;
  lastError: string | null;
  lastSyncAt: Date | null;
  tokenExpiresAt: Date | null;
  connectedByName: string;
  createdAt: Date;
  assets: Prisma.JsonValue;
  selected: Prisma.JsonValue;
}) {
  const assets = (c.assets ?? {}) as Partial<meta.MetaAssets>;
  return {
    id: c.id,
    provider: c.provider,
    name: c.externalName,
    status: c.status,
    lastError: c.lastError,
    lastSyncAt: c.lastSyncAt,
    tokenExpiresAt: c.tokenExpiresAt,
    connectedByName: c.connectedByName,
    connectedAt: c.createdAt,
    // Never send tokens to the browser — names and ids only.
    assets:
      c.provider === 'tiktok'
        ? { pages: [], adAccounts: [], profile: tiktok.publicProfile(c.assets) }
        : extra.isExtra(c.provider)
          ? extra.shape(c)
          : {
            pages: (assets.pages ?? []).map((p) => ({ id: p.id, name: p.name, ig: p.ig })),
            adAccounts: assets.adAccounts ?? [],
          },
    selected: c.provider === 'tiktok' || c.provider === 'youtube' ? {} : c.selected,
  };
}

const SYNC_STALE_MS = 6 * 3600 * 1000;

export async function getDashboard(customerId: string, taskId: string, viewer: Actor) {
  await ensureDashboardTask(customerId, taskId);
  const [dash, conns, metrics, posts, campaigns, customer] = await Promise.all([
    prisma.socialDashboard.findUnique({ where: { taskId } }),
    prisma.socialConnection.findMany({ where: { customerId } }),
    prisma.socialMetricDaily.findMany({ where: { customerId }, orderBy: { date: 'asc' } }),
    prisma.socialPost.findMany({ where: { customerId }, orderBy: { publishedAt: 'desc' }, take: 500 }),
    prisma.socialCampaignDaily.findMany({ where: { customerId }, orderBy: { date: 'asc' } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { companyName: true, tradingAs: true } }),
  ]);
  const periodRows = await prisma.socialPeriodValue.findMany({
    where: { customerId, platform: { not: 'meta' } },
    select: { platform: true, metric: true, periodKey: true, value: true, data: true },
  });

  // Refresh connected accounts in the background when the data is a few hours old.
  for (const c of conns) {
    if (c.status === 'ACTIVE' && (!c.lastSyncAt || Date.now() - c.lastSyncAt.getTime() > SYNC_STALE_MS)) {
      void syncConnection(c.id).catch(() => undefined);
    }
  }

  // Compact: { platform: { 'YYYY-MM-DD': [...] } } — organic [reach, eng, newFollowers, clicks, followers|null],
  // ads [spend, clicks, leads, revenue, impressions].
  const m: Record<string, Record<string, (number | null)[]>> = {};
  let lastMetricAt: Date | null = null;
  for (const r of metrics) {
    const day = r.date.toISOString().slice(0, 10);
    const isAds = (ADS as readonly string[]).includes(r.platform);
    (m[r.platform] ??= {})[day] = isAds
      ? [r.spend, r.clicks, r.leads, r.revenue, r.impressions]
      : [r.reach, r.engagements, r.newFollowers, r.linkClicks, r.followers];
    if (!lastMetricAt || r.updatedAt > lastMetricAt) lastMetricAt = r.updatedAt;
  }
  const camps: Record<string, { platform: string; id: string; name: string; active: boolean; days: Record<string, number[]> }> = {};
  for (const r of campaigns) {
    const key = `${r.platform}:${r.campaignId}`;
    const c = (camps[key] ??= { platform: r.platform, id: r.campaignId, name: r.campaignName, active: r.active, days: {} });
    c.name = r.campaignName;
    c.active = r.active;
    c.days[r.date.toISOString().slice(0, 10)] = [r.spend, r.leads, r.revenue];
  }

  // Compact: { platform: { metric: { periodKey: value | data } } }
  const pv: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const r of periodRows) ((pv[r.platform] ??= {})[r.metric] ??= {})[r.periodKey] = r.value ?? r.data;

  const data = (dash?.data ?? {}) as Record<string, unknown>;
  // Team insights progress is the team's own working view — not sent to clients.
  if (!isStaff(viewer)) delete data.insights;

  return {
    customerName: customer?.tradingAs || customer?.companyName || '',
    firstDay: FIRST_DAY,
    canEdit: isStaff(viewer),
    viewer: { name: viewer.name, role: viewer.type },
    providers: {
      meta: meta.metaConfigured(),
      tiktok: tiktok.tiktokConfigured(),
      linkedin: extra.configured('linkedin'),
      youtube: extra.configured('youtube'),
      google_ads: extra.configured('google_ads'),
    },
    connections: conns.map(shapeConnection),
    connected: [...connectedPlatforms(conns)],
    syncing: isSyncing(conns.map((c) => c.id)),
    metrics: m,
    posts: posts.map((p) => ({
      id: p.id,
      pl: p.platform,
      t: p.title,
      type: p.type,
      d: p.publishedAt.toISOString().slice(0, 10),
      reach: p.reach,
      eng: p.engagements,
      shares: p.shares,
      url: p.permalink,
      img: p.imageUrl,
      st: p.stats,
    })),
    campaigns: Object.values(camps),
    periodValues: pv,
    today: new Date().toISOString().slice(0, 10),
    data,
    updatedAt: dash?.updatedAt ?? null,
    updatedByName: dash?.updatedByName ?? null,
    lastMetricAt,
  };
}

// ─── Team edits ─────────────────────────────────────────────

/** Top-level keys of SocialDashboard.data the team may write. */
// manual: Channel insights figures entered by hand, { month: { channel: { metric: [value, % change] } } };
// next: "What we'll do" cards, { month: { channel: [[severity, title, detail, next step]] } }.
const DATA_KEYS = ['budgets', 'goals', 'notes', 'posts', 'campaigns', 'insights', 'meta', 'manual', 'next'] as const;

export async function saveDashboard(customerId: string, taskId: string, actor: Actor, patch: Record<string, unknown>) {
  if (!isStaff(actor)) throw ApiError.forbidden('Only the admin or team can change the dashboard');
  await ensureDashboardTask(customerId, taskId);
  const existing = await prisma.socialDashboard.findUnique({ where: { taskId } });
  const next = { ...((existing?.data ?? {}) as Record<string, unknown>) };
  for (const k of DATA_KEYS) if (patch[k] !== undefined) next[k] = patch[k];
  if (JSON.stringify(next).length > 1_000_000) throw ApiError.badRequest('Too much dashboard data in one save');
  await prisma.socialDashboard.upsert({
    where: { taskId },
    create: { taskId, data: next as Prisma.InputJsonValue, updatedById: actor.id, updatedByName: actor.name },
    update: { data: next as Prisma.InputJsonValue, updatedById: actor.id, updatedByName: actor.name },
  });
  return { ok: true };
}

export interface MetricRowInput {
  platform: string;
  date: string;
  values: number[];
  followers?: number | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Figures the team typed in (or uploaded as CSV) for the platforms that are not connected. */
export async function saveMetrics(customerId: string, taskId: string, actor: Actor, rows: MetricRowInput[]) {
  if (!isStaff(actor)) throw ApiError.forbidden('Only the admin or team can enter figures');
  await ensureDashboardTask(customerId, taskId);
  if (!Array.isArray(rows) || rows.length > 6000) throw ApiError.badRequest('Send at most 6000 rows at a time');
  const conns = await prisma.socialConnection.findMany({ where: { customerId }, select: { provider: true, status: true, selected: true } });
  const auto = connectedPlatforms(conns);
  const today = new Date().toISOString().slice(0, 10);
  const clean = rows.filter(
    (r) =>
      r &&
      ALL_PLATFORMS.includes(r.platform) &&
      !auto.has(r.platform) &&
      ISO_DAY.test(r.date) &&
      r.date >= FIRST_DAY &&
      r.date <= today &&
      Array.isArray(r.values) &&
      r.values.length === 5 &&
      r.values.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
  );
  const ops = clean.map((r) => {
    const isAds = (ADS as readonly string[]).includes(r.platform);
    const v = r.values;
    const fields = isAds
      ? { spend: v[0], clicks: v[1], leads: v[2], revenue: v[3], impressions: v[4] }
      : {
          reach: v[0],
          engagements: v[1],
          newFollowers: v[2],
          linkClicks: v[3],
          ...(r.followers !== undefined ? { followers: r.followers != null && Number.isFinite(r.followers) && r.followers >= 0 ? r.followers : null } : {}),
        };
    const date = new Date(`${r.date}T00:00:00.000Z`);
    return prisma.socialMetricDaily.upsert({
      where: { customerId_platform_date: { customerId, platform: r.platform, date } },
      create: { customerId, platform: r.platform, date, source: 'manual', ...fields },
      update: { source: 'manual', ...fields },
    });
  });
  for (let i = 0; i < ops.length; i += 500) await prisma.$transaction(ops.slice(i, i + 500));
  return { saved: clean.length, skipped: rows.length - clean.length };
}

// ─── Connecting accounts ────────────────────────────────────

export interface OAuthState {
  cid: string;
  tid: string;
  uid: string;
  role: Role;
  name: string;
  provider: string;
}

export async function startConnect(customerId: string, taskId: string, actor: Actor, provider: string) {
  await ensureConnectTask(customerId, taskId);
  if (provider !== 'meta' && provider !== 'tiktok' && !extra.isExtra(provider)) throw ApiError.badRequest('This platform cannot be connected yet');
  if (extra.isExtra(provider) && !extra.configured(provider)) throw ApiError.badRequest('Connecting this platform is not set up yet');
  if (provider === 'meta' && !meta.metaConfigured()) throw ApiError.badRequest('Connecting Meta accounts is not set up yet');
  if (provider === 'tiktok' && !tiktok.tiktokConfigured()) throw ApiError.badRequest('Connecting TikTok accounts is not set up yet');
  const state = jwt.sign({ cid: customerId, tid: taskId, uid: actor.id, role: actor.type, name: actor.name, provider } satisfies OAuthState, env.JWT_SECRET, {
    expiresIn: '20m',
    audience: 'social-oauth',
  });
  return { url: provider === 'tiktok' ? tiktok.authUrl(state) : extra.isExtra(provider) ? extra.authUrl(provider, state) : meta.authUrl(state) };
}

/** Handles Meta's redirect after the customer signs in. Returns a short message for the result page. */
export async function completeMetaConnect(code: string | undefined, state: string | undefined, error?: string) {
  if (error) return { ok: false, message: 'The Facebook sign-in was cancelled. Close this window and try again.' };
  if (!code || !state) return { ok: false, message: 'The Facebook sign-in did not complete. Close this window and try again.' };
  let s: OAuthState;
  try {
    s = jwt.verify(state, env.JWT_SECRET, { audience: 'social-oauth' }) as OAuthState;
  } catch {
    return { ok: false, message: 'This sign-in link has expired. Close this window and press Connect again.' };
  }
  try {
    const tok = await meta.exchangeCode(code);
    const assets = await meta.listAssets(tok.token);
    const tokenEnc = encryptSecret(tok.token);
    if (!tokenEnc) return { ok: false, message: 'The account could not be stored securely (encryption key missing). Please contact EG Eloma.' };
    const prev = await prisma.socialConnection.findUnique({ where: { customerId_provider: { customerId: s.cid, provider: 'meta' } } });
    const selected = meta.defaultSelection(assets, (prev?.selected ?? null) as meta.MetaSelection | null);
    const common = {
      externalUserId: tok.userId,
      externalName: tok.name,
      accessTokenEnc: tokenEnc,
      tokenExpiresAt: tok.expiresAt,
      scopes: tok.scopes,
      assets: assets as unknown as Prisma.InputJsonValue,
      selected: selected as Prisma.InputJsonValue,
      status: 'ACTIVE',
      lastError: null,
      connectedById: s.uid,
      connectedByType: s.role,
      connectedByName: s.name,
    };
    const conn = await prisma.socialConnection.upsert({
      where: { customerId_provider: { customerId: s.cid, provider: 'meta' } },
      create: { customerId: s.cid, provider: 'meta', ...common },
      update: common,
    });
    void syncConnection(conn.id, FULL_SYNC_DAYS).catch(() => undefined);
    if (!assets.pages.length && !assets.adAccounts.length) {
      return { ok: true, message: 'Connected, but this Facebook login has no Pages or ad accounts it can read. Check that it is an admin of the business Page.' };
    }
    return { ok: true, message: 'Your Meta account is connected. The dashboard is loading your figures — you can close this window.' };
  } catch (err) {
    logger.warn({ err }, 'Meta connect failed');
    return { ok: false, message: `Meta did not accept the sign-in: ${(err as Error).message}` };
  }
}

/** Handles TikTok's redirect after the customer signs in. Returns a short message for the result page. */
export async function completeTikTokConnect(code: string | undefined, state: string | undefined, error?: string, errorDescription?: string) {
  if (error) {
    return {
      ok: false,
      message: error === 'access_denied' ? 'The TikTok sign-in was cancelled. Close this window and try again.' : `TikTok did not complete the sign-in: ${errorDescription || error}`,
    };
  }
  if (!code || !state) return { ok: false, message: 'The TikTok sign-in did not complete. Close this window and try again.' };
  let s: OAuthState;
  try {
    s = jwt.verify(state, env.JWT_SECRET, { audience: 'social-oauth' }) as OAuthState;
  } catch {
    return { ok: false, message: 'This sign-in link has expired. Close this window and press Connect again.' };
  }
  if (s.provider !== 'tiktok') return { ok: false, message: 'This sign-in link is not for TikTok. Close this window and press Connect again.' };
  try {
    const tok = await tiktok.exchangeCode(code);
    const f = tiktok.tokenFields(tok);
    if (!f.accessTokenEnc || !f.refreshTokenEnc) return { ok: false, message: 'The account could not be stored securely (encryption key missing). Please contact EG Eloma.' };
    const user = await tiktok.userInfo(tok.access_token, tok.scope).catch((err) => {
      logger.warn({ err }, 'TikTok: could not read the account');
      return { open_id: tok.open_id } as tiktok.UserInfo;
    });
    const assets: tiktok.TikTokAssets = { ...tiktok.profileFrom(user), refreshTokenEnc: f.refreshTokenEnc, refreshExpiresAt: f.refreshExpiresAt };
    const common = {
      externalUserId: tok.open_id,
      externalName: user.display_name ?? (user.username ? `@${user.username}` : 'TikTok account'),
      accessTokenEnc: f.accessTokenEnc,
      tokenExpiresAt: f.tokenExpiresAt,
      scopes: f.scopes,
      assets: assets as unknown as Prisma.InputJsonValue,
      selected: {} as Prisma.InputJsonValue,
      status: 'ACTIVE',
      lastError: null,
      connectedById: s.uid,
      connectedByType: s.role,
      connectedByName: s.name,
    };
    const conn = await prisma.socialConnection.upsert({
      where: { customerId_provider: { customerId: s.cid, provider: 'tiktok' } },
      create: { customerId: s.cid, provider: 'tiktok', ...common },
      update: common,
    });
    void syncConnection(conn.id, FULL_SYNC_DAYS).catch(() => undefined);
    const granted = new Set(tok.scope.split(',').map((x) => x.trim()));
    const missing = env.TIKTOK_SCOPES.split(',').map((x) => x.trim()).filter((x) => x && !granted.has(x));
    if (missing.length) {
      return {
        ok: true,
        message: `TikTok is connected, but some permissions were not allowed (${missing.join(', ')}). Some figures or posting may not work. Press Connect again to allow them.`,
      };
    }
    return { ok: true, message: 'Your TikTok account is connected. The dashboard is loading your figures — you can close this window.' };
  } catch (err) {
    logger.warn({ err }, 'TikTok connect failed');
    return { ok: false, message: `TikTok did not accept the sign-in: ${(err as Error).message}` };
  }
}

export async function selectAssets(customerId: string, taskId: string, connectionId: string, sel: meta.MetaSelection & { assetId?: string | null }) {
  await ensureConnectTask(customerId, taskId);
  const conn = await prisma.socialConnection.findFirst({ where: { id: connectionId, customerId } });
  if (!conn) throw ApiError.notFound('Connection not found');
  if (extra.isExtra(conn.provider)) {
    let next: Record<string, unknown>;
    try {
      next = extra.selection(conn, typeof sel.assetId === 'string' && sel.assetId ? sel.assetId : null);
    } catch (err) {
      throw ApiError.badRequest((err as Error).message);
    }
    await prisma.socialConnection.update({ where: { id: conn.id }, data: { selected: next as Prisma.InputJsonValue } });
    await syncInBackground([conn.id]);
    return { ok: true };
  }
  if (conn.provider !== 'meta') throw ApiError.badRequest('There is nothing to choose for this account');
  const assets = conn.assets as unknown as meta.MetaAssets;
  const next: meta.MetaSelection = {
    pageId: sel.pageId === null ? null : assets.pages.some((p) => p.id === sel.pageId) ? sel.pageId : (conn.selected as meta.MetaSelection)?.pageId,
    igId: sel.igId === null ? null : assets.pages.some((p) => p.ig?.id === sel.igId) ? sel.igId : (conn.selected as meta.MetaSelection)?.igId,
    adAccountId:
      sel.adAccountId === null ? null : assets.adAccounts.some((a) => a.id === sel.adAccountId) ? sel.adAccountId : (conn.selected as meta.MetaSelection)?.adAccountId,
  };
  await prisma.socialConnection.update({ where: { id: conn.id }, data: { selected: next as Prisma.InputJsonValue } });
  await syncInBackground([conn.id]);
  return { ok: true };
}

/** Disconnect: the token is removed. Figures already fetched stay so past reports keep their history. */
export async function disconnect(customerId: string, taskId: string, connectionId: string) {
  await ensureConnectTask(customerId, taskId);
  const conn = await prisma.socialConnection.findFirst({ where: { id: connectionId, customerId }, select: { id: true, provider: true, accessTokenEnc: true, assets: true } });
  if (!conn) throw ApiError.notFound('Connection not found');
  // TikTok: end the access on TikTok's side too (best-effort).
  if (conn.provider === 'tiktok') await tiktok.revoke(conn.accessTokenEnc);
  if (extra.isExtra(conn.provider)) await extra.revoke(conn);
  await prisma.socialConnection.delete({ where: { id: conn.id } });
  return { ok: true };
}

// ─── Syncing ────────────────────────────────────────────────

const running = new Set<string>();
/** Days read on connect and on a refresh asked for by a person — covers the months kept. */
const FULL_SYNC_DAYS = 200;
/**
 * A full read can take minutes — longer than Azure keeps a request open (~230 s).
 * The request waits this long, then answers with `syncing: true` while the read
 * carries on in the background; the page polls until `lastSyncAt` moves.
 */
const SYNC_WAIT_MS = 20_000;

async function syncInBackground(ids: string[]) {
  const job = (async () => {
    for (const id of ids) await syncConnection(id, FULL_SYNC_DAYS).catch((err) => logger.warn({ err }, 'Social: sync failed'));
  })();
  await Promise.race([job, new Promise((r) => setTimeout(r, SYNC_WAIT_MS))]);
}

/** True while a read of one of these connections is still running on this server. */
export const isSyncing = (ids: string[]) => ids.some((id) => running.has(id));

export async function syncConnection(connectionId: string, days = 30) {
  if (running.has(connectionId)) return { skipped: true };
  running.add(connectionId);
  try {
    const conn = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
    if (conn?.provider === 'tiktok') return await syncTikTok(conn, days);
    if (conn && extra.isExtra(conn.provider)) return await extra.syncExtra(conn, days);
    if (!conn || conn.provider !== 'meta') return { skipped: true };
    const until = new Date();
    const since = new Date(Math.max(new Date(`${FIRST_DAY}T00:00:00Z`).getTime(), until.getTime() - days * 86400_000));
    let res: meta.MetaSyncResult;
    try {
      res = await meta.fetchAll(conn.accessTokenEnc, conn.assets as unknown as meta.MetaAssets, conn.selected as meta.MetaSelection, since, until);
    } catch (err) {
      const expired = err instanceof meta.MetaError && err.expired;
      await prisma.socialConnection.update({
        where: { id: conn.id },
        data: { status: expired ? 'EXPIRED' : 'ACTIVE', lastError: (err as Error).message.slice(0, 500) },
      });
      return { error: (err as Error).message };
    }
    const cid = conn.customerId;
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const organic = (platform: 'fb' | 'ig', map: Map<string, meta.OrganicDay>) => {
      for (const [day, v] of map) {
        const date = new Date(`${day}T00:00:00.000Z`);
        const fields = {
          reach: v.reach ?? 0,
          engagements: v.engagements ?? 0,
          newFollowers: v.newFollowers ?? 0,
          linkClicks: v.linkClicks ?? 0,
          ...(v.followers != null ? { followers: v.followers } : {}),
        };
        ops.push(
          prisma.socialMetricDaily.upsert({
            where: { customerId_platform_date: { customerId: cid, platform, date } },
            create: { customerId: cid, platform, date, source: 'meta', ...fields },
            update: { source: 'meta', ...fields },
          })
        );
      }
    };
    if (res.synced.fb) organic('fb', res.organic.fb);
    if (res.synced.ig) organic('ig', res.organic.ig);
    if (res.ads) {
      for (const [day, v] of res.ads) {
        const date = new Date(`${day}T00:00:00.000Z`);
        ops.push(
          prisma.socialMetricDaily.upsert({
            where: { customerId_platform_date: { customerId: cid, platform: 'meta_ads', date } },
            create: { customerId: cid, platform: 'meta_ads', date, source: 'meta', ...v },
            update: { source: 'meta', ...v },
          })
        );
      }
      for (const c of res.campaigns) {
        const date = new Date(`${c.date}T00:00:00.000Z`);
        const fields = { campaignName: c.campaignName, active: c.active, spend: c.spend, leads: c.leads, revenue: c.revenue };
        ops.push(
          prisma.socialCampaignDaily.upsert({
            where: { customerId_platform_campaignId_date: { customerId: cid, platform: 'meta_ads', campaignId: c.campaignId, date } },
            create: { customerId: cid, platform: 'meta_ads', campaignId: c.campaignId, date, ...fields },
            update: fields,
          })
        );
      }
    }
    // Extra daily Page figures (views, visits, unfollows, video) — one row per day.
    for (const [metric, map] of Object.entries(res.fbExtra)) {
      for (const [day, value] of map) {
        const date = new Date(`${day}T00:00:00.000Z`);
        const periodKey = `d:${day}`;
        ops.push(
          prisma.socialPeriodValue.upsert({
            where: { customerId_platform_metric_periodKey: { customerId: cid, platform: 'fb', metric, periodKey } },
            create: { customerId: cid, platform: 'fb', metric, periodKey, periodStart: date, periodEnd: date, value, source: 'meta' },
            update: { value, source: 'meta' },
          })
        );
      }
    }
    for (const p of res.posts) {
      const fields = {
        title: p.title,
        type: p.type,
        publishedAt: p.publishedAt,
        reach: p.reach,
        engagements: p.engagements,
        shares: p.shares,
        permalink: p.permalink,
        stats: p.stats as Prisma.InputJsonValue,
      };
      ops.push(
        prisma.socialPost.upsert({
          where: { customerId_platform_externalId: { customerId: cid, platform: p.platform, externalId: p.externalId } },
          create: { customerId: cid, platform: p.platform, externalId: p.externalId, ...fields },
          update: fields,
        })
      );
    }
    for (let i = 0; i < ops.length; i += 500) await prisma.$transaction(ops.slice(i, i + 500));
    await storePostImages(cid, res.posts).catch((err) => logger.warn({ err }, 'Social: storing post pictures failed'));
    await syncPeriods(conn, res.warnings).catch((err) => {
      logger.warn({ err }, 'Social: period figures failed');
      res.warnings.push(`Monthly totals could not be read: ${(err as Error).message}`);
    });
    await prisma.socialConnection.update({
      where: { id: conn.id },
      data: { status: 'ACTIVE', lastSyncAt: new Date(), lastError: res.warnings.length ? res.warnings.join('; ').slice(0, 500) : null },
    });
    return { ok: true, warnings: res.warnings };
  } finally {
    running.delete(connectionId);
  }
}

// ─── TikTok ─────────────────────────────────────────────────

/**
 * Read a TikTok account: followers today, its videos (with views, likes,
 * comments, shares) and the monthly TikTok figures derived from them.
 *
 * TikTok's Display API gives lifetime figures per video, not per day, so —
 * like Instagram engagement — a video's views and interactions are counted on
 * the day it was published. Figures it does not give (traffic sources, watch
 * time, profile views…) stay for the team to enter by hand.
 */
async function syncTikTok(conn: Prisma.SocialConnectionGetPayload<object>, days: number) {
  const until = new Date();
  const since = new Date(Math.max(new Date(`${FIRST_DAY}T00:00:00Z`).getTime(), until.getTime() - days * 86400_000));
  const warnings: string[] = [];
  const scopes = conn.scopes ?? '';
  let user: tiktok.UserInfo;
  let videos: tiktok.Video[] = [];
  try {
    const token = await tiktok.accessToken(conn);
    user = await tiktok.userInfo(token, scopes);
    if (scopes.split(',').includes('video.list')) {
      videos = await tiktok.listVideos(token, since).catch((err) => {
        if (err instanceof tiktok.TikTokError && err.expired) throw err;
        warnings.push(`TikTok videos could not be read: ${(err as Error).message}`);
        return [];
      });
    } else warnings.push('Video figures need the video.list permission. Reconnect TikTok and allow it.');
  } catch (err) {
    const expired = err instanceof tiktok.TikTokError && err.expired;
    await prisma.socialConnection.update({
      where: { id: conn.id },
      data: { status: expired ? 'EXPIRED' : 'ACTIVE', lastError: (err as Error).message.slice(0, 500) },
    });
    return { error: (err as Error).message };
  }
  if (user.follower_count == null) warnings.push('Follower figures need the user.info.stats permission. Reconnect TikTok and allow it.');

  const cid = conn.customerId;
  const today = until.toISOString().slice(0, 10);
  const views = (v: tiktok.Video) => v.view_count ?? 0;
  const interactions = (v: tiktok.Video) => (v.like_count ?? 0) + (v.comment_count ?? 0) + (v.share_count ?? 0);

  // Daily rows: [views, interactions] of the videos published that day; followers today.
  const byDay = new Map<string, { reach: number; engagements: number }>();
  for (const v of videos) {
    const d = new Date(v.create_time * 1000).toISOString().slice(0, 10);
    const cur = byDay.get(d) ?? { reach: 0, engagements: 0 };
    cur.reach += views(v);
    cur.engagements += interactions(v);
    byDay.set(d, cur);
  }
  if (!byDay.has(today)) byDay.set(today, { reach: 0, engagements: 0 });
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [day, v] of byDay) {
    const date = new Date(`${day}T00:00:00.000Z`);
    const fields = {
      reach: v.reach,
      engagements: v.engagements,
      newFollowers: 0,
      linkClicks: 0,
      ...(day === today && user.follower_count != null ? { followers: user.follower_count } : {}),
    };
    ops.push(
      prisma.socialMetricDaily.upsert({
        where: { customerId_platform_date: { customerId: cid, platform: 'tt', date } },
        create: { customerId: cid, platform: 'tt', date, source: 'tiktok', ...fields },
        update: { source: 'tiktok', ...fields },
      })
    );
  }

  // Posts table.
  const posts: meta.FetchedPost[] = videos.map((v) => ({
    platform: 'tt',
    externalId: v.id,
    title: (v.title || v.video_description || 'TikTok video').split('\n')[0].slice(0, 140),
    type: 'Video',
    publishedAt: new Date(v.create_time * 1000),
    reach: views(v),
    engagements: interactions(v),
    shares: v.share_count ?? null,
    permalink: v.share_url ?? null,
    pictureUrl: v.cover_image_url ?? null,
    stats: { views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count },
  }));
  for (const p of posts) {
    const fields = { title: p.title, type: p.type, publishedAt: p.publishedAt, reach: p.reach, engagements: p.engagements, shares: p.shares, permalink: p.permalink, stats: p.stats as Prisma.InputJsonValue };
    ops.push(
      prisma.socialPost.upsert({
        where: { customerId_platform_externalId: { customerId: cid, platform: 'tt', externalId: p.externalId } },
        create: { customerId: cid, platform: 'tt', externalId: p.externalId, ...fields },
        update: fields,
      })
    );
  }

  // Monthly TikTok figures for the periods this read fully covers.
  const sinceDay = new Date(`${since.toISOString().slice(0, 10)}T00:00:00.000Z`);
  for (const p of reportPeriods(until)) {
    if (p.start < sinceDay) continue;
    const endMs = p.end.getTime() + 86400_000;
    const inPeriod = videos.filter((v) => v.create_time * 1000 >= p.start.getTime() && v.create_time * 1000 < endMs);
    const sum = (f: (v: tiktok.Video) => number) => inPeriod.reduce((a, v) => a + f(v), 0);
    const totalViews = sum(views);
    const saves = 0; // TikTok's Display API does not report saves.
    const values: Record<string, number | null> = {
      tt_views: totalViews,
      tt_likes: sum((v) => v.like_count ?? 0),
      tt_comments: sum((v) => v.comment_count ?? 0),
      tt_shares: sum((v) => v.share_count ?? 0),
      tt_posts: inPeriod.length,
      tt_eng_rate: totalViews ? Math.round(((sum(interactions) + saves) / totalViews) * 1000) / 10 : null,
    };
    // Followers are a snapshot of today, so they only belong to the current month.
    if (p.key === reportPeriods(until)[0].key && user.follower_count != null) values.tt_followers = user.follower_count;
    for (const [metric, value] of Object.entries(values)) {
      if (value == null) continue;
      ops.push(
        prisma.socialPeriodValue.upsert({
          where: { customerId_platform_metric_periodKey: { customerId: cid, platform: 'tt', metric, periodKey: p.key } },
          create: { customerId: cid, platform: 'tt', metric, periodKey: p.key, periodStart: p.start, periodEnd: p.end, value, source: 'tiktok' },
          update: { periodStart: p.start, periodEnd: p.end, value, source: 'tiktok' },
        })
      );
    }
  }
  for (let i = 0; i < ops.length; i += 500) await prisma.$transaction(ops.slice(i, i + 500));
  await storePostImages(cid, posts).catch((err) => logger.warn({ err }, 'Social: storing TikTok covers failed'));

  const profile = tiktok.profileFrom(user);
  const assets = (conn.assets ?? {}) as unknown as tiktok.TikTokAssets;
  await prisma.socialConnection.update({
    where: { id: conn.id },
    data: {
      status: 'ACTIVE',
      lastSyncAt: new Date(),
      lastError: warnings.length ? warnings.join('; ').slice(0, 500) : null,
      externalName: user.display_name ?? conn.externalName,
      // Keep the stored tokens; refresh the public profile.
      assets: {
        ...assets,
        ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v != null)),
        // accessToken() may have rotated the refresh token during this read.
        ...(await latestRefresh(conn.id)),
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return { ok: true, warnings };
}

/** The refresh token fields as stored now (a refresh during the sync may have replaced them). */
async function latestRefresh(id: string) {
  const row = await prisma.socialConnection.findUnique({ where: { id }, select: { assets: true } });
  const a = (row?.assets ?? {}) as unknown as Partial<tiktok.TikTokAssets>;
  return { refreshTokenEnc: a.refreshTokenEnc ?? null, refreshExpiresAt: a.refreshExpiresAt ?? null };
}

// ─── Monthly figures (Channel insights) ─────────────────────

/** Full months kept, besides the current one. */
const MONTHS_BACK = 6;
const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/**
 * The reporting periods: the current month so far, the same days of the month
 * before ("prev:YYYY-MM", its comparison), and the last full months (one extra,
 * so the oldest month still has something to compare with).
 */
export function reportPeriods(now = new Date()): Period[] {
  const y = now.getUTCFullYear(),
    m = now.getUTCMonth(),
    today = utcDay(y, m, now.getUTCDate());
  const out: Period[] = [{ key: monthKey(today), start: utcDay(y, m, 1), end: today }];
  const prevLast = utcDay(y, m, 0).getUTCDate();
  out.push({ key: `prev:${monthKey(today)}`, start: utcDay(y, m - 1, 1), end: utcDay(y, m - 1, Math.min(now.getUTCDate(), prevLast)) });
  for (let i = 1; i <= MONTHS_BACK + 1; i++) {
    const start = utcDay(y, m - i, 1);
    if (start < new Date(`${FIRST_DAY}T00:00:00Z`)) break;
    out.push({ key: monthKey(start), start, end: utcDay(y, m - i + 1, 0) });
  }
  return out;
}

/**
 * Read the period totals from Meta. The current month (and its comparison) and
 * the month just finished are refreshed every time — Meta keeps adjusting
 * recent figures; older months are read once.
 */
/** Bump when the monthly fetch reads new or corrected figures. */
const PERIOD_FETCH_VERSION = 2;

async function syncPeriods(conn: { id: string; customerId: string; accessTokenEnc: string; assets: Prisma.JsonValue; selected: Prisma.JsonValue }, warnings: string[]) {
  const sel = conn.selected as meta.MetaSelection;
  if (!sel?.igId && !sel?.adAccountId) return;
  const all = reportPeriods();
  const stored = new Set(
    (
      await prisma.socialPeriodValue.findMany({
        where: { customerId: conn.customerId, periodKey: { in: all.map((p) => p.key) }, platform: 'meta', metric: '_fetched', value: { gte: PERIOD_FETCH_VERSION } },
        select: { periodKey: true },
      })
    ).map((r) => r.periodKey)
  );
  const want = all.filter((p, i) => i < 3 || !stored.has(p.key));
  const rows = await fetchPeriods(conn.accessTokenEnc, conn.assets as unknown as meta.MetaAssets, sel, want, warnings);
  // Marks each month as read with this version of the fetch, so a later fix re-reads older months once.
  for (const p of want) rows.push({ platform: 'meta', metric: '_fetched', key: p.key, start: p.start, end: p.end, value: PERIOD_FETCH_VERSION });
  const ops = rows.map((r) => {
    const data = r.data === undefined ? Prisma.DbNull : (r.data as Prisma.InputJsonValue);
    return prisma.socialPeriodValue.upsert({
      where: { customerId_platform_metric_periodKey: { customerId: conn.customerId, platform: r.platform, metric: r.metric, periodKey: r.key } },
      create: { customerId: conn.customerId, platform: r.platform, metric: r.metric, periodKey: r.key, periodStart: r.start, periodEnd: r.end, value: r.value, data, source: 'meta' },
      update: { periodStart: r.start, periodEnd: r.end, value: r.value, data, source: 'meta' },
    });
  });
  for (let i = 0; i < ops.length; i += 500) await prisma.$transaction(ops.slice(i, i + 500));
}

// ─── Post pictures ──────────────────────────────────────────

/** Meta's image hosts — anything else is never downloaded. */
const PICTURE_HOST = /(^|\.)(fbcdn\.net|cdninstagram\.com|fbsbx\.com|tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|ytimg\.com|licdn\.com)$/i;
const PICTURE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const PICTURE_MAX_BYTES = 8 * 1024 * 1024;
/** Pictures copied per sync — the rest follow on the next sync. */
const PICTURES_PER_SYNC = 60;

/**
 * Copy each post's picture into our storage once. Meta's image links expire
 * after a while, so the dashboard shows our copy instead.
 */
export async function storePostImages(customerId: string, posts: meta.FetchedPost[]) {
  const withPic = posts.filter((p) => p.pictureUrl);
  if (!withPic.length) return;
  const missing = await prisma.socialPost.findMany({
    where: { customerId, imageUrl: null, externalId: { in: withPic.map((p) => p.externalId) } },
    select: { id: true, platform: true, externalId: true },
  });
  const byKey = new Map(withPic.map((p) => [`${p.platform}:${p.externalId}`, p.pictureUrl!]));
  for (const row of missing.slice(0, PICTURES_PER_SYNC)) {
    const src = byKey.get(`${row.platform}:${row.externalId}`);
    if (!src) continue;
    try {
      const url = new URL(src);
      if (url.protocol !== 'https:' || !PICTURE_HOST.test(url.hostname)) continue;
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const ext = PICTURE_TYPES[type];
      if (!res.ok || !ext) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > PICTURE_MAX_BYTES) continue;
      const safeId = row.externalId.replace(/[^A-Za-z0-9_-]/g, '_');
      const stored = await storage.save(`social/${customerId}/${row.platform}-${safeId}.${ext}`, buf, type);
      await prisma.socialPost.update({ where: { id: row.id }, data: { imageUrl: stored } });
    } catch (err) {
      logger.warn({ err, post: row.externalId }, 'Social: could not copy a post picture');
    }
  }
}

/** Refresh button: re-fetch every active connection of this customer, then return the dashboard. */
export async function syncCustomer(customerId: string, taskId: string, viewer: Actor) {
  await ensureDashboardTask(customerId, taskId);
  const conns = await prisma.socialConnection.findMany({ where: { customerId, status: { not: 'EXPIRED' } }, select: { id: true } });
  // A refresh asked for by a person reads 90 days, so older posts and figures fill in too.
  await syncInBackground(conns.map((c) => c.id));
  return getDashboard(customerId, taskId, viewer);
}
