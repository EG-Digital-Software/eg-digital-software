import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { credentialEncryptionReady, decryptSecret, encryptSecret } from '../../utils/secretBox.js';

/**
 * TikTok through the customer's own TikTok login (Login Kit, Display API and
 * Content Posting API). The customer signs in on tiktok.com and we receive a
 * token, never a password.
 *
 * TikTok access tokens last 24 hours and refresh tokens a year, and each
 * refresh may hand out a new refresh token. The refresh token is kept
 * (encrypted) in the connection's `assets` and every caller goes through
 * `accessToken()`, which refreshes when needed.
 */

const API = 'https://open.tiktokapis.com/v2';

/** TikTok login can be offered: app keys, redirect and the token encryption key are all set. */
export function tiktokConfigured(): boolean {
  return !!(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.TIKTOK_REDIRECT_URI) && credentialEncryptionReady();
}

export class TikTokError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number
  ) {
    super(message);
  }
  /** The access was revoked or can no longer be refreshed — the customer must reconnect. */
  get expired() {
    return ['access_token_invalid', 'invalid_grant', 'refresh_token_invalid', 'token_expired', 'reconnect'].includes(this.code ?? '');
  }
}

/** Plain-language versions of TikTok's error codes the team is most likely to see. */
const FRIENDLY: Record<string, string> = {
  access_token_invalid: 'The TikTok access has expired or was removed. Reconnect TikTok.',
  scope_not_authorized: 'TikTok did not allow this. Reconnect TikTok and allow every permission asked for.',
  spam_risk_too_many_posts: 'TikTok limits how many posts an account can publish in a day. Try again tomorrow.',
  spam_risk_user_banned_from_posting: 'TikTok has blocked this account from posting through apps.',
  reached_active_user_cap: 'The TikTok app has reached its daily limit of accounts. Try again later.',
  unaudited_client_can_only_post_to_private_accounts: 'Until TikTok approves the EG Eloma app, posts can only go to private accounts (Only me).',
  url_ownership_unverified: 'TikTok has not verified the address the photo is stored at. Photos need the storage address verified in the TikTok app settings.',
  privacy_level_option_mismatch: 'That privacy option is not available for this TikTok account. Choose another one.',
  rate_limit_exceeded: 'TikTok is busy. Try again in a minute.',
};

interface Envelope<T> {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
}

/** Call a TikTok API endpoint with a user token. TikTok answers `error.code = "ok"` on success. */
async function call<T>(method: 'GET' | 'POST', path: string, token: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json().catch(() => ({}))) as Envelope<T>;
  const code = json.error?.code;
  if (!res.ok || (code && code !== 'ok')) {
    const c = code && code !== 'ok' ? code : res.status === 401 ? 'access_token_invalid' : undefined;
    throw new TikTokError((c && FRIENDLY[c]) || json.error?.message || `TikTok request failed (${res.status})`, c, res.status);
  }
  return (json.data ?? {}) as T;
}

/** POST a form to TikTok's OAuth endpoints (token, refresh, revoke). */
async function oauth<T>(path: string, fields: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; error_description?: string };
  if (!res.ok || json.error) {
    throw new TikTokError(json.error_description || json.error || `TikTok sign-in failed (${res.status})`, json.error ?? undefined, res.status);
  }
  return json;
}

// ─── Login ──────────────────────────────────────────────────

export function authUrl(state: string): string {
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.searchParams.set('client_key', env.TIKTOK_CLIENT_KEY!);
  url.searchParams.set('scope', env.TIKTOK_SCOPES);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', env.TIKTOK_REDIRECT_URI!);
  url.searchParams.set('state', state);
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
}

export async function exchangeCode(code: string) {
  return oauth<TokenResponse>('/oauth/token/', {
    client_key: env.TIKTOK_CLIENT_KEY!,
    client_secret: env.TIKTOK_CLIENT_SECRET!,
    code,
    grant_type: 'authorization_code',
    redirect_uri: env.TIKTOK_REDIRECT_URI!,
  });
}

