import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ConnectionError, latestRefresh, tokenFields, type TokenSet } from './oauth2.js';
import * as linkedin from './linkedin.service.js';
import * as google from './google.service.js';
import * as youtube from './youtube.service.js';
import * as gads from './googleads.service.js';
import type { FetchedPost } from './meta.service.js';
import type { Period } from './meta.periods.js';
import { FIRST_DAY, reportPeriods, storePostImages, syncConnection, type OAuthState } from './social.service.js';

/**
 * LinkedIn, YouTube and Google Ads connections: finishing the sign-in and
 * reading their figures into the same tables the Social Media Dashboard reads
 * for Meta and TikTok (SocialMetricDaily, SocialPost, SocialCampaignDaily,
 * SocialPeriodValue).
 */

export type ExtraProvider = 'linkedin' | 'youtube' | 'google_ads';
export const EXTRA_PROVIDERS: ExtraProvider[] = ['linkedin', 'youtube', 'google_ads'];
export const isExtra = (p: string): p is ExtraProvider => (EXTRA_PROVIDERS as string[]).includes(p);

const FULL_SYNC_DAYS = 200;
const LABEL: Record<ExtraProvider, string> = { linkedin: 'LinkedIn', youtube: 'YouTube', google_ads: 'Google Ads' };

export function configured(p: ExtraProvider) {
  return p === 'linkedin' ? linkedin.linkedinConfigured() : google.googleConfigured(p);
}

export function authUrl(p: ExtraProvider, state: string) {
  return p === 'linkedin' ? linkedin.authUrl(state) : google.authUrl(p, state);
}

type Conn = Prisma.SocialConnectionGetPayload<object>;

export function accessToken(conn: Conn) {
  return conn.provider === 'linkedin' ? linkedin.accessToken(conn) : google.accessToken(conn);
}

/** Names and ids the browser may see (never tokens). */
export function shape(conn: { provider: string; assets: Prisma.JsonValue; selected: Prisma.JsonValue }) {
  const p = conn.provider as ExtraProvider;
  if (p === 'youtube') return { pages: [], adAccounts: [], profile: youtube.publicProfile(conn.assets), choices: [] };
  const pub = p === 'linkedin' ? linkedin.publicAssets(conn.assets) : gads.publicAssets(conn.assets);
  return { pages: [], adAccounts: [], profile: null, choices: pub.choices };
}

/** The chosen Page / ad account id stored in `selected`. */
export function selectedId(conn: { provider: string; selected: Prisma.JsonValue }) {
  const s = (conn.selected ?? {}) as Record<string, unknown>;
  if (conn.provider === 'linkedin') return (s.orgId as string | null | undefined) ?? null;
  if (conn.provider === 'google_ads') return (s.customerId as string | null | undefined) ?? null;
  return null;
}

/** Dashboard platform keys a connection fills. */
export function platformsOf(conn: { provider: string; selected: Prisma.JsonValue }): string[] {
  if (conn.provider === 'youtube') return ['yt'];
  if (conn.provider === 'linkedin') return selectedId(conn) ? ['li'] : [];
  if (conn.provider === 'google_ads') return selectedId(conn) ? ['google_ads'] : [];
  return [];
}

export function selection(conn: Conn, id: string | null) {
  const a = (conn.assets ?? {}) as Record<string, unknown>;
  if (conn.provider === 'linkedin') {
    const ok = id === null || ((a.orgs ?? []) as { id: string }[]).some((o) => o.id === id);
    if (!ok) throw new ConnectionError('That company Page is not on this LinkedIn login');
    return { orgId: id };
  }
  if (conn.provider === 'google_ads') {
    const ok = id === null || ((a.accounts ?? []) as { id: string }[]).some((o) => o.id === id);
    if (!ok) throw new ConnectionError('That ad account is not on this Google login');
    return { customerId: id };
  }
  throw new ConnectionError('There is nothing to choose for this account');
}

