import type { Request } from 'express';
import { isProd } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * The caller's IP as the request carries it. Behind Azure App Service the socket
 * address is the front end's, so the forwarded headers come first; a port suffix
 * ("1.2.3.4:5678") and the IPv4-mapped prefix ("::ffff:") are stripped.
 */
function rawIp(req: Request): string {
  const header = (name: string) => {
    const v = req.headers[name];
    return (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim();
  };
  let ip = header('x-client-ip') || header('x-forwarded-for') || req.ip || req.socket.remoteAddress || '';
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'));
  if (ip.startsWith('[')) ip = ip.slice(1, ip.indexOf(']'));
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

/** Loopback or private-range address — never a caller's public IP. */
const isLocal = (ip: string) =>
  !ip ||
  ip === '::1' ||
  /^127\./.test(ip) ||
  /^10\./.test(ip) ||
  /^192\.168\./.test(ip) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
  /^f[cd]/i.test(ip) ||
  /^fe80:/i.test(ip);

let publicIp: Promise<string | null> | null = null;

/** This machine's public IP, looked up once. */
function machinePublicIp(): Promise<string | null> {
  publicIp ??= fetch('https://api.ipify.org', { signal: AbortSignal.timeout(4000) })
    .then(async (r) => (r.ok ? (await r.text()).trim() : null))
    .catch((err) => {
      logger.warn({ err }, 'Could not look up the public IP');
      publicIp = null;
      return null;
    });
  return publicIp;
}

/**
 * The caller's public IP. Running locally the browser hits the API directly, so
 * the request only shows a loopback address — outside production that falls back
 * to this machine's public IP, which is the tester's own. Production always uses
 * the forwarded address.
 */
export async function requestIp(req: Request): Promise<string> {
  const ip = rawIp(req);
  if (!isProd && isLocal(ip)) return (await machinePublicIp()) || ip || 'unknown';
  return ip || 'unknown';
}
