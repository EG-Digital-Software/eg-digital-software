import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { credentialEncryptionReady, decryptSecret, encryptSecret } from '../../utils/secretBox.js';

/**
 * Meta (Facebook Pages, Instagram professional accounts and Meta Ads) through
 * the customer's own Facebook login. Only the Graph API is used — the customer
 * signs in on facebook.com and we receive a token, never a password.
 *
 * Every insight is read on its own and a metric Meta refuses (deprecated,
 * missing permission, not available for that account) is skipped rather than
 * failing the whole sync, so one renamed metric never blanks the dashboard.
 */

const graphBase = () => `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

/** Meta login can be offered: app keys, redirect and the token encryption key are all set. */
export function metaConfigured(): boolean {
  return !!(env.META_APP_ID && env.META_APP_SECRET && env.META_REDIRECT_URI) && credentialEncryptionReady();
}

export class MetaError extends Error {
  constructor(
    message: string,
    public code?: number,
    public subcode?: number
  ) {
    super(message);
  }
  /** The token was revoked, expired or the password changed — the customer must reconnect. */
  get expired() {
    return this.code === 190 || this.code === 102;
  }
}

async function graph<T>(path: string, params: Record<string, string | number | undefined>, token?: string): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : `${graphBase()}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  if (token) url.searchParams.set('access_token', token);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } };
  if (!res.ok || body.error) {
    throw new MetaError(body.error?.message ?? `Meta request failed (${res.status})`, body.error?.code, body.error?.error_subcode);
  }
  return body as T;
}

/** Follow `paging.next` until `stop` says enough (or a hard page cap). */
async function graphPages<T>(path: string, params: Record<string, string | number | undefined>, token: string, stop?: (rows: T[]) => boolean, maxPages = 10) {
  const out: T[] = [];
  let page = await graph<{ data?: T[]; paging?: { next?: string } }>(path, params, token);
  for (let i = 0; i < maxPages; i++) {
    out.push(...(page.data ?? []));
    if (!page.paging?.next || (stop && stop(page.data ?? []))) break;
    page = await graph<{ data?: T[]; paging?: { next?: string } }>(page.paging.next, {}, undefined);
  }
  return out;
}

// ─── Login ──────────────────────────────────────────────────