/** Revoke on the platform's side (best-effort) before the connection is removed. */
export async function revoke(conn: { provider: string; accessTokenEnc: string; assets: Prisma.JsonValue }) {
  const a = (conn.assets ?? {}) as { refreshTokenEnc?: string | null };
  if (conn.provider === 'linkedin') await linkedin.revoke(conn.accessTokenEnc);
  else await google.revoke(conn.accessTokenEnc, a.refreshTokenEnc);
}

// ─── Sign-in ────────────────────────────────────────────────

export async function completeConnect(provider: ExtraProvider, code: string | undefined, state: string | undefined, error?: string) {
  const label = LABEL[provider];
  if (error) return { ok: false, message: error === 'access_denied' || error === 'user_cancelled_login' || error === 'user_cancelled_authorize' ? `The ${label} sign-in was cancelled. Close this window and try again.` : `${label} did not complete the sign-in: ${error}` };
  if (!code || !state) return { ok: false, message: `The ${label} sign-in did not complete. Close this window and try again.` };
  let s: OAuthState;
  try {
    s = jwt.verify(state, env.JWT_SECRET, { audience: 'social-oauth' }) as OAuthState;
  } catch {
    return { ok: false, message: 'This sign-in link has expired. Close this window and press Connect again.' };
  }
  if (s.provider !== provider) return { ok: false, message: `This sign-in link is not for ${label}. Close this window and press Connect again.` };
  try {
    const tok: TokenSet = provider === 'linkedin' ? await linkedin.exchangeCode(code) : await google.exchangeCode(code, provider);
    const prev = await prisma.socialConnection.findUnique({ where: { customerId_provider: { customerId: s.cid, provider } } });
    const prevRefresh = provider === 'linkedin' ? null : ((prev?.assets ?? {}) as { refreshTokenEnc?: string | null }).refreshTokenEnc;
    const f = tokenFields(tok, prevRefresh);
    if (!f.accessTokenEnc) return { ok: false, message: 'The account could not be stored securely (encryption key missing). Please contact EG Eloma.' };
    const prevSel = (prev?.selected ?? {}) as Record<string, unknown>;
    let assets: Record<string, unknown>;
    let selected: Record<string, unknown> = {};
    let name: string;
    let externalId: string | null = null;
    let message = `Your ${label} account is connected. The dashboard is loading your figures — you can close this window.`;
    if (provider === 'linkedin') {
      const [orgs, member] = await Promise.all([linkedin.listOrgs(tok.access_token), linkedin.memberName(tok.access_token)]);
      assets = { memberName: member, orgs } satisfies Omit<linkedin.LinkedInAssets, 'refreshTokenEnc'>;
      const keep = orgs.some((o) => o.id === prevSel.orgId) ? (prevSel.orgId as string) : (orgs[0]?.id ?? null);
      selected = { orgId: keep };
      name = orgs.find((o) => o.id === keep)?.name ?? member ?? 'LinkedIn account';
      if (!orgs.length) message = 'Connected, but this LinkedIn login is not an admin of any company Page. Ask a Page admin to connect, or make this person an admin.';
    } else if (provider === 'youtube') {
      const ch = await youtube.myChannel(tok.access_token);
      if (!ch) return { ok: false, message: 'This Google account has no YouTube channel. Close this window and sign in with the account (or brand account) that owns the channel.' };
      assets = { channelId: ch.id, title: ch.title, handle: ch.handle, thumbnail: ch.thumbnail, uploadsPlaylist: ch.uploadsPlaylist };
      name = ch.title;
      externalId = ch.id;
      if (!google.hasScope(tok.scope, youtube.UPLOAD_SCOPE)) message = 'YouTube is connected for figures, but uploading was not allowed. Press Connect again and allow every permission to post from the Content Calendar.';
    } else {
      const accounts = await gads.listAccounts(tok.access_token);
      assets = { accounts };
      const keep = accounts.some((a) => a.id === prevSel.customerId) ? (prevSel.customerId as string) : (accounts[0]?.id ?? null);
      selected = { customerId: keep };
      name = accounts.find((a) => a.id === keep)?.name ?? 'Google Ads';
      if (!accounts.length) message = 'Connected, but this Google login cannot read any Google Ads account. Sign in with a user of the ad account.';
    }
    const common = {
      externalUserId: externalId ?? String((selected.orgId ?? selected.customerId ?? provider) as string),
      externalName: name,
      accessTokenEnc: f.accessTokenEnc,
      tokenExpiresAt: f.tokenExpiresAt,
      scopes: tok.scope ?? (provider === 'linkedin' ? env.LINKEDIN_SCOPES : google.scopesFor(provider)),
      assets: { ...assets, refreshTokenEnc: f.refreshTokenEnc, refreshExpiresAt: f.refreshExpiresAt } as Prisma.InputJsonValue,
      selected: selected as Prisma.InputJsonValue,
      status: 'ACTIVE',
      lastError: null,
      connectedById: s.uid,
      connectedByType: s.role,
      connectedByName: s.name,
    };
    const conn = await prisma.socialConnection.upsert({
      where: { customerId_provider: { customerId: s.cid, provider } },
      create: { customerId: s.cid, provider, ...common },
      update: common,
    });
    void syncConnection(conn.id, FULL_SYNC_DAYS).catch(() => undefined);
    return { ok: true, message };
  } catch (err) {
    logger.warn({ err, provider }, 'Social connect failed');
    return { ok: false, message: `${label} did not accept the sign-in: ${(err as Error).message}` };
  }
}

