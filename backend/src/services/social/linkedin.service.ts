import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { credentialEncryptionReady, decryptSecret } from '../../utils/secretBox.js';
import { ConnectionError, accessTokenFor, readAll, readRange, sizeOf, sleep, tokenRequest, type RefreshFields, type TokenSet } from './oauth2.js';

/**
 * LinkedIn Company Pages through the customer's own LinkedIn login
 * (Community Management API). The person signing in must be an admin of the
 * company Page. We read the Page's daily figures and posts, and publish
 * approved Content Calendar posts to it.
 *
 * LinkedIn access tokens last 60 days. Apps LinkedIn has enabled for it also
 * get a refresh token (a year); otherwise the customer reconnects when the
 * token runs out.
 */

const REST = 'https://api.linkedin.com/rest';
const OAUTH = 'https://www.linkedin.com/oauth/v2';
export const LABEL = 'LinkedIn';

export function linkedinConfigured(): boolean {
  return !!(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET && env.LINKEDIN_REDIRECT_URI) && credentialEncryptionReady();
}

/** What is kept in SocialConnection.assets for a LinkedIn connection. Tokens never go to the browser. */
export interface LinkedInAssets extends RefreshFields {
  memberName: string | null;
  orgs: { id: string; name: string; vanity: string | null }[];
}
export interface LinkedInSelection {
  orgId?: string | null;
}

export function publicAssets(a: unknown) {
  const x = (a ?? {}) as Partial<LinkedInAssets>;
  return { choices: (x.orgs ?? []).map((o) => ({ id: o.id, name: o.name, url: o.vanity ? `https://www.linkedin.com/company/${o.vanity}/` : null })) };
}

// ─── Login ──────────────────────────────────────────────────

export function authUrl(state: string) {
  const u = new URL(`${OAUTH}/authorization`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.LINKEDIN_CLIENT_ID!);
  u.searchParams.set('redirect_uri', env.LINKEDIN_REDIRECT_URI!);
  u.searchParams.set('state', state);
  u.searchParams.set('scope', env.LINKEDIN_SCOPES);
  return u.toString();
}

export const exchangeCode = (code: string) =>
  tokenRequest(
    `${OAUTH}/accessToken`,
    { grant_type: 'authorization_code', code, client_id: env.LINKEDIN_CLIENT_ID!, client_secret: env.LINKEDIN_CLIENT_SECRET!, redirect_uri: env.LINKEDIN_REDIRECT_URI! },
    LABEL
  );

export const refresh = (refreshToken: string): Promise<TokenSet> =>
  tokenRequest(`${OAUTH}/accessToken`, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: env.LINKEDIN_CLIENT_ID!, client_secret: env.LINKEDIN_CLIENT_SECRET! }, LABEL);

export const accessToken = (conn: { id: string; accessTokenEnc: string; tokenExpiresAt: Date | null }) => accessTokenFor(conn, refresh, LABEL);

