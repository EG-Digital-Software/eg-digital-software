import jwt from 'jsonwebtoken';
import { Prisma, type Role } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { encryptSecret } from '../../utils/secretBox.js';
import * as meta from './meta.service.js';
import * as tiktok from './tiktok.service.js';
import * as linkedin from './linkedin.service.js';
import * as google from './google.service.js';
import * as youtube from './youtube.service.js';
import * as gads from './googleads.service.js';
import * as extra from './platforms.sync.js';
import * as search from './groupSearch.service.js';
import { ConnectionError, accessTokenFor, tokenFields, type TokenSet, type TokenStore } from './oauth2.js';
import { FIRST_DAY, copyPicture, type Actor } from './social.service.js';

/**
 * Eloma Group marketing (Admin → Marketing): the group's OWN social media
 * accounts — never a client's. A login is connected once (a Meta login lists
 * every Page it manages) and each group company is pointed at its own Page /
 * Instagram / ad account. Figures are fetched with the same platform readers
 * the client Social Media Dashboard uses, but stored in the Group* tables,
 * keyed by company. Nothing here reads or writes a client table.
 */

export const GROUP_COMPANIES = [
  { key: 'egeloma', name: 'EG Eloma' },
  { key: 'bivry', name: 'Bivry' },
  { key: 'egimports', name: 'EG Imports' },
  { key: 'egtravels', name: 'EG Travels' },
  { key: 'elomacare', name: 'ELOMA Customer Care' },
] as const;
const COMPANY_KEYS: readonly string[] = GROUP_COMPANIES.map((c) => c.key);

export const GROUP_PROVIDERS = ['meta', 'tiktok', 'linkedin', 'youtube', 'google_ads', 'search_console', 'google_analytics', 'business_profile'] as const;
type GroupProvider = (typeof GROUP_PROVIDERS)[number];
const isProvider = (p: string): p is GroupProvider => (GROUP_PROVIDERS as readonly string[]).includes(p);
const LABEL: Record<GroupProvider, string> = {
  meta: 'Meta',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  google_ads: 'Google Ads',
  search_console: 'Search Console',
  google_analytics: 'Google Analytics',
  business_profile: 'Business Profile',
};

/** Signed `state` audience — different from the client flow, so a group sign-in can never land on a client. */
export const GROUP_OAUTH_AUDIENCE = 'group-social-oauth';

interface GroupOAuthState {
  uid: string;
  role: Role;
  name: string;
  provider: GroupProvider;
}

type GConn = Prisma.GroupSocialConnectionGetPayload<object>;
type GLink = Prisma.GroupSocialLinkGetPayload<object>;

const FULL_SYNC_DAYS = 200;
const SYNC_STALE_MS = 6 * 3600 * 1000;
const SYNC_WAIT_MS = 20_000;
const PICTURES_PER_SYNC = 60;

const dayDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

function span(days: number) {
  const until = new Date();
  const since = new Date(Math.max(dayDate(FIRST_DAY).getTime(), until.getTime() - days * 86400_000));
  return { since, until, today: until.toISOString().slice(0, 10) };
}

function configured(p: GroupProvider) {
  if (p === 'meta') return meta.metaConfigured();
  if (p === 'tiktok') return tiktok.tiktokConfigured();
  if (google.isGoogleData(p)) return google.googleConfigured(p);
  return extra.configured(p);
}

// ─── Tokens ─────────────────────────────────────────────────

const groupStore: TokenStore = {
  read: (id) => prisma.groupSocialConnection.findUnique({ where: { id } }),
  write: (id, data) => prisma.groupSocialConnection.update({ where: { id }, data }),
};

/** TikTok's refresh, in the shape the shared refresher expects (TikTok rotates the refresh token each time). */
async function tiktokRefresh(refreshToken: string): Promise<TokenSet> {
  try {
    const r = await tiktok.refreshTokens(refreshToken);
    return { access_token: r.access_token, expires_in: r.expires_in, refresh_token: r.refresh_token, refresh_token_expires_in: r.refresh_expires_in, scope: r.scope };
  } catch (err) {
    if (err instanceof tiktok.TikTokError && (err.expired || err.status === 400 || err.status === 401)) throw new ConnectionError('The TikTok access has expired. Reconnect TikTok.', true);
    throw err;
  }
}

