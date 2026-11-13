import { env } from '../../config/env.js';
import { decryptSecret } from '../../utils/secretBox.js';
import { MetaError, graph, type MetaAssets, type MetaSelection } from './meta.service.js';

/**
 * Publishing to a Facebook Page and an Instagram professional account through
 * the customer's Meta connection (Content Calendar). Uses the Page token stored
 * (encrypted) when the customer connected — never a password.
 *
 * Meta needs these permissions on the login for publishing:
 *   Facebook:  pages_manage_posts (+ pages_manage_engagement for the first comment)
 *   Instagram: instagram_content_publish (+ instagram_manage_comments for the first comment)
 */

export const PUBLISH_SCOPES = {
  fb: ['pages_manage_posts'],
  ig: ['instagram_content_publish'],
} as const;

const graphBase = () => `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

/** POST to the Graph API with form fields. */
async function graphPost<T>(path: string, fields: Record<string, string | undefined>, token: string): Promise<T> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) body.set(k, v);
  body.set('access_token', token);
  const res = await fetch(`${graphBase()}${path}`, { method: 'POST', body, signal: AbortSignal.timeout(90_000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } };
  if (!res.ok || json.error) {
    const e = json.error;
    throw new MetaError(e?.error_user_msg || e?.message || `Meta request failed (${res.status})`, e?.code, e?.error_subcode);
  }
  return json;
}

export interface PublishTarget {
  pageId: string;
  pageName: string;
  pageToken: string;
  ig: { id: string; username: string } | null;
}

/** The Page (and its Instagram account) selected on the customer's Meta connection, with a usable token. */
export function resolveTargets(conn: { accessTokenEnc: string; assets: unknown; selected: unknown }) {
  const assets = (conn.assets ?? {}) as Partial<MetaAssets>;
  const sel = (conn.selected ?? {}) as MetaSelection;
  const userToken = decryptSecret(conn.accessTokenEnc);
  const pages = assets.pages ?? [];
  const page = pages.find((p) => p.id === sel.pageId) ?? null;
  const igPage = pages.find((p) => p.ig?.id === sel.igId) ?? null;
  const tokenOf = (p: (typeof pages)[number] | null) => (p ? decryptSecret(p.tokenEnc) ?? userToken : null);
  return {
    fb: page ? { pageId: page.id, name: page.name, token: tokenOf(page) } : null,
    // Instagram publishing runs with the token of the Page the account is linked to.
    ig: igPage?.ig ? { igId: igPage.ig.id, name: `@${igPage.ig.username}`, token: tokenOf(igPage) } : null,
  };
}

export interface PublishContent {
  message: string;
  mediaUrl: string | null;
  mediaType: string | null;
  firstComment: string;
}

export interface PublishResult {
  externalId: string;
  permalink: string | null;
  /** A non-fatal problem (e.g. the first comment could not be added). */
  warning?: string;
}

const isVideo = (type: string | null) => !!type && type.startsWith('video/');

async function permalinkOf(id: string, field: string, token: string) {
  try {
    const r = await graph<Record<string, string>>(`/${id}`, { fields: field }, token);
    return r[field] ?? null;
  } catch {
    return null;
  }
}

export async function publishFacebook(pageId: string, token: string, c: PublishContent): Promise<PublishResult> {
  let postId: string;
  if (c.mediaUrl && isVideo(c.mediaType)) {
    const r = await graphPost<{ id: string }>(`/${pageId}/videos`, { file_url: c.mediaUrl, description: c.message }, token);
    postId = r.id;
  } else if (c.mediaUrl) {
    const r = await graphPost<{ id: string; post_id?: string }>(`/${pageId}/photos`, { url: c.mediaUrl, caption: c.message }, token);
    postId = r.post_id ?? r.id;
  } else {
    const r = await graphPost<{ id: string }>(`/${pageId}/feed`, { message: c.message }, token);
    postId = r.id;
  }
  const permalink = await permalinkOf(postId, 'permalink_url', token);
  let warning: string | undefined;
  if (c.firstComment.trim()) {
    try {
      await graphPost(`/${postId}/comments`, { message: c.firstComment.trim() }, token);
    } catch (err) {
      warning = `Posted, but the first comment could not be added: ${(err as Error).message}`;
    }
  }
  return { externalId: postId, permalink, warning };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function publishInstagram(igId: string, token: string, c: PublishContent): Promise<PublishResult> {
  if (!c.mediaUrl) throw new MetaError('Instagram needs an image or video — add a design first.');
  const video = isVideo(c.mediaType);
  const container = await graphPost<{ id: string }>(
    `/${igId}/media`,
    video ? { media_type: 'REELS', video_url: c.mediaUrl, caption: c.message } : { image_url: c.mediaUrl, caption: c.message },
    token
  );
  // Meta fetches and processes the file first; publishing before it is FINISHED fails.
  const deadline = Date.now() + (video ? 5 * 60_000 : 60_000);
  for (;;) {
    const st = await graph<{ status_code?: string; status?: string }>(`/${container.id}`, { fields: 'status_code,status' }, token);
    if (!st.status_code || st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') {
      throw new MetaError(`Instagram could not process the design (${st.status ?? st.status_code}). Check the file type and size.`);
    }
    if (Date.now() > deadline) throw new MetaError('Instagram took too long to process the design. Try again in a few minutes.');
    await sleep(video ? 5000 : 2000);
  }
  const pub = await graphPost<{ id: string }>(`/${igId}/media_publish`, { creation_id: container.id }, token);
  const permalink = await permalinkOf(pub.id, 'permalink', token);
  let warning: string | undefined;
  if (c.firstComment.trim()) {
    try {
      await graphPost(`/${pub.id}/comments`, { message: c.firstComment.trim() }, token);
    } catch (err) {
      warning = `Posted, but the first comment could not be added: ${(err as Error).message}`;
    }
  }
  return { externalId: pub.id, permalink, warning };
}