/** Google sends YouTube and Google Ads sign-ins to one address; the signed state says which it was. */
export function completeGoogleConnect(code: string | undefined, state: string | undefined, error?: string) {
  const claimed = state ? (jwt.decode(state) as Partial<OAuthState> | null)?.provider : undefined;
  const provider: ExtraProvider = claimed === 'google_ads' ? 'google_ads' : 'youtube';
  return completeConnect(provider, code, state, error);
}

// ─── Reading ────────────────────────────────────────────────

const dayDate = (d: string) => new Date(`${d}T00:00:00.000Z`);
const r1 = (n: number) => Math.round(n * 10) / 10;

function span(days: number) {
  const until = new Date();
  const since = new Date(Math.max(dayDate(FIRST_DAY).getTime(), until.getTime() - days * 86400_000));
  return { since, until, today: until.toISOString().slice(0, 10) };
}

/** Periods to (re)read: every period this read fully covers on a full read, otherwise the recent three. */
function periodsFor(since: Date, days: number): Period[] {
  const sinceDay = dayDate(since.toISOString().slice(0, 10));
  const all = reportPeriods();
  return all.filter((p, i) => p.start >= sinceDay && (days > 31 || i < 3));
}

function organicOp(cid: string, platform: string, source: string, day: string, f: { reach: number; engagements: number; newFollowers: number; linkClicks: number; followers?: number | null }) {
  const date = dayDate(day);
  const fields = { reach: f.reach, engagements: f.engagements, newFollowers: f.newFollowers, linkClicks: f.linkClicks, ...(f.followers != null ? { followers: f.followers } : {}) };
  return prisma.socialMetricDaily.upsert({
    where: { customerId_platform_date: { customerId: cid, platform, date } },
    create: { customerId: cid, platform, date, source, ...fields },
    update: { source, ...fields },
  });
}

function periodOp(cid: string, platform: string, source: string, p: Period, metric: string, value: number | null, data?: unknown) {
  const d = data === undefined ? Prisma.DbNull : (data as Prisma.InputJsonValue);
  return prisma.socialPeriodValue.upsert({
    where: { customerId_platform_metric_periodKey: { customerId: cid, platform, metric, periodKey: p.key } },
    create: { customerId: cid, platform, metric, periodKey: p.key, periodStart: p.start, periodEnd: p.end, value, data: d, source },
    update: { periodStart: p.start, periodEnd: p.end, value, data: d, source },
  });
}