function accessToken(conn: GConn): Promise<string> {
  if (conn.provider === 'linkedin') return accessTokenFor(conn, linkedin.refresh, LABEL.linkedin, groupStore);
  if (conn.provider === 'tiktok') return accessTokenFor(conn, tiktokRefresh, LABEL.tiktok, groupStore);
  const p = conn.provider as google.GoogleProvider;
  return accessTokenFor(conn, google.refresher(p), google.labelFor(p), groupStore);
}

const isExpired = (err: unknown) =>
  (err instanceof meta.MetaError && err.expired) || (err instanceof tiktok.TikTokError && err.expired) || (err instanceof ConnectionError && err.expired);

// ─── Reading (the Marketing page) ───────────────────────────

/** Accounts on a login the browser may see — names and ids only, never tokens. */
function shapeConnection(c: GConn) {
  const a = (c.assets ?? {}) as Record<string, unknown>;
  let choices: { pages?: { id: string; name: string; ig: { id: string; username: string } | null }[]; adAccounts?: { id: string; name: string }[]; options?: { id: string; name: string }[] } = {};
  if (c.provider === 'meta') {
    const m = a as unknown as Partial<meta.MetaAssets>;
    choices = { pages: (m.pages ?? []).map((p) => ({ id: p.id, name: p.name, ig: p.ig })), adAccounts: (m.adAccounts ?? []).map((x) => ({ id: x.id, name: x.name })) };
  } else if (c.provider === 'linkedin') {
    choices = { options: linkedin.publicAssets(a).choices.map((o) => ({ id: o.id, name: o.name })) };
  } else if (c.provider === 'google_ads') {
    choices = { options: gads.publicAssets(a).choices.map((o) => ({ id: o.id, name: o.name })) };
  } else if (google.isGoogleData(c.provider)) {
    choices = { options: ((a.choices ?? []) as search.Choice[]).map((o) => ({ id: o.id, name: o.name })) };
  }
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
    ...choices,
  };
}

const running = new Set<string>();
const isSyncing = () => running.size > 0;

export async function getOverview() {
  const [conns, links, metrics, campaigns] = await Promise.all([
    prisma.groupSocialConnection.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.groupSocialLink.findMany(),
    prisma.groupSocialMetricDaily.findMany({ orderBy: { date: 'asc' } }),
    prisma.groupSocialCampaignDaily.findMany({ orderBy: { date: 'asc' } }),
  ]);
  const posts = (
    await Promise.all(COMPANY_KEYS.map((company) => prisma.groupSocialPost.findMany({ where: { company }, orderBy: { publishedAt: 'desc' }, take: 300 })))
  ).flat();

  // Refresh in the background when a company's figures are a few hours old.
  const active = new Set(conns.filter((c) => c.status === 'ACTIVE').map((c) => c.id));
  for (const l of links) {
    if (active.has(l.connectionId) && (!l.lastSyncAt || Date.now() - l.lastSyncAt.getTime() > SYNC_STALE_MS)) void syncLink(l.id).catch(() => undefined);
  }

  type CompanyData = {
    metrics: Record<string, Record<string, (number | null)[]>>;
    posts: unknown[];
    campaigns: Record<string, { platform: string; id: string; name: string; active: boolean; days: Record<string, number[]> }>;
  };
  const data: Record<string, CompanyData> = Object.fromEntries(COMPANY_KEYS.map((k) => [k, { metrics: {}, posts: [], campaigns: {} }]));
  // Compact: organic [reach, eng, newFollowers, clicks, followers|null]; ads [spend, clicks, leads, revenue, impressions].
  for (const r of metrics) {
    const d = data[r.company];
    if (!d) continue;
    const isAds = r.platform === 'google_ads' || r.platform === 'meta_ads';
    (d.metrics[r.platform] ??= {})[r.date.toISOString().slice(0, 10)] = isAds
      ? [r.spend, r.clicks, r.leads, r.revenue, r.impressions]
      : [r.reach, r.engagements, r.newFollowers, r.linkClicks, r.followers];
  }
  for (const r of campaigns) {
    const d = data[r.company];
    if (!d) continue;
    const c = (d.campaigns[`${r.platform}:${r.campaignId}`] ??= { platform: r.platform, id: r.campaignId, name: r.campaignName, active: r.active, days: {} });
    c.name = r.campaignName;
    c.active = r.active;
    c.days[r.date.toISOString().slice(0, 10)] = [r.spend, r.leads, r.revenue];
  }
  for (const p of posts) {
    data[p.company]?.posts.push({
      pl: p.platform,
      t: p.title,
      type: p.type,
      d: p.publishedAt.toISOString().slice(0, 10),
      reach: p.reach,
      eng: p.engagements,
      url: p.permalink,
      img: p.imageUrl,
    });
  }

  return {
    companies: GROUP_COMPANIES,
    providers: Object.fromEntries(GROUP_PROVIDERS.map((p) => [p, configured(p)])),
    connections: conns.map(shapeConnection),
    links: links.map((l) => ({ company: l.company, provider: l.provider, connectionId: l.connectionId, selected: l.selected, lastSyncAt: l.lastSyncAt, lastError: l.lastError })),
    syncing: isSyncing(),
    firstDay: FIRST_DAY,
    today: new Date().toISOString().slice(0, 10),
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { metrics: v.metrics, posts: v.posts, campaigns: Object.values(v.campaigns) }])),
  };
}