export async function refreshTokens(refreshToken: string) {
  return oauth<TokenResponse>('/oauth/token/', {
    client_key: env.TIKTOK_CLIENT_KEY!,
    client_secret: env.TIKTOK_CLIENT_SECRET!,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

/** Tell TikTok to end the access (on Disconnect). Best-effort. */
export async function revoke(accessTokenEnc: string) {
  const token = decryptSecret(accessTokenEnc);
  if (!token || !tiktokConfigured()) return;
  await oauth('/oauth/revoke/', { client_key: env.TIKTOK_CLIENT_KEY!, client_secret: env.TIKTOK_CLIENT_SECRET!, token }).catch((err) =>
    logger.warn({ err }, 'TikTok: revoking the token failed')
  );
}

/** What is kept in SocialConnection.assets for a TikTok connection. Never sent to the browser as is. */
export interface TikTokAssets {
  refreshTokenEnc: string | null;
  refreshExpiresAt: string | null;
  openId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
}

/** Fields of the connected account the browser may see. */
export function publicProfile(assets: unknown) {
  const a = (assets ?? {}) as Partial<TikTokAssets>;
  return { username: a.username ?? null, displayName: a.displayName ?? null, avatarUrl: a.avatarUrl ?? null, profileUrl: a.profileUrl ?? null };
}

/** Assets and token fields to store after a sign-in or a refresh. */
export function tokenFields(tok: TokenResponse) {
  return {
    accessTokenEnc: encryptSecret(tok.access_token),
    tokenExpiresAt: new Date(Date.now() + tok.expires_in * 1000),
    refreshTokenEnc: encryptSecret(tok.refresh_token),
    refreshExpiresAt: new Date(Date.now() + tok.refresh_expires_in * 1000).toISOString(),
    scopes: tok.scope,
  };
}

const refreshing = new Map<string, Promise<string>>();

/**
 * A usable access token for a TikTok connection, refreshed (and saved) when it
 * is about to run out. Concurrent callers share one refresh, because TikTok
 * may rotate the refresh token and a second refresh with the old one fails.
 */
export async function accessToken(conn: { id: string; accessTokenEnc: string; tokenExpiresAt: Date | null; assets: Prisma.JsonValue }): Promise<string> {
  const current = decryptSecret(conn.accessTokenEnc);
  if (current && conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() - Date.now() > 5 * 60_000) return current;
  const pending = refreshing.get(conn.id);
  if (pending) return pending;
  const job = (async () => {
    // Re-read: another request may have refreshed it a moment ago.
    const fresh = await prisma.socialConnection.findUnique({ where: { id: conn.id } });
    if (!fresh) throw new TikTokError('The TikTok connection was removed', 'reconnect');
    const tok = decryptSecret(fresh.accessTokenEnc);
    if (tok && fresh.tokenExpiresAt && fresh.tokenExpiresAt.getTime() - Date.now() > 5 * 60_000) return tok;
    const assets = (fresh.assets ?? {}) as unknown as TikTokAssets;
    const refreshToken = assets.refreshTokenEnc ? decryptSecret(assets.refreshTokenEnc) : null;
    if (!refreshToken) throw new TikTokError('The TikTok access cannot be renewed. Reconnect TikTok.', 'reconnect');
    let res: TokenResponse;
    try {
      res = await refreshTokens(refreshToken);
    } catch (err) {
      if (err instanceof TikTokError && (err.code === 'invalid_grant' || err.status === 400 || err.status === 401)) {
        throw new TikTokError('The TikTok access has expired. Reconnect TikTok.', 'reconnect');
      }
      throw err;
    }
    const f = tokenFields(res);
    if (!f.accessTokenEnc || !f.refreshTokenEnc) throw new TikTokError('The TikTok access could not be stored securely (encryption key missing)');
    await prisma.socialConnection.update({
      where: { id: fresh.id },
      data: {
        accessTokenEnc: f.accessTokenEnc,
        tokenExpiresAt: f.tokenExpiresAt,
        scopes: f.scopes,
        assets: { ...assets, refreshTokenEnc: f.refreshTokenEnc, refreshExpiresAt: f.refreshExpiresAt } as unknown as Prisma.InputJsonValue,
      },
    });
    return res.access_token;
  })().finally(() => refreshing.delete(conn.id));
  refreshing.set(conn.id, job);
  return job;
}

// ─── Account and videos ─────────────────────────────────────

export interface UserInfo {
  open_id: string;
  display_name?: string;
  avatar_url?: string;
  username?: string;
  profile_deep_link?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
}

/** The connected account. Fields are asked for only when their permission was granted. */
export async function userInfo(token: string, scopes: string) {
  const has = (s: string) => scopes.split(',').map((x) => x.trim()).includes(s);
  const fields = ['open_id', 'display_name', 'avatar_url'];
  if (has('user.info.profile')) fields.push('username', 'profile_deep_link');
  if (has('user.info.stats')) fields.push('follower_count', 'following_count', 'likes_count', 'video_count');
  const r = await call<{ user: UserInfo }>('GET', '/user/info/', token, undefined, { fields: fields.join(',') });
  return r.user;
}

export function profileFrom(u: UserInfo): Omit<TikTokAssets, 'refreshTokenEnc' | 'refreshExpiresAt'> {
  return {
    openId: u.open_id,
    username: u.username ?? null,
    displayName: u.display_name ?? null,
    avatarUrl: u.avatar_url ?? null,
    profileUrl: u.username ? `https://www.tiktok.com/@${u.username}` : (u.profile_deep_link ?? null),
  };
}

export interface Video {
  id: string;
  title?: string;
  video_description?: string;
  create_time: number;
  cover_image_url?: string;
  share_url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

/** The account's public videos, newest first, back to `since` (at most 20 pages of 20). */
export async function listVideos(token: string, since: Date): Promise<Video[]> {
  const out: Video[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < 20; page++) {
    const r = await call<{ videos?: Video[]; cursor?: number; has_more?: boolean }>(
      'POST',
      '/video/list/',
      token,
      { max_count: 20, ...(cursor ? { cursor } : {}) },
      { fields: 'id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count' }
    );
    const videos = r.videos ?? [];
    out.push(...videos);
    if (!r.has_more || !r.cursor || videos.some((v) => v.create_time * 1000 < since.getTime())) break;
    cursor = r.cursor;
  }
  return out.filter((v) => v.create_time * 1000 >= since.getTime());
}

// ─── Publishing (Content Posting API, Direct Post) ──────────

export type Privacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
export const PRIVACY_LEVELS: Privacy[] = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];

export interface CreatorInfo {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: Privacy[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}

/** Who will post and what the account allows. TikTok requires asking this before every post. */
export async function creatorInfo(token: string) {
  return call<CreatorInfo>('POST', '/post/publish/creator_info/query/', token, {});
}

/** The TikTok settings the team chose for one post (ContentPost.tiktok). */
export interface PostSettings {
  privacy: Privacy | null;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** Commercial content: promoting the customer's own business. */
  brandOrganic: boolean;
  /** Commercial content: a paid partnership with another brand. */
  brandContent: boolean;
  consent: boolean;
}

export interface PublishInput {
  caption: string;
  title: string;
  mediaUrl: string;
  mediaType: string;
  mediaSize: number | null;
  settings: PostSettings;
}

export interface PublishOutcome {
  externalId: string;
  permalink: string | null;
  warning?: string;
}

const MB = 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Size of a stored file, from the size we recorded or a HEAD request. */
async function sizeOf(url: string, known: number | null) {
  if (known && known > 0) return known;
  const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
  const n = Number(res.headers.get('content-length'));
  if (!res.ok || !n) throw new TikTokError('The video file could not be read from storage');
  return n;
}

/**
 * Upload plan TikTok accepts: one chunk up to 64 MB, otherwise 10 MB chunks
 * with the remainder added to the last one (TikTok counts floor(size / chunk)).
 */
function chunkPlan(size: number) {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

/** Copy the video from our storage to TikTok's upload address, chunk by chunk (never all in memory). */
async function uploadVideo(uploadUrl: string, src: string, type: string, size: number) {
  const { chunkSize, count } = chunkPlan(size);
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = i === count - 1 ? size - 1 : start + chunkSize - 1;
    const part = await fetch(src, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(5 * 60_000) });
    if (!part.ok) throw new TikTokError(`The video file could not be read from storage (${part.status})`);
    let buf = Buffer.from(await part.arrayBuffer());
    // A server that ignores Range sends the whole file — take our slice of it.
    if (part.status === 200 && buf.length === size && count > 1) buf = buf.subarray(start, end + 1);
    if (buf.length !== end - start + 1) throw new TikTokError('The video file could not be read whole from storage');
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': type, 'Content-Length': String(buf.length), 'Content-Range': `bytes ${start}-${end}/${size}` },
      body: buf,
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!put.ok && put.status !== 206) throw new TikTokError(`TikTok did not accept the video upload (${put.status})`);
  }
}

/** Follow a publish until TikTok finishes it (or give up waiting and report it as processing). */
async function waitForPublish(token: string, publishId: string, username: string | null, deadlineMs: number): Promise<PublishOutcome> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const st = await call<{ status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }>('POST', '/post/publish/status/fetch/', token, {
      publish_id: publishId,
    });
    if (st.status === 'PUBLISH_COMPLETE') {
      const postId = st.publicaly_available_post_id?.[0];
      const permalink = postId && username ? `https://www.tiktok.com/@${username}/video/${postId}` : null;
      return {
        externalId: postId ? String(postId) : publishId,
        permalink,
        warning: postId ? undefined : 'TikTok accepted the post. It may take a few minutes to show on the profile (private posts have no public link).',
      };
    }
    if (st.status === 'FAILED') throw new TikTokError(`TikTok could not publish the post: ${st.fail_reason ?? 'unknown reason'}`, st.fail_reason);
    if (Date.now() > deadline) {
      return { externalId: publishId, permalink: null, warning: 'TikTok is still processing the post. It may take a few minutes to show on the profile.' };
    }
    await sleep(5000);
  }
}