function postOps(cid: string, posts: FetchedPost[]) {
  return posts.map((p) => {
    const fields = { title: p.title, type: p.type, publishedAt: p.publishedAt, reach: p.reach, engagements: p.engagements, shares: p.shares, permalink: p.permalink, stats: p.stats as Prisma.InputJsonValue };
    return prisma.socialPost.upsert({
      where: { customerId_platform_externalId: { customerId: cid, platform: p.platform, externalId: p.externalId } },
      create: { customerId: cid, platform: p.platform, externalId: p.externalId, ...fields },
      update: fields,
    });
  });
}

async function run(ops: Prisma.PrismaPromise<unknown>[]) {
  for (let i = 0; i < ops.length; i += 500) await prisma.$transaction(ops.slice(i, i + 500));
}

async function finish(conn: Conn, warnings: string[], extra: Prisma.SocialConnectionUpdateInput = {}) {
  const assets = { ...((conn.assets ?? {}) as Record<string, unknown>), ...(await latestRefresh(conn.id)) };
  await prisma.socialConnection.update({
    where: { id: conn.id },
    data: { status: 'ACTIVE', lastSyncAt: new Date(), lastError: warnings.length ? warnings.join('; ').slice(0, 500) : null, ...extra, assets: assets as Prisma.InputJsonValue },
  });
  return { ok: true, warnings };
}

export async function syncExtra(conn: Conn, days: number) {
  try {
    const token = await accessToken(conn);
    if (conn.provider === 'linkedin') return await syncLinkedIn(conn, token, days);
    if (conn.provider === 'youtube') return await syncYouTube(conn, token, days);
    if (conn.provider === 'google_ads') return await syncGoogleAds(conn, token, days);
    return { skipped: true };
  } catch (err) {
    const expired = err instanceof ConnectionError && err.expired;
    await prisma.socialConnection.update({ where: { id: conn.id }, data: { status: expired ? 'EXPIRED' : 'ACTIVE', lastError: (err as Error).message.slice(0, 500) } });
    return { error: (err as Error).message };
  }
}

async function syncLinkedIn(conn: Conn, token: string, days: number) {
  const orgId = selectedId(conn);
  const warnings: string[] = [];
  if (!orgId) return finish(conn, ['Choose the company Page to read under Connected accounts.']);
  const { since, until, today } = span(days);
  const cid = conn.customerId;
  const [daysMap, followers, posts] = await Promise.all([
    linkedin.dailyStats(token, orgId, since, until, warnings),
    linkedin.followerCount(token, orgId).catch((err) => {
      warnings.push(`LinkedIn followers could not be read: ${(err as Error).message}`);
      return null;
    }),
    linkedin.listPosts(token, orgId, since).catch((err) => {
      if (err instanceof ConnectionError && err.expired) throw err;
      warnings.push(`LinkedIn posts could not be read: ${(err as Error).message}`);
      return [] as linkedin.LinkedInPost[];
    }),
  ]);
  if (!daysMap.has(today)) daysMap.set(today, { impressions: 0, clicks: 0, likes: 0, comments: 0, shares: 0, newFollowersOrganic: 0, newFollowersPaid: 0, pageViews: 0, desktopViews: 0, mobileViews: 0 });
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [day, v] of daysMap) {
    ops.push(
      organicOp(cid, 'li', 'linkedin', day, {
        reach: v.impressions,
        engagements: v.likes + v.comments + v.shares,
        newFollowers: v.newFollowersOrganic + v.newFollowersPaid,
        linkClicks: v.clicks,
        followers: day === today ? followers : null,
      })
    );
  }
  const fetched: FetchedPost[] = posts.map((p) => ({
    platform: 'li' ,
    externalId: p.id,
    title: (p.text || 'LinkedIn post').split('\n')[0].slice(0, 140),
    type: 'Post',
    publishedAt: p.publishedAt,
    reach: p.impressions,
    engagements: p.likes + p.comments + p.shares,
    shares: p.shares,
    permalink: linkedin.postUrl(p.id),
    pictureUrl: null,
    stats: { views: p.impressions, likes: p.likes, comments: p.comments, shares: p.shares, clicks: p.clicks },
  }));
  ops.push(...postOps(cid, fetched));
  // Monthly figures — LinkedIn keeps daily figures for about a year.
  const current = reportPeriods()[0].key;
  for (const p of periodsFor(since, days)) {
    const sum = (f: (d: linkedin.LinkedInDay) => number) => {
      let n = 0;
      for (const [day, v] of daysMap) if (day >= p.start.toISOString().slice(0, 10) && day <= p.end.toISOString().slice(0, 10)) n += f(v);
      return n;
    };
    const impr = sum((d) => d.impressions),
      clicks = sum((d) => d.clicks),
      likes = sum((d) => d.likes),
      comments = sum((d) => d.comments),
      shares = sum((d) => d.shares),
      org = sum((d) => d.newFollowersOrganic),
      paid = sum((d) => d.newFollowersPaid);
    const values: Record<string, number | null> = {
      li_impressions: impr,
      li_clicks: clicks,
      li_reactions: likes,
      li_comments: comments,
      li_reposts: shares,
      li_ctr: impr ? r1((clicks / impr) * 100) : null,
      li_eng_rate: impr ? r1(((clicks + likes + comments + shares + org + paid) / impr) * 100) : null,
      li_new_followers: org + paid,
      li_new_fol_org: org,
      li_new_fol_spon: paid,
      li_page_views: sum((d) => d.pageViews),
      li_views_desktop: sum((d) => d.desktopViews),
      li_views_mobile: sum((d) => d.mobileViews),
      li_posts: posts.filter((x) => x.publishedAt >= p.start && x.publishedAt.getTime() < p.end.getTime() + 86400_000).length,
      li_followers: p.key === current ? followers : null,
    };
    for (const [metric, value] of Object.entries(values)) if (value != null) ops.push(periodOp(cid, 'li', 'linkedin', p, metric, value));
  }
  await run(ops);
  const assets = (conn.assets ?? {}) as Partial<linkedin.LinkedInAssets>;
  return finish(conn, warnings, { externalName: assets.orgs?.find((o) => o.id === orgId)?.name ?? conn.externalName });
}