// ─── Connecting ─────────────────────────────────────────────

export function startConnect(actor: Actor, provider: string) {
  if (!isProvider(provider)) throw ApiError.badRequest('This platform cannot be connected');
  if (!configured(provider)) throw ApiError.badRequest(`Connecting ${LABEL[provider]} is not set up yet`);
  const state = jwt.sign({ uid: actor.id, role: actor.type, name: actor.name, provider } satisfies GroupOAuthState, env.JWT_SECRET, {
    expiresIn: '20m',
    audience: GROUP_OAUTH_AUDIENCE,
  });
  const url =
    provider === 'meta'
      ? meta.authUrl(state)
      : provider === 'tiktok'
        ? tiktok.authUrl(state)
        : provider === 'linkedin'
          ? linkedin.authUrl(state)
          : google.authUrl(provider, state);
  return { url };
}

/** True when a platform's `state` belongs to a group (Marketing) sign-in. */
export function isGroupState(state: string | undefined) {
  if (!state) return false;
  const d = jwt.decode(state) as { aud?: string } | null;
  return d?.aud === GROUP_OAUTH_AUDIENCE;
}

const DONE = 'Connected. In Admin → Marketing → Social Media, open Connected accounts and choose which company each account belongs to. You can close this window.';

/**
 * Finishes a group sign-in (called from the platform's callback when the state
 * is a group one). `platform` is the callback that was hit: meta, tiktok,
 * linkedin or google (YouTube and Google Ads share Google's callback).
 */
