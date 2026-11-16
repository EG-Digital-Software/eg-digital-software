import { ConnectionError, readRange, sizeOf, type RefreshFields } from './oauth2.js';

/**
 * YouTube through the customer's own Google login: channel figures (YouTube
 * Analytics API), the channel's videos (YouTube Data API) and uploading
 * approved Content Calendar videos.
 *
 * Until Google audits the Google Cloud project, videos uploaded through the
 * API are locked to private — the same rule TikTok has before its audit.
 */

const DATA = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2/reports';

export const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

export interface YouTubeAssets extends RefreshFields {
  channelId: string | null;
  title: string | null;
  handle: string | null;
  thumbnail: string | null;
  uploadsPlaylist: string | null;
}

export function publicProfile(a: unknown) {
  const x = (a ?? {}) as Partial<YouTubeAssets>;
  return {
    displayName: x.title ?? null,
    username: x.handle ?? null,
    avatarUrl: x.thumbnail ?? null,
    profileUrl: x.handle ? `https://www.youtube.com/${x.handle.startsWith('@') ? x.handle : `@${x.handle}`}` : x.channelId ? `https://www.youtube.com/channel/${x.channelId}` : null,
  };
}

const FRIENDLY: Record<string, string> = {
  quotaExceeded: 'The daily YouTube API quota is used up. Try again tomorrow.',
  uploadLimitExceeded: 'This YouTube channel has reached its upload limit for today.',
  forbidden: 'YouTube did not allow this. Reconnect YouTube and allow every permission asked for.',
  insufficientPermissions: 'YouTube did not allow this. Reconnect YouTube and allow every permission asked for.',
  youtubeSignupRequired: 'This Google account has no YouTube channel. Sign in with the account that owns the channel.',
};

async function call<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }, signal: init.signal ?? AbortSignal.timeout(60_000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; errors?: { reason?: string }[] } };
  if (!res.ok) {
    const reason = json.error?.errors?.[0]?.reason ?? '';
    throw new ConnectionError(FRIENDLY[reason] ?? json.error?.message ?? `YouTube request failed (${res.status})`, res.status === 401, res.status);
  }
  return json;
}

// ─── Channel ────────────────────────────────────────────────

export interface Channel {
  id: string;
  title: string;
  handle: string | null;
  thumbnail: string | null;
  subscribers: number | null;
  uploadsPlaylist: string | null;
}

export async function myChannel(token: string): Promise<Channel | null> {
  const r = await call<{
    items?: {
      id: string;
      snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> };
      statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }[];
  }>(`${DATA}/channels?part=snippet,statistics,contentDetails&mine=true`, token);
  const c = r.items?.[0];
  if (!c) return null;
  return {
    id: c.id,
    title: c.snippet?.title ?? 'YouTube channel',
    handle: c.snippet?.customUrl ?? null,
    thumbnail: c.snippet?.thumbnails?.default?.url ?? null,
    subscribers: c.statistics?.hiddenSubscriberCount ? null : c.statistics?.subscriberCount != null ? Number(c.statistics.subscriberCount) : null,
    uploadsPlaylist: c.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

// ─── Analytics ──────────────────────────────────────────────

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** One YouTube Analytics report as rows keyed by column name. */
export async function report(token: string, start: Date, end: Date, metrics: string, dimensions?: string) {
  const u = new URL(ANALYTICS);
  u.searchParams.set('ids', 'channel==MINE');
  u.searchParams.set('startDate', iso(start));
  u.searchParams.set('endDate', iso(end));
  u.searchParams.set('metrics', metrics);
  if (dimensions) {
    u.searchParams.set('dimensions', dimensions);
    if (dimensions === 'day') u.searchParams.set('sort', 'day');
  }
  const r = await call<{ columnHeaders?: { name: string }[]; rows?: (string | number)[][] }>(u.toString(), token);
  const names = (r.columnHeaders ?? []).map((c) => c.name);
  return (r.rows ?? []).map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]])) as Record<string, string | number>);
}

export interface YouTubeDay {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  subsGained: number;
  subsLost: number;
}