async function syncYouTube(conn: Conn, token: string, days: number) {
  const warnings: string[] = [];
  const { since, until, today } = span(days);
  const cid = conn.customerId;
  const ch = await youtube.myChannel(token);
  if (!ch) throw new ConnectionError('The connected Google account no longer has a YouTube channel. Reconnect YouTube.', true);
  const [daily, videos] = await Promise.all([
    youtube.daily(token, since, until).catch((err) => {
      if (err instanceof ConnectionError && err.expired) throw err;
      warnings.push(`YouTube daily figures could not be read: ${(err as Error).message}`);
      return new Map<string, youtube.YouTubeDay>();
    }),
    ch.uploadsPlaylist
      ? youtube.listVideos(token, ch.uploadsPlaylist, since).catch((err) => {
          warnings.push(`YouTube videos could not be read: ${(err as Error).message}`);
          return [] as youtube.Video[];
        })
      : Promise.resolve([] as youtube.Video[]),
  ]);
  if (!daily.has(today)) daily.set(today, { views: 0, likes: 0, comments: 0, shares: 0, subsGained: 0, subsLost: 0 });
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [day, v] of daily) {
    ops.push(
      organicOp(cid, 'yt', 'youtube', day, {
        reach: v.views,
        engagements: v.likes + v.comments + v.shares,
        newFollowers: v.subsGained,
        linkClicks: 0,
        followers: day === today ? ch.subscribers : null,
      })
    );
  }
  const posts: FetchedPost[] = videos.map((v) => ({
    platform: 'yt' ,
    externalId: v.id,
    title: v.title.slice(0, 140),
    type: v.shorts ? 'Short' : 'Video',
    publishedAt: v.publishedAt,
    reach: v.views,
    engagements: v.likes + v.comments,
    shares: null,
    permalink: v.shorts ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
    pictureUrl: v.thumbnail,
    stats: { views: v.views, likes: v.likes, comments: v.comments },
  }));
  ops.push(...postOps(cid, posts));
  const current = reportPeriods()[0].key;
  for (const p of periodsFor(since, days)) {
    let values: Record<string, number>;
    try {
      values = await youtube.periodFigures(token, p.start, p.end, warnings);
    } catch (err) {
      if (err instanceof ConnectionError && err.expired) throw err;
      warnings.push(`YouTube monthly figures could not be read: ${(err as Error).message}`);
      break;
    }
    values.yt_uploads = videos.filter((v) => v.publishedAt >= p.start && v.publishedAt.getTime() < p.end.getTime() + 86400_000).length;
    if (p.key === current && ch.subscribers != null) values.yt_subs_total = ch.subscribers;
    for (const [metric, value] of Object.entries(values)) ops.push(periodOp(cid, 'yt', 'youtube', p, metric, value));
  }
  await run(ops);
  await storePostImages(cid, posts).catch((err) => logger.warn({ err }, 'Social: storing YouTube thumbnails failed'));
  const assets = (conn.assets ?? {}) as Record<string, unknown>;
  await prisma.socialConnection.update({
    where: { id: conn.id },
    data: { assets: { ...assets, title: ch.title, handle: ch.handle, thumbnail: ch.thumbnail, uploadsPlaylist: ch.uploadsPlaylist, channelId: ch.id } as Prisma.InputJsonValue },
  });
  const fresh = await prisma.socialConnection.findUniqueOrThrow({ where: { id: conn.id } });
  return finish(fresh, [...new Set(warnings)], { externalName: ch.title });
}