export async function completeConnect(platform: 'meta' | 'tiktok' | 'linkedin' | 'google', code: string | undefined, state: string | undefined, error?: string) {
  if (error) return { ok: false, message: `The sign-in was cancelled or refused (${error}). Close this window and try again.` };
  if (!code || !state) return { ok: false, message: 'The sign-in did not complete. Close this window and try again.' };
  let s: GroupOAuthState;
  try {
    s = jwt.verify(state, env.JWT_SECRET, { audience: GROUP_OAUTH_AUDIENCE }) as GroupOAuthState;
  } catch {
    return { ok: false, message: 'This sign-in link has expired. Close this window and press Connect again.' };
  }
  const expected = platform === 'google' ? ['youtube', 'google_ads', ...google.GOOGLE_DATA_PROVIDERS] : [platform];
  if (!expected.includes(s.provider)) return { ok: false, message: 'This sign-in link is for another platform. Close this window and press Connect again.' };
  const provider = s.provider;
  const by = { connectedById: s.uid, connectedByName: s.name };
  try {
    let saved: GConn;
    let message = DONE;
    if (provider === 'meta') {
      const tok = await meta.exchangeCode(code);
      const assets = await meta.listAssets(tok.token);
      const enc = encryptSecret(tok.token);
      if (!enc) return { ok: false, message: 'The account could not be stored securely (encryption key missing).' };
      const fields = { externalName: tok.name, accessTokenEnc: enc, tokenExpiresAt: tok.expiresAt, scopes: tok.scopes, assets: assets as unknown as Prisma.InputJsonValue, status: 'ACTIVE', lastError: null, ...by };
      saved = await prisma.groupSocialConnection.upsert({
        where: { provider_externalUserId: { provider, externalUserId: tok.userId } },
        create: { provider, externalUserId: tok.userId, ...fields },
        update: fields,
      });
      if (!assets.pages.length && !assets.adAccounts.length) message = 'Connected, but this Facebook login has no Pages or ad accounts it can read. Check that it is an admin of the business Pages.';
    } else if (provider === 'tiktok') {
      const tok = await tiktok.exchangeCode(code);
      const f = tiktok.tokenFields(tok);
      if (!f.accessTokenEnc || !f.refreshTokenEnc) return { ok: false, message: 'The account could not be stored securely (encryption key missing).' };
      const user = await tiktok.userInfo(tok.access_token, tok.scope).catch(() => ({ open_id: tok.open_id }) as tiktok.UserInfo);
      const assets = { ...tiktok.profileFrom(user), refreshTokenEnc: f.refreshTokenEnc, refreshExpiresAt: f.refreshExpiresAt };
      const fields = {
        externalName: user.display_name ?? (user.username ? `@${user.username}` : 'TikTok account'),
        accessTokenEnc: f.accessTokenEnc,
        tokenExpiresAt: f.tokenExpiresAt,
        scopes: f.scopes,
        assets: assets as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        lastError: null,
        ...by,
      };
      saved = await prisma.groupSocialConnection.upsert({
        where: { provider_externalUserId: { provider, externalUserId: tok.open_id } },
        create: { provider, externalUserId: tok.open_id, ...fields },
        update: fields,
      });
    } else {
      const tok: TokenSet = provider === 'linkedin' ? await linkedin.exchangeCode(code) : await google.exchangeCode(code, provider);
      let assets: Record<string, unknown>;
      let name: string;
      // LinkedIn and Google Ads: one login lists every Page / ad account, so one connection each.
      // YouTube: one channel per login, so one connection per channel.
      let externalUserId: string = provider;
      if (provider === 'linkedin') {
        const [orgs, member] = await Promise.all([linkedin.listOrgs(tok.access_token), linkedin.memberName(tok.access_token)]);
        assets = { memberName: member, orgs };
        name = member ?? 'LinkedIn';
        if (!orgs.length) message = 'Connected, but this LinkedIn login is not an admin of any company Page.';
      } else if (provider === 'youtube') {
        const ch = await youtube.myChannel(tok.access_token);
        if (!ch) return { ok: false, message: 'This Google account has no YouTube channel. Close this window and sign in with the account (or brand account) that owns the channel.' };
        assets = { channelId: ch.id, title: ch.title, handle: ch.handle, thumbnail: ch.thumbnail, uploadsPlaylist: ch.uploadsPlaylist };
        name = ch.title;
        externalUserId = ch.id;
      } else if (google.isGoogleData(provider)) {
        const r = await search.listChoices(provider, tok.access_token);
        assets = { choices: r.choices };
        name = LABEL[provider];
        if (r.note) message = r.note;
      } else {
        const accounts = await gads.listAccounts(tok.access_token);
        assets = { accounts };
        name = 'Google Ads';
        if (!accounts.length) message = 'Connected, but this Google login cannot read any Google Ads account.';
      }
      const prev = await prisma.groupSocialConnection.findUnique({ where: { provider_externalUserId: { provider, externalUserId } } });
      const f = tokenFields(tok, ((prev?.assets ?? {}) as { refreshTokenEnc?: string | null }).refreshTokenEnc);
      if (!f.accessTokenEnc) return { ok: false, message: 'The account could not be stored securely (encryption key missing).' };
      const fields = {
        externalName: name,
        accessTokenEnc: f.accessTokenEnc,
        tokenExpiresAt: f.tokenExpiresAt,
        scopes: tok.scope ?? null,
        assets: { ...assets, refreshTokenEnc: f.refreshTokenEnc, refreshExpiresAt: f.refreshExpiresAt } as Prisma.InputJsonValue,
        status: 'ACTIVE',
        lastError: null,
        ...by,
      };
      saved = await prisma.groupSocialConnection.upsert({
        where: { provider_externalUserId: { provider, externalUserId } },
        create: { provider, externalUserId, ...fields },
        update: fields,
      });
    }
    // A reconnect: companies already pointed at this login read again with the new access.
    const links = await prisma.groupSocialLink.findMany({ where: { connectionId: saved.id }, select: { id: true } });
    if (links.length) void syncAll(links.map((l) => l.id)).catch(() => undefined);
    return { ok: true, message };
  } catch (err) {
    logger.warn({ err, provider }, 'Group social connect failed');
    return { ok: false, message: `${LABEL[provider]} did not accept the sign-in: ${(err as Error).message}` };
  }
}