export function authUrl(state: string): string {
  const url = new URL(`https://www.facebook.com/${env.META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', env.META_APP_ID!);
  url.searchParams.set('redirect_uri', env.META_REDIRECT_URI!);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', env.META_SCOPES);
  return url.toString();
}

/** Code → short-lived token → long-lived (about 60 day) user token. */
export async function exchangeCode(code: string) {
  const short = await graph<{ access_token: string }>('/oauth/access_token', {
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri: env.META_REDIRECT_URI,
    code,
  });
  const long = await graph<{ access_token: string; expires_in?: number }>('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    fb_exchange_token: short.access_token,
  });
  const me = await graph<{ id: string; name?: string }>('/me', { fields: 'id,name' }, long.access_token);
  const perms = await graph<{ data: { permission: string; status: string }[] }>('/me/permissions', {}, long.access_token).catch(() => ({ data: [] }));
  return {
    token: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
    userId: me.id,
    name: me.name ?? null,
    scopes: perms.data.filter((p) => p.status === 'granted').map((p) => p.permission).join(','),
  };
}

export interface MetaAssets {
  pages: { id: string; name: string; tokenEnc: string | null; ig: { id: string; username: string } | null }[];
  adAccounts: { id: string; name: string; currency: string | null }[];
}
export interface MetaSelection {
  pageId?: string | null;
  igId?: string | null;
  adAccountId?: string | null;
}

/** Pages (with their page tokens, encrypted), linked Instagram accounts and ad accounts this login can read. */
export async function listAssets(userToken: string): Promise<MetaAssets> {
  const pages = await graphPages<{ id: string; name: string; access_token?: string; instagram_business_account?: { id: string; username?: string } }>(
    '/me/accounts',
    { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: 100 },
    userToken
  ).catch((err) => {
    logger.warn({ err }, 'Meta: could not list pages');
    return [];
  });
  const ads = await graphPages<{ id: string; name?: string; currency?: string }>('/me/adaccounts', { fields: 'id,name,currency', limit: 100 }, userToken).catch(
    (err) => {
      logger.warn({ err }, 'Meta: could not list ad accounts');
      return [];
    }
  );
  return {
    pages: pages.map((p) => ({
      id: p.id,
      name: p.name,
      tokenEnc: p.access_token ? encryptSecret(p.access_token) : null,
      ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? 'Instagram' } : null,
    })),
    adAccounts: ads.map((a) => ({ id: a.id, name: a.name ?? a.id, currency: a.currency ?? null })),
  };
}

/** Keep a still-valid earlier choice, otherwise pick the first page / Instagram / ad account. */
export function defaultSelection(assets: MetaAssets, previous?: MetaSelection | null): MetaSelection {
  const page = assets.pages.find((p) => p.id === previous?.pageId) ?? assets.pages[0];
  const igs = assets.pages.filter((p) => p.ig).map((p) => p.ig!);
  const ig = igs.find((i) => i.id === previous?.igId) ?? page?.ig ?? igs[0];
  const ad = assets.adAccounts.find((a) => a.id === previous?.adAccountId) ?? assets.adAccounts[0];
  return { pageId: page?.id ?? null, igId: ig?.id ?? null, adAccountId: ad?.id ?? null };
}

// ─── Fetching ───────────────────────────────────────────────

export type DayKey = string; // YYYY-MM-DD
export interface OrganicDay {
  reach?: number;
  engagements?: number;
  newFollowers?: number;
  linkClicks?: number;
  followers?: number;
}
export interface AdsDay {
  spend: number;
  clicks: number;
  leads: number;
  revenue: number;
  impressions: number;
}
export interface FetchedPost {
  platform: 'fb' | 'ig';
  externalId: string;
  title: string;
  type: string;
  publishedAt: Date;
  reach: number;
  engagements: number;
  shares: number | null;
  permalink: string | null;
}
export interface FetchedCampaignDay {
  campaignId: string;
  campaignName: string;
  active: boolean;
  date: DayKey;
  spend: number;
  leads: number;
  revenue: number;
}
export interface MetaSyncResult {
  organic: { fb: Map<DayKey, OrganicDay>; ig: Map<DayKey, OrganicDay> };
  ads: Map<DayKey, AdsDay> | null;
  campaigns: FetchedCampaignDay[];
  posts: FetchedPost[];
  synced: { fb: boolean; ig: boolean; ads: boolean };
  warnings: string[];
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
/** Insight end_time is the end of the day it covers (midnight after), so step back a day. */
const insightDay = (endTime: string) => dayKey(new Date(new Date(endTime).getTime() - 12 * 3600 * 1000));

type InsightRow = { name: string; values: { value: number | Record<string, number>; end_time: string }[] };

/** Daily values of one insight metric, in ≤90-day windows. Null when Meta refuses the metric. */
async function dailyMetric(objectId: string, metric: string, since: Date, until: Date, token: string, extra: Record<string, string> = {}) {
  const out = new Map<DayKey, number>();
  try {
    for (let start = new Date(since); start < until; ) {
      const end = new Date(Math.min(until.getTime(), start.getTime() + 90 * 86400_000));
      const res = await graph<{ data: InsightRow[] }>(`/${objectId}/insights`, { metric, period: 'day', since: unix(start), until: unix(end), ...extra }, token);
      for (const row of res.data ?? []) {
        for (const v of row.values ?? []) {
          const n = typeof v.value === 'number' ? v.value : Object.values(v.value ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
          out.set(insightDay(v.end_time), (out.get(insightDay(v.end_time)) ?? 0) + n);
        }
      }
      start = end;
    }
    return out;
  } catch (err) {
    if (err instanceof MetaError && err.expired) throw err;
    return null;
  }
}

/** First metric name Meta accepts, of several (names change between Graph versions). */
async function firstMetric(objectId: string, names: string[], since: Date, until: Date, token: string, warnings: string[], label: string) {
  for (const name of names) {
    const m = await dailyMetric(objectId, name, since, until, token);
    if (m) return m;
  }
  warnings.push(`${label} is not available from Meta for this account`);
  return null;
}

function mergeInto(target: Map<DayKey, OrganicDay>, src: Map<DayKey, number> | null, field: keyof OrganicDay) {
  if (!src) return;
  for (const [d, v] of src) target.set(d, { ...(target.get(d) ?? {}), [field]: v });
}

const LEAD_ACTIONS = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'onsite_web_lead'];
const PURCHASE_ACTIONS = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'];
/** One action type per family, so the same conversion is not counted twice. */
function actionTotal(list: { action_type: string; value: string }[] | undefined, types: string[]) {
  for (const t of types) {
    const hit = list?.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

export async function fetchAll(userTokenEnc: string, assets: MetaAssets, sel: MetaSelection, since: Date, until: Date): Promise<MetaSyncResult> {
  const userToken = decryptSecret(userTokenEnc);
  if (!userToken) throw new MetaError('The stored Meta token cannot be read (check CREDENTIAL_ENC_KEY)', 190);
  const warnings: string[] = [];
  const result: MetaSyncResult = {
    organic: { fb: new Map(), ig: new Map() },
    ads: null,
    campaigns: [],
    posts: [],
    synced: { fb: false, ig: false, ads: false },
    warnings,
  };
  const page = assets.pages.find((p) => p.id === sel.pageId);
  const pageToken = page?.tokenEnc ? decryptSecret(page.tokenEnc) : null;
  const today = dayKey(new Date());

  // Facebook Page
  if (page && pageToken) {
    const fb = result.organic.fb;
    mergeInto(fb, await firstMetric(page.id, ['page_impressions_unique', 'page_total_media_view_unique'], since, until, pageToken, warnings, 'Facebook reach'), 'reach');
    mergeInto(fb, await firstMetric(page.id, ['page_post_engagements'], since, until, pageToken, warnings, 'Facebook engagements'), 'engagements');
    mergeInto(fb, await firstMetric(page.id, ['page_daily_follows_unique', 'page_fan_adds_unique'], since, until, pageToken, warnings, 'Facebook new followers'), 'newFollowers');
    mergeInto(fb, await firstMetric(page.id, ['page_total_actions'], since, until, pageToken, warnings, 'Facebook link clicks'), 'linkClicks');
    const info = await graph<{ followers_count?: number; fan_count?: number }>(`/${page.id}`, { fields: 'followers_count,fan_count' }, pageToken).catch(() => null);
    const followers = info?.followers_count ?? info?.fan_count;
    if (followers != null) fb.set(today, { ...(fb.get(today) ?? {}), followers });
    result.synced.fb = true;

    const fbPosts = await graphPages<{
      id: string;
      message?: string;
      created_time: string;
      permalink_url?: string;
      status_type?: string;
      shares?: { count: number };
      reactions?: { summary?: { total_count: number } };
      comments?: { summary?: { total_count: number } };
    }>(
      `/${page.id}/posts`,
      {
        fields: 'id,message,created_time,permalink_url,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
        since: unix(since),
        until: unix(until),
        limit: 50,
      },
      pageToken,
      undefined,
      4
    ).catch(() => {
      warnings.push('Facebook posts could not be read');
      return [];
    });
    for (const p of fbPosts.slice(0, 100)) {
      const ins = await graph<{ data: InsightRow[] }>(`/${p.id}/insights`, { metric: 'post_impressions_unique' }, pageToken).catch(() => null);
      const reach = Number(ins?.data?.[0]?.values?.[0]?.value ?? 0) || 0;
      const shares = p.shares?.count ?? 0;
      result.posts.push({
        platform: 'fb',
        externalId: p.id,
        title: (p.message ?? 'Facebook post').split('\n')[0].slice(0, 140),
        type: p.status_type === 'added_video' ? 'Video' : p.status_type === 'added_photos' ? 'Photo' : 'Post',
        publishedAt: new Date(p.created_time),
        reach,
        engagements: (p.reactions?.summary?.total_count ?? 0) + (p.comments?.summary?.total_count ?? 0) + shares,
        shares,
        permalink: p.permalink_url ?? null,
      });
    }
  }

  // Instagram professional account (read with the page token of the page it is linked to)
  const igPage = assets.pages.find((p) => p.ig?.id === sel.igId);
  const igToken = igPage?.tokenEnc ? decryptSecret(igPage.tokenEnc) : null;
  if (sel.igId && igToken) {
    const ig = result.organic.ig;
    mergeInto(ig, await firstMetric(sel.igId, ['reach'], since, until, igToken, warnings, 'Instagram reach'), 'reach');
    // Meta only returns daily follower gains for the last 30 days.
    const from30 = new Date(Math.max(since.getTime(), until.getTime() - 29 * 86400_000));
    mergeInto(ig, await firstMetric(sel.igId, ['follower_count'], from30, until, igToken, warnings, 'Instagram new followers'), 'newFollowers');
    mergeInto(ig, await firstMetric(sel.igId, ['website_clicks'], since, until, igToken, warnings, 'Instagram link clicks'), 'linkClicks');
    const info = await graph<{ followers_count?: number }>(`/${sel.igId}`, { fields: 'followers_count' }, igToken).catch(() => null);
    if (info?.followers_count != null) ig.set(today, { ...(ig.get(today) ?? {}), followers: info.followers_count });

    const media = await graphPages<{
      id: string;
      caption?: string;
      media_type?: string;
      media_product_type?: string;
      timestamp: string;
      permalink?: string;
      like_count?: number;
      comments_count?: number;
    }>(
      `/${sel.igId}/media`,
      { fields: 'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count', limit: 50 },
      igToken,
      (rows) => rows.some((r) => new Date(r.timestamp) < since),
      6
    ).catch(() => {
      warnings.push('Instagram posts could not be read');
      return [];
    });
    // Engagement per day = interactions on the posts published that day (Meta gives no daily account total).
    const engByDay = new Map<DayKey, number>();
    for (const m of media.filter((x) => new Date(x.timestamp) >= since && new Date(x.timestamp) <= until)) {
      const ins = await graph<{ data: InsightRow[] }>(`/${m.id}/insights`, { metric: 'reach,shares,saved' }, igToken).catch(() => null);
      const val = (n: string) => Number(ins?.data?.find((r) => r.name === n)?.values?.[0]?.value ?? 0) || 0;
      const shares = ins ? val('shares') : null;
      const eng = (m.like_count ?? 0) + (m.comments_count ?? 0) + (shares ?? 0) + (ins ? val('saved') : 0);
      const d = dayKey(new Date(m.timestamp));
      engByDay.set(d, (engByDay.get(d) ?? 0) + eng);
      result.posts.push({
        platform: 'ig',
        externalId: m.id,
        title: (m.caption ?? 'Instagram post').split('\n')[0].slice(0, 140),
        type: m.media_product_type === 'REELS' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : m.media_type === 'VIDEO' ? 'Video' : 'Photo',
        publishedAt: new Date(m.timestamp),
        reach: ins ? val('reach') : 0,
        engagements: eng,
        shares,
        permalink: m.permalink ?? null,
      });
    }
    mergeInto(ig, engByDay, 'engagements');
    result.synced.ig = true;
  }

  // Meta Ads
  if (sel.adAccountId) {
    try {
      const statuses = await graphPages<{ id: string; effective_status?: string }>(`/${sel.adAccountId}/campaigns`, { fields: 'id,effective_status', limit: 500 }, userToken).catch(
        () => []
      );
      const active = new Map(statuses.map((c) => [c.id, c.effective_status === 'ACTIVE']));
      const rows = await graphPages<{
        campaign_id: string;
        campaign_name: string;
        date_start: string;
        spend?: string;
        clicks?: string;
        impressions?: string;
        actions?: { action_type: string; value: string }[];
        action_values?: { action_type: string; value: string }[];
      }>(
        `/${sel.adAccountId}/insights`,
        {
          level: 'campaign',
          time_increment: 1,
          time_range: JSON.stringify({ since: dayKey(since), until: dayKey(until) }),
          fields: 'campaign_id,campaign_name,spend,clicks,impressions,actions,action_values',
          limit: 500,
        },
        userToken,
        undefined,
        20
      );
      const ads = new Map<DayKey, AdsDay>();
      for (const r of rows) {
        const leads = actionTotal(r.actions, LEAD_ACTIONS);
        const revenue = actionTotal(r.action_values, PURCHASE_ACTIONS);
        const spend = Number(r.spend) || 0;
        const day = ads.get(r.date_start) ?? { spend: 0, clicks: 0, leads: 0, revenue: 0, impressions: 0 };
        day.spend += spend;
        day.clicks += Number(r.clicks) || 0;
        day.impressions += Number(r.impressions) || 0;
        day.leads += leads;
        day.revenue += revenue;
        ads.set(r.date_start, day);
        result.campaigns.push({
          campaignId: r.campaign_id,
          campaignName: r.campaign_name,
          active: active.get(r.campaign_id) ?? false,
          date: r.date_start,
          spend,
          leads,
          revenue,
        });
      }
      result.ads = ads;
      result.synced.ads = true;
    } catch (err) {
      if (err instanceof MetaError && err.expired) throw err;
      warnings.push(`Meta Ads could not be read: ${(err as Error).message}`);
    }
  }
  return result;
}