const isVideo = (type: string) => type.startsWith('video/');

function postInfo(s: PostSettings, creator: CreatorInfo) {
  return {
    privacy_level: s.privacy,
    disable_comment: !s.allowComment || !!creator.comment_disabled,
    brand_content_toggle: s.brandContent,
    brand_organic_toggle: s.brandOrganic,
  };
}

export async function publish(token: string, input: PublishInput): Promise<PublishOutcome> {
  const s = input.settings;
  if (!s.privacy) throw new TikTokError('Choose who can see the post on TikTok first');
  if (!s.consent) throw new TikTokError('Tick the TikTok consent before posting');
  // TikTok asks apps to check the account right before each post.
  const creator = await creatorInfo(token);
  if (creator.privacy_level_options && !creator.privacy_level_options.includes(s.privacy)) {
    throw new TikTokError(FRIENDLY.privacy_level_option_mismatch, 'privacy_level_option_mismatch');
  }
  const username = creator.creator_username ?? null;

  if (isVideo(input.mediaType)) {
    const size = await sizeOf(input.mediaUrl, input.mediaSize);
    const plan = chunkPlan(size);
    const init = await call<{ publish_id: string; upload_url: string }>('POST', '/post/publish/video/init/', token, {
      post_info: {
        title: input.caption,
        ...postInfo(s, creator),
        disable_duet: !s.allowDuet || !!creator.duet_disabled,
        disable_stitch: !s.allowStitch || !!creator.stitch_disabled,
      },
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: plan.chunkSize, total_chunk_count: plan.count },
    });
    await uploadVideo(init.upload_url, input.mediaUrl, input.mediaType, size);
    return waitForPublish(token, init.publish_id, username, 4 * 60_000);
  }

  // Photos: TikTok fetches the image itself from a verified address.
  const init = await call<{ publish_id: string }>('POST', '/post/publish/content/init/', token, {
    post_info: { title: input.title.slice(0, 90), description: input.caption, ...postInfo(s, creator), auto_add_music: true },
    source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [input.mediaUrl] },
    post_mode: 'DIRECT_POST',
    media_type: 'PHOTO',
  });
  return waitForPublish(token, init.publish_id, username, 2 * 60_000);
}
