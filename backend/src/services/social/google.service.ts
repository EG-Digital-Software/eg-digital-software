import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { credentialEncryptionReady, decryptSecret } from '../../utils/secretBox.js';
import { accessTokenFor, tokenRequest, type TokenSet } from './oauth2.js';

/**
 * Google sign-in shared by YouTube and Google Ads. Each is its own connection
 * (provider 'youtube' or 'google_ads') with only the permissions it needs; the
 * customer may use a different Google login for each.
 */

export type GoogleProvider = 'youtube' | 'google_ads';

export function googleConfigured(provider: GoogleProvider): boolean {
  const base = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI) && credentialEncryptionReady();
  return provider === 'google_ads' ? base && !!env.GOOGLE_ADS_DEVELOPER_TOKEN : base;
}

export const scopesFor = (provider: GoogleProvider) => (provider === 'youtube' ? env.YOUTUBE_SCOPES : 'https://www.googleapis.com/auth/adwords');
export const labelFor = (provider: GoogleProvider) => (provider === 'youtube' ? 'YouTube' : 'Google Ads');

export function authUrl(provider: GoogleProvider, state: string) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!);
  u.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI!);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', scopesFor(provider));
  // offline + consent: Google returns a refresh token every time, so the connection keeps working.
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent select_account');
  u.searchParams.set('include_granted_scopes', 'false');
  u.searchParams.set('state', state);
  return u.toString();
}

export const exchangeCode = (code: string, provider: GoogleProvider) =>
  tokenRequest(
    'https://oauth2.googleapis.com/token',
    { grant_type: 'authorization_code', code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: env.GOOGLE_REDIRECT_URI! },
    labelFor(provider)
  );

const refresher = (provider: GoogleProvider) => (refreshToken: string): Promise<TokenSet> =>
  tokenRequest(
    'https://oauth2.googleapis.com/token',
    { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET! },
    labelFor(provider)
  );

export const accessToken = (conn: { id: string; provider: string; accessTokenEnc: string; tokenExpiresAt: Date | null }) =>
  accessTokenFor(conn, refresher(conn.provider as GoogleProvider), labelFor(conn.provider as GoogleProvider));

/** End the access on Google's side too (on Disconnect). Best-effort. */
export async function revoke(accessTokenEnc: string, refreshTokenEnc?: string | null) {
  const token = (refreshTokenEnc && decryptSecret(refreshTokenEnc)) || decryptSecret(accessTokenEnc);
  if (!token) return;
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(20_000),
  }).catch((err) => logger.warn({ err }, 'Google: revoking the token failed'));
}

/** Google returns the granted scopes space-separated. */
export const hasScope = (scopes: string | null | undefined, s: string) => (scopes ?? '').split(/[\s,]+/).includes(s);