export interface LinkInput {
  connectionId?: string | null;
  pageId?: string | null;
  igId?: string | null;
  adAccountId?: string | null;
  assetId?: string | null;
}

/** Point one company at a login (and its Page / Instagram / ad account) for one provider, or unlink it (connectionId null). */
export async function setLink(company: string, provider: string, body: LinkInput) {
  if (!COMPANY_KEYS.includes(company)) throw ApiError.badRequest('Unknown company');
  if (!isProvider(provider)) throw ApiError.badRequest('Unknown platform');
  if (!body.connectionId) {
    // Unlinking stops new reads; figures already fetched stay.
    await prisma.groupSocialLink.deleteMany({ where: { company, provider } });
    search.forget(company);
    return { ok: true };
  }
  const conn = await prisma.groupSocialConnection.findFirst({ where: { id: body.connectionId, provider } });
  if (!conn) throw ApiError.notFound('Connected account not found');
  const a = (conn.assets ?? {}) as Record<string, unknown>;
  let selected: Record<string, string | null> = {};
  const pick = (id: string | null | undefined, ok: (id: string) => boolean, what: string) => {
    if (!id) return null;
    if (!ok(id)) throw ApiError.badRequest(`That ${what} is not on this login`);
    return id;
  };
  if (provider === 'meta') {
    const m = a as unknown as meta.MetaAssets;
    selected = {
      pageId: pick(body.pageId, (id) => m.pages.some((p) => p.id === id), 'Facebook Page'),
      igId: pick(body.igId, (id) => m.pages.some((p) => p.ig?.id === id), 'Instagram account'),
      adAccountId: pick(body.adAccountId, (id) => m.adAccounts.some((x) => x.id === id), 'ad account'),
    };
  } else if (provider === 'linkedin') {
    selected = { orgId: pick(body.assetId, (id) => ((a.orgs ?? []) as { id: string }[]).some((o) => o.id === id), 'company Page') };
  } else if (provider === 'google_ads') {
    selected = { customerId: pick(body.assetId, (id) => ((a.accounts ?? []) as { id: string }[]).some((o) => o.id === id), 'ad account') };
  } else if (google.isGoogleData(provider)) {
    const list = (a.choices ?? []) as search.Choice[];
    const id = pick(body.assetId, (x) => list.some((o) => o.id === x), provider === 'business_profile' ? 'location' : 'property');
    selected =
      provider === 'search_console'
        ? { siteUrl: id }
        : provider === 'google_analytics'
          ? { propertyId: id }
          : { locationId: id, accountId: list.find((o) => o.id === id)?.account ?? null };
  }
  search.forget(company);
  const link = await prisma.groupSocialLink.upsert({
    where: { company_provider: { company, provider } },
    create: { company, provider, connectionId: conn.id, selected: selected as Prisma.InputJsonValue },
    update: { connectionId: conn.id, selected: selected as Prisma.InputJsonValue, lastError: null },
  });
  await syncAll([link.id]);
  return { ok: true };
}

/** Disconnect a login: access ends on the platform's side (best-effort); companies using it are unlinked. Figures already fetched stay. */
export async function disconnect(connectionId: string) {
  const conn = await prisma.groupSocialConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw ApiError.notFound('Connected account not found');
  const a = (conn.assets ?? {}) as { refreshTokenEnc?: string | null };
  if (conn.provider === 'tiktok') await tiktok.revoke(conn.accessTokenEnc);
  else if (conn.provider === 'linkedin') await linkedin.revoke(conn.accessTokenEnc);
  else if (conn.provider === 'youtube' || conn.provider === 'google_ads' || google.isGoogleData(conn.provider)) await google.revoke(conn.accessTokenEnc, a.refreshTokenEnc);
  await prisma.groupSocialConnection.delete({ where: { id: conn.id } });
  return { ok: true };
}

// ─── Syncing ────────────────────────────────────────────────

/** Read these links in the background; the request waits up to SYNC_WAIT_MS (Azure closes long requests). */
async function syncAll(ids: string[], days = FULL_SYNC_DAYS) {
  const job = (async () => {
    for (const id of ids) await syncLink(id, days).catch((err) => logger.warn({ err }, 'Group social: sync failed'));
  })();
  await Promise.race([job, new Promise((r) => setTimeout(r, SYNC_WAIT_MS))]);
}

