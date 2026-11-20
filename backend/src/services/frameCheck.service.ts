import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ApiError } from '../utils/ApiError.js';

/**
 * Whether a public website can be shown inside the portal. Many sites forbid
 * being framed (X-Frame-Options, or CSP frame-ancestors); those are shown as a
 * screenshot instead. Only public http(s) addresses are checked — never the
 * server's own network.
 */

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

async function assertPublic(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw ApiError.badRequest('Only http(s) links can be checked');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw ApiError.badRequest('That address is not a public website');
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw ApiError.badRequest('That website could not be found');
  if (addresses.some((a) => isPrivateAddress(a.address))) throw ApiError.badRequest('That address is not a public website');
}

/** Does the page's response forbid framing by another site? */
function blocksFraming(headers: Headers): boolean {
  const xfo = headers.get('x-frame-options')?.toLowerCase() ?? '';
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return true;
  const csp = headers.get('content-security-policy')?.toLowerCase() ?? '';
  const fa = csp.match(/frame-ancestors([^;]*)/);
  if (fa) {
    const sources = fa[1].trim().split(/\s+/).filter(Boolean);
    if (!sources.includes('*')) return true;
  }
  return false;
}

export async function checkFrameable(raw: string): Promise<{ frameable: boolean; reachable: boolean }> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw ApiError.badRequest('Enter a full website address, starting with https://');
  }
  // Follow redirects by hand so every hop is checked as public.
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; EG-Eloma-Preview/1.0)', accept: 'text/html' },
      });
    } catch {
      return { frameable: false, reachable: false };
    }
    void res.body?.cancel();
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (next) {
      url = new URL(next, url);
      continue;
    }
    return { frameable: res.ok && !blocksFraming(res.headers), reachable: res.ok };
  }
  return { frameable: false, reachable: false };
}