async function syncGoogleAds(conn: Conn, token: string, days: number) {
  const id = selectedId(conn);
  if (!id) return finish(conn, ['Choose the Google Ads account to read under Connected accounts.']);
  const acc = ((conn.assets ?? {}) as Partial<gads.GoogleAdsAssets>).accounts?.find((a) => a.id === id);
  if (!acc) return finish(conn, ['The chosen Google Ads account is no longer on this login. Reconnect Google Ads.']);
  const warnings: string[] = [];
  const { since, until } = span(days);
  const cid = conn.customerId;
  const daily = await gads.daily(token, acc, since, until);
  const camps = await gads.campaignDays(token, acc, since, until).catch((err) => {
    warnings.push(`Google Ads campaigns could not be read: ${(err as Error).message}`);
    return [] as gads.CampaignDay[];
  });
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [day, v] of daily) {
    const date = dayDate(day);
    ops.push(
      prisma.socialMetricDaily.upsert({
        where: { customerId_platform_date: { customerId: cid, platform: 'google_ads', date } },
        create: { customerId: cid, platform: 'google_ads', date, source: 'google_ads', ...v },
        update: { source: 'google_ads', ...v },
      })
    );
  }
  for (const c of camps) {
    const date = dayDate(c.date);
    const fields = { campaignName: c.campaignName, active: c.active, spend: c.spend, leads: c.leads, revenue: c.revenue };
    ops.push(
      prisma.socialCampaignDaily.upsert({
        where: { customerId_platform_campaignId_date: { customerId: cid, platform: 'google_ads', campaignId: c.campaignId, date } },
        create: { customerId: cid, platform: 'google_ads', campaignId: c.campaignId, date, ...fields },
        update: fields,
      })
    );
  }
  const current = reportPeriods()[0].key;
  for (const p of periodsFor(since, days)) {
    try {
      const r = await gads.periodFigures(token, acc, p.start, p.end, p.key === current, warnings);
      for (const [metric, value] of Object.entries(r.values)) ops.push(periodOp(cid, 'ga', 'google_ads', p, metric, value));
      if (r.table) ops.push(periodOp(cid, 'ga', 'google_ads', p, 'table_campaigns', null, r.table));
    } catch (err) {
      if (err instanceof ConnectionError && err.expired) throw err;
      warnings.push(`Google Ads monthly figures could not be read: ${(err as Error).message}`);
      break;
    }
  }
  await run(ops);
  return finish(conn, [...new Set(warnings)], { externalName: acc.name });
}
