import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { decryptSecret, encryptSecret } from '../../utils/secretBox.js';

/**
 * Token handling shared by the OAuth 2 connections (LinkedIn, YouTube, Google
 * Ads). The access token is kept in SocialConnection.accessTokenEnc and the
 * refresh token (when the platform gives one) in `assets.refreshTokenEnc`,
 * both encrypted. Callers ask `accessTokenFor()`, which refreshes when needed.
 */

export class ConnectionError extends Error {
  constructor(
    message: string,
    /** The access was revoked or can no longer be renewed — the customer must reconnect. */
    public expired = false,
    public status?: number
  ) {
    super(message);
  }
}

export interface TokenSet {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

/** Stored token bookkeeping inside `assets`. */
export interface RefreshFields {
  refreshTokenEnc?: string | null;
  refreshExpiresAt?: string | null;
}

/** The fields to store after a sign-in or a refresh. A refresh that returns no new refresh token keeps the old one. */
export function tokenFields(tok: TokenSet, keepRefreshEnc?: string | null) {
  return {
    accessTokenEnc: encryptSecret(tok.access_token),
    tokenExpiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
    refreshTokenEnc: tok.refresh_token ? encryptSecret(tok.refresh_token) : (keepRefreshEnc ?? null),
    refreshExpiresAt: tok.refresh_token_expires_in ? new Date(Date.now() + tok.refresh_token_expires_in * 1000).toISOString() : null,
  };
}

/** POST a form to an OAuth token endpoint. */
export async function tokenRequest(url: string, fields: Record<string, string>, label: string): Promise<TokenSet> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenSet & { error?: string; error_description?: string };
  if (!res.ok || json.error || !json.access_token) {
    const expired = json.error === 'invalid_grant' || res.status === 401;
    throw new ConnectionError(json.error_description || json.error || `${label} sign-in failed (${res.status})`, expired, res.status);
  }
  return json;
}

const refreshing = new Map<string, Promise<string>>();
const MARGIN_MS = 5 * 60_000;

/** Where a connection's tokens are read and saved: client SocialConnection rows by default. */
export interface TokenStore {
  read(id: string): Promise<{ id: string; accessTokenEnc: string; tokenExpiresAt: Date | null; assets: Prisma.JsonValue } | null>;
  write(id: string, data: { accessTokenEnc: string; tokenExpiresAt: Date | null; scopes?: string; assets: Prisma.InputJsonValue }): Promise<unknown>;
}

const clientStore: TokenStore = {
  read: (id) => prisma.socialConnection.findUnique({ where: { id } }),
  write: (id, data) => prisma.socialConnection.update({ where: { id }, data }),
};

/**
 * A usable access token for a connection, refreshed (and saved) when it is
 * about to run out. Concurrent callers share one refresh.
 */
export async function accessTokenFor(
  conn: { id: string; accessTokenEnc: string; tokenExpiresAt: Date | null },
  refresh: (refreshToken: string) => Promise<TokenSet>,
  label: string,
  store: TokenStore = clientStore
): Promise<string> {
  const current = decryptSecret(conn.accessTokenEnc);
  if (current && (!conn.tokenExpiresAt || conn.tokenExpiresAt.getTime() - Date.now() > MARGIN_MS)) return current;
  const pending = refreshing.get(conn.id);
  if (pending) return pending;
  const job = (async () => {
    const fresh = await store.read(conn.id);
    if (!fresh) throw new ConnectionError(`The ${label} connection was removed`, true);
    const tok = decryptSecret(fresh.accessTokenEnc);
    if (tok && (!fresh.tokenExpiresAt || fresh.tokenExpiresAt.getTime() - Date.now() > MARGIN_MS)) return tok;
    const assets = (fresh.assets ?? {}) as Record<string, unknown> & RefreshFields;
    const refreshToken = assets.refreshTokenEnc ? decryptSecret(assets.refreshTokenEnc) : null;
    if (!refreshToken) {
      // No refresh token (LinkedIn gives one only to some apps): use the token until it runs out.
      if (tok && fresh.tokenExpiresAt && fresh.tokenExpiresAt.getTime() > Date.now()) return tok;
      throw new ConnectionError(`The ${label} access has expired. Reconnect ${label}.`, true);
    }
    let res: TokenSet;
    try {
      res = await refresh(refreshToken);
    } catch (err) {
      if (err instanceof ConnectionError && (err.expired || err.status === 400)) throw new ConnectionError(`The ${label} access has expired. Reconnect ${label}.`, true);
      throw err;
    }
    const f = tokenFields(res, assets.refreshTokenEnc);
    if (!f.accessTokenEnc) throw new ConnectionError(`The ${label} access could not be stored securely (encryption key missing)`);
    await store.write(fresh.id, {
      accessTokenEnc: f.accessTokenEnc,
      tokenExpiresAt: f.tokenExpiresAt,
      ...(res.scope ? { scopes: res.scope } : {}),
      assets: { ...assets, refreshTokenEnc: f.refreshTokenEnc, refreshExpiresAt: f.refreshExpiresAt ?? assets.refreshExpiresAt ?? null } as unknown as Prisma.InputJsonValue,
    });
    return res.access_token;
  })().finally(() => refreshing.delete(conn.id));
  refreshing.set(conn.id, job);
  return job;
}

/** The refresh token fields as stored now (a refresh during a sync may have replaced them). */
export async function latestRefresh(id: string): Promise<RefreshFields> {
  const row = await prisma.socialConnection.findUnique({ where: { id }, select: { assets: true } });
  const a = (row?.assets ?? {}) as RefreshFields;
  return { refreshTokenEnc: a.refreshTokenEnc ?? null, refreshExpiresAt: a.refreshExpiresAt ?? null };
}

/** Size of a stored file, from the size we recorded or a HEAD request. */
export async function sizeOf(url: string, known: number | null) {
  if (known && known > 0) return known;
  const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
  const n = Number(res.headers.get('content-length'));
  if (!res.ok || !n) throw new ConnectionError('The file could not be read from storage');
  return n;
}

/** Read bytes [start, end] of a stored file (never the whole video in memory). */
export async function readRange(src: string, start: number, end: number, size: number) {
  const part = await fetch(src, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(5 * 60_000) });
  if (!part.ok) throw new ConnectionError(`The file could not be read from storage (${part.status})`);
  let buf = Buffer.from(await part.arrayBuffer());
  // A server that ignores Range sends the whole file — take our slice of it.
  if (part.status === 200 && buf.length === size && end - start + 1 !== size) buf = buf.subarray(start, end + 1);
  if (buf.length !== end - start + 1) throw new ConnectionError('The file could not be read whole from storage');
  return buf;
}

/** Download a whole (small) file, such as an image. */
export async function readAll(src: string, maxBytes: number) {
  const res = await fetch(src, { signal: AbortSignal.timeout(2 * 60_000) });
  if (!res.ok) throw new ConnectionError(`The file could not be read from storage (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new ConnectionError('The file is too large');
  return buf;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