/** Refresh button: read every company's linked accounts again, then return the page data. */
export async function syncEverything() {
  const links = await prisma.groupSocialLink.findMany({ where: { connection: { status: { not: 'EXPIRED' } } }, select: { id: true } });
  await syncAll(links.map((l) => l.id));
  return getOverview();
}

interface Sink {
  ops: Prisma.PrismaPromise<unknown>[];
  posts: meta.FetchedPost[];
}

function organic(company: string, sink: Sink, platform: string, source: string, day: string, f: meta.OrganicDay) {
  const date = dayDate(day);
  const fields = {
    reach: f.reach ?? 0,
    engagements: f.engagements ?? 0,
    newFollowers: f.newFollowers ?? 0,
    linkClicks: f.linkClicks ?? 0,
    ...(f.followers != null ? { followers: f.followers } : {}),
  };
  sink.ops.push(
    prisma.groupSocialMetricDaily.upsert({
      where: { company_platform_date: { company, platform, date } },
      create: { company, platform, date, source, ...fields },
      update: { source, ...fields },
    })
  );
}

function adsDay(company: string, sink: Sink, platform: string, day: string, v: meta.AdsDay) {
  const date = dayDate(day);
  const fields = { spend: v.spend, clicks: v.clicks, leads: v.leads, revenue: v.revenue, impressions: v.impressions };
  sink.ops.push(
    prisma.groupSocialMetricDaily.upsert({
      where: { company_platform_date: { company, platform, date } },
      create: { company, platform, date, source: platform, ...fields },
      update: { source: platform, ...fields },
    })
  );
}

function campaignDay(company: string, sink: Sink, platform: string, c: meta.FetchedCampaignDay) {
  const date = dayDate(c.date);
  const fields = { campaignName: c.campaignName, active: c.active, spend: c.spend, leads: c.leads, revenue: c.revenue };
  sink.ops.push(
    prisma.groupSocialCampaignDaily.upsert({
      where: { company_platform_campaignId_date: { company, platform, campaignId: c.campaignId, date } },
      create: { company, platform, campaignId: c.campaignId, date, ...fields },
      update: fields,
    })
  );
}

function post(company: string, sink: Sink, p: meta.FetchedPost) {
  sink.posts.push(p);
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
  sink.ops.push(
    prisma.groupSocialPost.upsert({
      where: { company_platform_externalId: { company, platform: p.platform, externalId: p.externalId } },
      create: { company, platform: p.platform, externalId: p.externalId, ...fields },
      update: fields,
    })
  );
}

/** Copy post pictures into our storage once (platform image links expire). */
async function storePictures(company: string, posts: meta.FetchedPost[]) {
  const withPic = posts.filter((p) => p.pictureUrl);
  if (!withPic.length) return;
  const missing = await prisma.groupSocialPost.findMany({
    where: { company, imageUrl: null, externalId: { in: withPic.map((p) => p.externalId) } },
    select: { id: true, platform: true, externalId: true },
  });
  const byKey = new Map(withPic.map((p) => [`${p.platform}:${p.externalId}`, p.pictureUrl!]));
  for (const row of missing.slice(0, PICTURES_PER_SYNC)) {
    const src = byKey.get(`${row.platform}:${row.externalId}`);
    if (!src) continue;
    try {
      const stored = await copyPicture(src, `group-social/${company}/${row.platform}-${row.externalId.replace(/[^A-Za-z0-9_-]/g, '_')}`);
      if (stored) await prisma.groupSocialPost.update({ where: { id: row.id }, data: { imageUrl: stored } });
    } catch (err) {
      logger.warn({ err, post: row.externalId }, 'Group social: could not copy a post picture');
    }
  }
}