export async function daily(token: string, since: Date, until: Date) {
  const rows = await report(token, since, until, 'views,likes,comments,shares,subscribersGained,subscribersLost', 'day');
  const out = new Map<string, YouTubeDay>();
  for (const r of rows) {
    out.set(String(r.day), {
      views: Number(r.views) || 0,
      likes: Number(r.likes) || 0,
      comments: Number(r.comments) || 0,
      shares: Number(r.shares) || 0,
      subsGained: Number(r.subscribersGained) || 0,
      subsLost: Number(r.subscribersLost) || 0,
    });
  }
  return out;
}

const TRAFFIC: Record<string, string> = {
  YT_SEARCH: 'yt_src_search',
  SUBSCRIBER: 'yt_src_browse',
  RELATED_VIDEO: 'yt_src_suggested',
  SHORTS: 'yt_src_shorts',
  EXT_URL: 'yt_src_external',
  YT_CHANNEL: 'yt_src_channel',
};
const CONTENT: Record<string, string> = { VIDEO_ON_DEMAND: 'yt_views_videos', SHORTS: 'yt_views_shorts', LIVE_STREAM: 'yt_views_live' };
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The monthly YouTube figures (Channel insights) for one period. */
export async function periodFigures(token: string, start: Date, end: Date, warnings: string[]) {
  const v: Record<string, number> = {};
  const [t] = await report(token, start, end, 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares');
  if (t) {
    v.yt_views = Number(t.views) || 0;
    v.yt_watch_hours = Math.round((Number(t.estimatedMinutesWatched) || 0) / 60);
    v.yt_avd = Math.round(Number(t.averageViewDuration) || 0);
    v.yt_apv = r1(Number(t.averageViewPercentage) || 0);
    v.yt_subs_gained = Number(t.subscribersGained) || 0;
    v.yt_subs_lost = Number(t.subscribersLost) || 0;
    v.yt_subs_net = v.yt_subs_gained - v.yt_subs_lost;
    v.yt_likes = Number(t.likes) || 0;
    v.yt_comments = Number(t.comments) || 0;
    v.yt_shares = Number(t.shares) || 0;
  }
  const breakdown = async (dim: string, metric: string, map: Record<string, string>, share: boolean) => {
    try {
      const rows = await report(token, start, end, metric, dim);
      const total = rows.reduce((a, r) => a + (Number(r[metric]) || 0), 0);
      for (const key of Object.values(map)) v[key] = 0;
      for (const r of rows) {
        const id = map[String(r[dim])];
        if (!id) continue;
        const n = Number(r[metric]) || 0;
        v[id] = share ? (total ? r1((n / total) * 100) : 0) : n;
      }
    } catch (err) {
      warnings.push(`YouTube ${dim} figures could not be read: ${(err as Error).message}`);
    }
  };
  await breakdown('insightTrafficSourceType', 'views', TRAFFIC, true);
  await breakdown('creatorContentType', 'views', CONTENT, false);
  try {
    const rows = await report(token, start, end, 'estimatedMinutesWatched', 'subscribedStatus');
    const total = rows.reduce((a, r) => a + (Number(r.estimatedMinutesWatched) || 0), 0);
    const subs = rows.find((r) => r.subscribedStatus === 'SUBSCRIBED');
    if (total) v.yt_sub_watch = r1(((Number(subs?.estimatedMinutesWatched) || 0) / total) * 100);
  } catch {
    /* optional */
  }
  return v;
}

// ─── Videos ─────────────────────────────────────────────────

export interface Video {
  id: string;
  title: string;
  publishedAt: Date;
  thumbnail: string | null;
  views: number;
  likes: number;
  comments: number;
  shorts: boolean;
}

/** The channel's uploads back to `since` (at most 500). */
export async function listVideos(token: string, uploadsPlaylist: string, since: Date): Promise<Video[]> {
  const ids: string[] = [];
  let pageToken = '';
  for (let i = 0; i < 10; i++) {
    const r = await call<{ items?: { contentDetails?: { videoId?: string; videoPublishedAt?: string } }[]; nextPageToken?: string }>(
      `${DATA}/playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(uploadsPlaylist)}${pageToken ? `&pageToken=${pageToken}` : ''}`,
      token
    );
    const items = r.items ?? [];
    let older = false;
    for (const it of items) {
      const at = it.contentDetails?.videoPublishedAt;
      if (at && new Date(at) < since) older = true;
      else if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
    }
    if (older || !r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  const out: Video[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await call<{
      items?: {
        id: string;
        snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
        statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
        contentDetails?: { duration?: string };
      }[];
    }>(`${DATA}/videos?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).join(',')}`, token);
    for (const v of r.items ?? []) {
      const secs = durationSecs(v.contentDetails?.duration);
      out.push({
        id: v.id,
        title: v.snippet?.title ?? 'YouTube video',
        publishedAt: new Date(v.snippet?.publishedAt ?? Date.now()),
        thumbnail: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url ?? null,
        views: Number(v.statistics?.viewCount) || 0,
        likes: Number(v.statistics?.likeCount) || 0,
        comments: Number(v.statistics?.commentCount) || 0,
        // The Data API does not say "Short"; three minutes or less is the best guess.
        shorts: secs != null && secs <= 180,
      });
    }
  }
  return out;
}

function durationSecs(d?: string) {
  const m = d?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return (Number(m[1]) || 0) * 86400 + (Number(m[2]) || 0) * 3600 + (Number(m[3]) || 0) * 60 + (Number(m[4]) || 0);
}

// ─── Upload ─────────────────────────────────────────────────

export type Privacy = 'public' | 'unlisted' | 'private';
export const PRIVACY: Privacy[] = ['public', 'unlisted', 'private'];

/** The YouTube settings chosen for one post (ContentPost.youtube). */
export interface PostSettings {
  privacy: Privacy | null;
  /** YouTube requires every upload to say whether it is made for kids. */
  madeForKids: boolean | null;
  /** Video title on YouTube (defaults to the post title). */
  title: string;
}

export const YT = { title: 100, description: 5000, videoBytes: 256 * 1024 * 1024 * 1024 };
const CHUNK = 32 * 256 * 1024; // 8 MB, a multiple of 256 KB as YouTube requires.

export async function upload(
  token: string,
  input: { title: string; description: string; tags: string[]; mediaUrl: string; mediaType: string; mediaSize: number | null; settings: PostSettings }
) {
  const s = input.settings;
  if (!s.privacy) throw new ConnectionError('Choose who can see the video on YouTube first');
  if (s.madeForKids == null) throw new ConnectionError('Say whether the video is made for kids');
  const size = await sizeOf(input.mediaUrl, input.mediaSize);
  const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(size),
      'X-Upload-Content-Type': input.mediaType,
    },
    body: JSON.stringify({
      snippet: { title: input.title, description: input.description, tags: input.tags.slice(0, 30), categoryId: '22' },
      status: { privacyStatus: s.privacy, selfDeclaredMadeForKids: s.madeForKids, embeddable: true },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!start.ok) {
    const j = (await start.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
    const reason = j.error?.errors?.[0]?.reason ?? '';
    throw new ConnectionError(FRIENDLY[reason] ?? j.error?.message ?? `YouTube did not start the upload (${start.status})`, start.status === 401, start.status);
  }
  const session = start.headers.get('location');
  if (!session) throw new ConnectionError('YouTube did not start the upload');
  type Uploaded = { id?: string; status?: { privacyStatus?: string; uploadStatus?: string } };
  let video: Uploaded | null = null as Uploaded | null;
  for (let from = 0; from < size; from += CHUNK) {
    const to = Math.min(from + CHUNK, size) - 1;
    const buf = await readRange(input.mediaUrl, from, to, size);
    const put = await fetch(session, {
      method: 'PUT',
      headers: { 'Content-Length': String(buf.length), 'Content-Range': `bytes ${from}-${to}/${size}` },
      body: buf,
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (put.status === 308) continue;
    if (!put.ok) throw new ConnectionError(`YouTube did not accept the video upload (${put.status})`);
    video = (await put.json()) as Uploaded;
  }
  if (!video?.id) throw new ConnectionError('YouTube did not confirm the upload');
  const locked = s.privacy !== 'private' && video.status?.privacyStatus === 'private';
  return {
    externalId: video.id,
    permalink: `https://www.youtube.com/watch?v=${video.id}`,
    warning: locked ? 'YouTube set the video to private: until Google approves the EG Eloma app, API uploads stay private. Change it in YouTube Studio.' : undefined,
  };
}