export async function revoke(accessTokenEnc: string) {
  const token = decryptSecret(accessTokenEnc);
  if (!token || !linkedinConfigured()) return;
  await fetch(`${OAUTH}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.LINKEDIN_CLIENT_ID!, client_secret: env.LINKEDIN_CLIENT_SECRET!, token }),
    signal: AbortSignal.timeout(20_000),
  }).catch((err) => logger.warn({ err }, 'LinkedIn: revoking the token failed'));
}

// ─── API calls ──────────────────────────────────────────────

const FRIENDLY: Record<number, string> = {
  401: 'The LinkedIn access has expired or was removed. Reconnect LinkedIn.',
  403: 'LinkedIn did not allow this. The person who connected must be an admin of the company Page, and the app needs the Community Management API.',
  426: 'The LinkedIn API version in use has been retired. Update LINKEDIN_API_VERSION on the server.',
  429: 'LinkedIn is limiting requests. Try again later.',
};

/** Call LinkedIn's versioned REST API. `query` is appended as is (Rest.li syntax must not be re-encoded). */
async function call<T>(method: 'GET' | 'POST', path: string, token: string, opts: { query?: string; body?: unknown; finder?: boolean } = {}) {
  const res = await fetch(`${REST}${path}${opts.query ? `?${opts.query}` : ''}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'LinkedIn-Version': env.LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json = {} as T & { message?: string };
  try {
    if (text) json = JSON.parse(text) as T & { message?: string };
  } catch {
    /* not JSON — the status code says enough */
  }
  if (!res.ok) throw new ConnectionError(FRIENDLY[res.status] ?? json.message ?? `LinkedIn request failed (${res.status})`, res.status === 401, res.status);
  return { json: json as T, headers: res.headers };
}

const enc = encodeURIComponent;
const orgUrn = (id: string) => `urn:li:organization:${id}`;

/** The company Pages this login is an admin (or content admin / analyst) of. */
export async function listOrgs(token: string) {
  const { json } = await call<{ elements?: { organization?: string; role?: string; state?: string }[] }>('GET', '/organizationAcls', token, {
    query: 'q=roleAssignee&state=APPROVED&count=100',
  });
  const ids = [...new Set((json.elements ?? []).map((e) => e.organization?.split(':').pop()).filter((x): x is string => !!x))];
  const out: LinkedInAssets['orgs'] = [];
  for (const id of ids.slice(0, 50)) {
    try {
      const { json: o } = await call<{ localizedName?: string; vanityName?: string }>('GET', `/organizations/${id}`, token);
      out.push({ id, name: o.localizedName ?? `Company ${id}`, vanity: o.vanityName ?? null });
    } catch (err) {
      logger.warn({ err, id }, 'LinkedIn: could not read a company Page');
      out.push({ id, name: `Company ${id}`, vanity: null });
    }
  }
  return out;
}

/** The signed-in member's name (best-effort; needs r_basicprofile). */
export async function memberName(token: string) {
  try {
    const res = await fetch('https://api.linkedin.com/v2/me', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { localizedFirstName?: string; localizedLastName?: string };
    return [j.localizedFirstName, j.localizedLastName].filter(Boolean).join(' ') || null;
  } catch {
    return null;
  }
}

export async function followerCount(token: string, orgId: string) {
  const { json } = await call<{ firstDegreeSize?: number }>('GET', `/networkSizes/${enc(orgUrn(orgId))}`, token, { query: 'edgeType=COMPANY_FOLLOWED_BY_MEMBER' });
  return json.firstDegreeSize ?? null;
}

interface TimeRange {
  start: number;
  end: number;
}
const interval = (since: Date, until: Date) => `timeIntervals=(timeRange:(start:${since.getTime()},end:${until.getTime()}),timeGranularityType:DAY)`;
const dayOf = (t: TimeRange) => new Date(t.start).toISOString().slice(0, 10);

export interface LinkedInDay {
  impressions: number;
  clicks: number;
  likes: number;
  comments: number;
  shares: number;
  newFollowersOrganic: number;
  newFollowersPaid: number;
  pageViews: number;
  desktopViews: number;
  mobileViews: number;
}

/** Daily Page figures between two dates. LinkedIn keeps about a year of daily figures. */
export async function dailyStats(token: string, orgId: string, since: Date, until: Date, warnings: string[]) {
  const days = new Map<string, LinkedInDay>();
  const day = (d: string) => {
    let v = days.get(d);
    if (!v) days.set(d, (v = { impressions: 0, clicks: 0, likes: 0, comments: 0, shares: 0, newFollowersOrganic: 0, newFollowersPaid: 0, pageViews: 0, desktopViews: 0, mobileViews: 0 }));
    return v;
  };
  // LinkedIn only answers for the last 12 months.
  const floor = new Date(Date.now() - 360 * 86400_000);
  const from = since < floor ? floor : since;
  const org = enc(orgUrn(orgId));
  const q = `${interval(from, until)}`;
  try {
    const { json } = await call<{ elements?: { timeRange: TimeRange; totalShareStatistics?: Record<string, number> }[] }>('GET', '/organizationalEntityShareStatistics', token, {
      query: `q=organizationalEntity&organizationalEntity=${org}&${q}`,
    });
    for (const e of json.elements ?? []) {
      const s = e.totalShareStatistics ?? {};
      Object.assign(day(dayOf(e.timeRange)), { impressions: s.impressionCount ?? 0, clicks: s.clickCount ?? 0, likes: s.likeCount ?? 0, comments: s.commentCount ?? 0, shares: s.shareCount ?? 0 });
    }
  } catch (err) {
    if ((err as ConnectionError).expired) throw err;
    warnings.push(`LinkedIn post figures could not be read: ${(err as Error).message}`);
  }
  try {
    const { json } = await call<{ elements?: { timeRange: TimeRange; followerGains?: { organicFollowerGain?: number; paidFollowerGain?: number } }[] }>(
      'GET',
      '/organizationalEntityFollowerStatistics',
      token,
      { query: `q=organizationalEntity&organizationalEntity=${org}&${q}` }
    );
    for (const e of json.elements ?? []) {
      const d = day(dayOf(e.timeRange));
      d.newFollowersOrganic = e.followerGains?.organicFollowerGain ?? 0;
      d.newFollowersPaid = e.followerGains?.paidFollowerGain ?? 0;
    }
  } catch (err) {
    warnings.push(`LinkedIn follower figures could not be read: ${(err as Error).message}`);
  }
  try {
    type Views = { pageViews?: number };
    const { json } = await call<{ elements?: { timeRange: TimeRange; totalPageStatistics?: { views?: Record<string, Views> } }[] }>('GET', '/organizationPageStatistics', token, {
      query: `q=organization&organization=${org}&${q}`,
    });
    for (const e of json.elements ?? []) {
      const v = e.totalPageStatistics?.views ?? {};
      Object.assign(day(dayOf(e.timeRange)), {
        pageViews: v.allPageViews?.pageViews ?? 0,
        desktopViews: v.allDesktopPageViews?.pageViews ?? 0,
        mobileViews: v.allMobilePageViews?.pageViews ?? 0,
      });
    }
  } catch (err) {
    warnings.push(`LinkedIn Page visits could not be read: ${(err as Error).message}`);
  }
  return days;
}

export interface LinkedInPost {
  id: string;
  text: string;
  publishedAt: Date;
  impressions: number;
  clicks: number;
  likes: number;
  comments: number;
  shares: number;
}

/** The Page's posts back to `since`, with each post's lifetime figures. */
export async function listPosts(token: string, orgId: string, since: Date): Promise<LinkedInPost[]> {
  const posts: { id: string; text: string; publishedAt: Date }[] = [];
  for (let start = 0; start < 500; start += 50) {
    const { json } = await call<{ elements?: { id: string; commentary?: string; publishedAt?: number; createdAt?: number; lifecycleState?: string }[] }>('GET', '/posts', token, {
      query: `author=${enc(orgUrn(orgId))}&q=author&count=50&start=${start}&sortBy=CREATED`,
    });
    const el = json.elements ?? [];
    for (const p of el) {
      const at = p.publishedAt ?? p.createdAt;
      if (!at || p.lifecycleState === 'DRAFT') continue;
      posts.push({ id: p.id, text: unescapeLittle(p.commentary ?? ''), publishedAt: new Date(at) });
    }
    if (el.length < 50 || el.some((p) => (p.publishedAt ?? p.createdAt ?? 0) < since.getTime())) break;
  }
  const recent = posts.filter((p) => p.publishedAt >= since);
  const stats = new Map<string, Record<string, number>>();
  for (let i = 0; i < recent.length; i += 20) {
    const batch = recent.slice(i, i + 20);
    const shares = batch.filter((p) => p.id.startsWith('urn:li:share:')).map((p) => enc(p.id));
    const ugc = batch.filter((p) => p.id.startsWith('urn:li:ugcPost:')).map((p) => enc(p.id));
    const parts = [shares.length ? `shares=List(${shares.join(',')})` : '', ugc.length ? `ugcPosts=List(${ugc.join(',')})` : ''].filter(Boolean).join('&');
    if (!parts) continue;
    try {
      const { json } = await call<{ elements?: { share?: string; ugcPost?: string; totalShareStatistics?: Record<string, number> }[] }>('GET', '/organizationalEntityShareStatistics', token, {
        query: `q=organizationalEntity&organizationalEntity=${enc(orgUrn(orgId))}&${parts}`,
      });
      for (const e of json.elements ?? []) {
        const id = e.share ?? e.ugcPost;
        if (id) stats.set(id, e.totalShareStatistics ?? {});
      }
    } catch (err) {
      logger.warn({ err }, 'LinkedIn: post figures failed');
    }
  }
  return recent.map((p) => {
    const s = stats.get(p.id) ?? {};
    return { ...p, impressions: s.impressionCount ?? 0, clicks: s.clickCount ?? 0, likes: s.likeCount ?? 0, comments: s.commentCount ?? 0, shares: s.shareCount ?? 0 };
  });
}

export const postUrl = (urn: string) => `https://www.linkedin.com/feed/update/${urn}/`;

// ─── Publishing ─────────────────────────────────────────────

/** LinkedIn post text uses "little text": reserved characters are escaped and hashtags are written as {hashtag|\#|tag}. */
export function toLittleText(text: string) {
  const escaped = text.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
  return escaped.replace(/\\#([\p{L}\p{N}_]+)/gu, (_m, tag: string) => `{hashtag|\\#|${tag.replace(/\\_/g, '_')}}`);
}
function unescapeLittle(text: string) {
  return text.replace(/\{hashtag\|\\#\|([^}]+)\}/g, '#$1').replace(/\\([\\|{}@[\]()<>#*_~])/g, '$1');
}

export interface PublishInput {
  orgId: string;
  text: string;
  title: string;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaSize: number | null;
}

export const LI = { text: 3000, imageBytes: 36 * 1024 * 1024, videoBytes: 500 * 1024 * 1024 };

async function uploadImage(token: string, owner: string, src: string) {
  const { json } = await call<{ value: { uploadUrl: string; image: string } }>('POST', '/images', token, {
    query: 'action=initializeUpload',
    body: { initializeUploadRequest: { owner } },
  });
  const buf = await readAll(src, LI.imageBytes);
  const put = await fetch(json.value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: buf, signal: AbortSignal.timeout(5 * 60_000) });
  if (!put.ok) throw new ConnectionError(`LinkedIn did not accept the image upload (${put.status})`);
  return json.value.image;
}

async function uploadVideo(token: string, owner: string, src: string, known: number | null) {
  const size = await sizeOf(src, known);
  const { json } = await call<{ value: { video: string; uploadToken?: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] } }>('POST', '/videos', token, {
    query: 'action=initializeUpload',
    body: { initializeUploadRequest: { owner, fileSizeBytes: size, uploadCaptions: false, uploadThumbnail: false } },
  });
  const etags: string[] = [];
  for (const part of json.value.uploadInstructions) {
    const buf = await readRange(src, part.firstByte, part.lastByte, size);
    const put = await fetch(part.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: buf, signal: AbortSignal.timeout(10 * 60_000) });
    if (!put.ok) throw new ConnectionError(`LinkedIn did not accept the video upload (${put.status})`);
    etags.push(put.headers.get('etag') ?? '');
  }
  await call('POST', '/videos', token, {
    query: 'action=finalizeUpload',
    body: { finalizeUploadRequest: { video: json.value.video, uploadToken: json.value.uploadToken ?? '', uploadedPartIds: etags } },
  });
  // Wait (up to ~3 minutes) for LinkedIn to finish processing before posting.
  for (let i = 0; i < 36; i++) {
    const { json: v } = await call<{ status?: string }>('GET', `/videos/${enc(json.value.video)}`, token);
    if (v.status === 'AVAILABLE') break;
    if (v.status === 'PROCESSING_FAILED') throw new ConnectionError('LinkedIn could not process the video');
    await sleep(5000);
  }
  return json.value.video;
}

export async function publish(token: string, input: PublishInput) {
  const author = orgUrn(input.orgId);
  let content: Record<string, unknown> | undefined;
  if (input.mediaUrl && input.mediaType) {
    const id = input.mediaType.startsWith('video/') ? await uploadVideo(token, author, input.mediaUrl, input.mediaSize) : await uploadImage(token, author, input.mediaUrl);
    content = { media: { id, ...(input.mediaType.startsWith('video/') ? { title: input.title.slice(0, 200) } : {}) } };
  }
  const { headers } = await call('POST', '/posts', token, {
    body: {
      author,
      commentary: toLittleText(input.text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(content ? { content } : {}),
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    },
  });
  const urn = headers.get('x-restli-id') ?? headers.get('x-linkedin-id') ?? '';
  return { externalId: urn || 'linkedin-post', permalink: urn ? postUrl(urn) : null };
}