/** Read one company's account for one provider into the Group* tables. */
export async function syncLink(linkId: string, days = 30) {
  if (running.has(linkId)) return { skipped: true };
  running.add(linkId);
  try {
    const link = await prisma.groupSocialLink.findUnique({ where: { id: linkId }, include: { connection: true } });
    if (!link || link.connection.status === 'EXPIRED') return { skipped: true };
    // Search Console, Analytics and Business Profile are read live by the SEO and Local views.
    if (google.isGoogleData(link.provider)) return { skipped: true };
    const conn = link.connection;
    const sink: Sink = { ops: [], posts: [] };
    const warnings: string[] = [];
    try {
      if (conn.provider === 'meta') await readMeta(link, conn, sink, warnings, days);
      else {
        const token = await accessToken(conn);
        if (conn.provider === 'tiktok') await readTikTok(link.company, conn, token, sink, warnings, days);
        else if (conn.provider === 'linkedin') await readLinkedIn(link, token, sink, warnings, days);
        else if (conn.provider === 'youtube') await readYouTube(link.company, token, sink, warnings, days);
        else if (conn.provider === 'google_ads') await readGoogleAds(link, conn, token, sink, warnings, days);
      }
    } catch (err) {
      const expired = isExpired(err);
      const msg = (err as Error).message.slice(0, 500);
      await prisma.groupSocialLink.update({ where: { id: link.id }, data: { lastError: msg } });
      await prisma.groupSocialConnection.update({ where: { id: conn.id }, data: { status: expired ? 'EXPIRED' : conn.status, lastError: msg } });
      return { error: msg };
    }
    for (let i = 0; i < sink.ops.length; i += 500) await prisma.$transaction(sink.ops.slice(i, i + 500));
    await storePictures(link.company, sink.posts).catch((err) => logger.warn({ err }, 'Group social: storing pictures failed'));
    const lastError = warnings.length ? [...new Set(warnings)].join('; ').slice(0, 500) : null;
    const now = new Date();
    await prisma.groupSocialLink.update({ where: { id: link.id }, data: { lastSyncAt: now, lastError } });
    await prisma.groupSocialConnection.update({ where: { id: conn.id }, data: { status: 'ACTIVE', lastSyncAt: now, lastError: null } });
    return { ok: true, warnings };
  } finally {
    running.delete(linkId);
  }
}

async function readMeta(link: GLink, conn: GConn, sink: Sink, warnings: string[], days: number) {
  const sel = (link.selected ?? {}) as meta.MetaSelection;
  if (!sel.pageId && !sel.igId && !sel.adAccountId) {
    warnings.push('Choose the Facebook Page, Instagram account or ad account for this company.');
    return;
  }
  const { since, until } = span(days);
  const res = await meta.fetchAll(conn.accessTokenEnc, conn.assets as unknown as meta.MetaAssets, sel, since, until);
  warnings.push(...res.warnings);
  if (res.synced.fb) for (const [day, v] of res.organic.fb) organic(link.company, sink, 'fb', 'meta', day, v);
  if (res.synced.ig) for (const [day, v] of res.organic.ig) organic(link.company, sink, 'ig', 'meta', day, v);
  if (res.ads) for (const [day, v] of res.ads) adsDay(link.company, sink, 'meta_ads', day, v);
  for (const c of res.campaigns) campaignDay(link.company, sink, 'meta_ads', c);
  for (const p of res.posts) post(link.company, sink, p);
}

async function readTikTok(company: string, conn: GConn, token: string, sink: Sink, warnings: string[], days: number) {
  const { since, today } = span(days);
  const scopes = conn.scopes ?? '';
  const user = await tiktok.userInfo(token, scopes);
  let videos: tiktok.Video[] = [];
  if (scopes.split(',').includes('video.list')) {
    videos = await tiktok.listVideos(token, since).catch((err) => {
      if (isExpired(err)) throw err;
      warnings.push(`TikTok videos could not be read: ${(err as Error).message}`);
      return [];
    });
  } else warnings.push('Video figures need the video.list permission. Reconnect TikTok and allow it.');
  const interactions = (v: tiktok.Video) => (v.like_count ?? 0) + (v.comment_count ?? 0) + (v.share_count ?? 0);
  // TikTok gives lifetime figures per video, so a video's views count on the day it was published.
  const byDay = new Map<string, meta.OrganicDay>();
  for (const v of videos) {
    const d = new Date(v.create_time * 1000).toISOString().slice(0, 10);
    const cur = byDay.get(d) ?? { reach: 0, engagements: 0 };
    cur.reach = (cur.reach ?? 0) + (v.view_count ?? 0);
    cur.engagements = (cur.engagements ?? 0) + interactions(v);
    byDay.set(d, cur);
  }
  byDay.set(today, { ...(byDay.get(today) ?? { reach: 0, engagements: 0 }), ...(user.follower_count != null ? { followers: user.follower_count } : {}) });
  for (const [day, v] of byDay) organic(company, sink, 'tt', 'tiktok', day, v);
  for (const v of videos) {
    post(company, sink, {
      platform: 'tt',
      externalId: v.id,
      title: (v.title || v.video_description || 'TikTok video').split('\n')[0].slice(0, 140),
      type: 'Video',
      publishedAt: new Date(v.create_time * 1000),
      reach: v.view_count ?? 0,
      engagements: interactions(v),
      shares: v.share_count ?? null,
      permalink: v.share_url ?? null,
      pictureUrl: v.cover_image_url ?? null,
      stats: { views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count },
    });
  }
}

async function readLinkedIn(link: GLink, token: string, sink: Sink, warnings: string[], days: number) {
  const orgId = ((link.selected ?? {}) as { orgId?: string | null }).orgId;
  if (!orgId) {
    warnings.push('Choose the LinkedIn company Page for this company.');
    return;
  }
  const { since, until, today } = span(days);
  const [daysMap, followers, posts] = await Promise.all([
    linkedin.dailyStats(token, orgId, since, until, warnings),
    linkedin.followerCount(token, orgId).catch((err) => {
      warnings.push(`LinkedIn followers could not be read: ${(err as Error).message}`);
      return null;
    }),
    linkedin.listPosts(token, orgId, since).catch((err) => {
      if (isExpired(err)) throw err;
      warnings.push(`LinkedIn posts could not be read: ${(err as Error).message}`);
      return [] as linkedin.LinkedInPost[];
    }),
  ]);
  if (!daysMap.has(today)) daysMap.set(today, { impressions: 0, clicks: 0, likes: 0, comments: 0, shares: 0, newFollowersOrganic: 0, newFollowersPaid: 0, pageViews: 0, desktopViews: 0, mobileViews: 0 });
  for (const [day, v] of daysMap) {
    organic(link.company, sink, 'li', 'linkedin', day, {
      reach: v.impressions,
      engagements: v.likes + v.comments + v.shares,
      newFollowers: v.newFollowersOrganic + v.newFollowersPaid,
      linkClicks: v.clicks,
      ...(day === today && followers != null ? { followers } : {}),
    });
  }
  for (const p of posts) {
    post(link.company, sink, {
      platform: 'li',
      externalId: p.id,
      title: (p.text || 'LinkedIn post').split('\n')[0].slice(0, 140),
      type: 'Post',
      publishedAt: p.publishedAt,
      reach: p.impressions,
      engagements: p.likes + p.comments + p.shares,
      shares: p.shares,
      permalink: linkedin.postUrl(p.id),
      pictureUrl: null,
      stats: { views: p.impressions, likes: p.likes, comments: p.comments, shares: p.shares },
    });
  }
}

async function readYouTube(company: string, token: string, sink: Sink, warnings: string[], days: number) {
  const { since, until, today } = span(days);
  const ch = await youtube.myChannel(token);
  if (!ch) throw new ConnectionError('The connected Google account no longer has a YouTube channel. Reconnect YouTube.', true);
  const [daily, videos] = await Promise.all([
    youtube.daily(token, since, until).catch((err) => {
      if (isExpired(err)) throw err;
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
  for (const [day, v] of daily) {
    organic(company, sink, 'yt', 'youtube', day, {
      reach: v.views,
      engagements: v.likes + v.comments + v.shares,
      newFollowers: v.subsGained,
      linkClicks: 0,
      ...(day === today && ch.subscribers != null ? { followers: ch.subscribers } : {}),
    });
  }
  for (const v of videos) {
    post(company, sink, {
      platform: 'yt',
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
    });
  }
}

async function readGoogleAds(link: GLink, conn: GConn, token: string, sink: Sink, warnings: string[], days: number) {
  const id = ((link.selected ?? {}) as { customerId?: string | null }).customerId;
  if (!id) {
    warnings.push('Choose the Google Ads account for this company.');
    return;
  }
  const acc = ((conn.assets ?? {}) as Partial<gads.GoogleAdsAssets>).accounts?.find((a) => a.id === id);
  if (!acc) {
    warnings.push('The chosen Google Ads account is no longer on this login. Reconnect Google Ads.');
    return;
  }
  const { since, until } = span(days);
  const daily = await gads.daily(token, acc, since, until);
  for (const [day, v] of daily) adsDay(link.company, sink, 'google_ads', day, v);
  const camps = await gads.campaignDays(token, acc, since, until).catch((err) => {
    warnings.push(`Google Ads campaigns could not be read: ${(err as Error).message}`);
    return [] as gads.CampaignDay[];
  });
  for (const c of camps) campaignDay(link.company, sink, 'google_ads', c);
}
