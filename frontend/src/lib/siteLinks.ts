import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/resources';

/**
 * Website links in showcases: screenshots come from WordPress mShots (free, no
 * key — it renders any public page), and the old site may be a
 * web.archive.org copy.
 */

/** web.archive.org links → their "if_" form, which drops the Wayback toolbar. */
export function cleanSiteUrl(url: string): string {
  return url.trim().replace(/(web\.archive\.org\/web\/\d+)(?:[a-z]{2}_)?\//i, '$1if_/');
}

/** Base link + page path ("/about"). Plain join so Wayback links keep their prefix. */
export function joinSitePath(base: string, path: string): string {
  const clean = cleanSiteUrl(base);
  if (!path || path === '/') return clean;
  return `${clean.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** Screenshot of a public page: a card thumbnail (short) or a tall, scrollable snapshot. */
export function shotUrl(url: string, size: 'thumb' | 'tall' = 'thumb', attempt = 0): string {
  const dims = size === 'thumb' ? 'w=640&h=400&vpw=1280&vph=800' : 'w=1280&h=3000&vpw=1280&vph=3000';
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(cleanSiteUrl(url))}?${dims}${attempt ? `&r=${attempt}` : ''}`;
}

/** Whether a site lets the portal show it in a frame (else a snapshot is shown). */
export function useFrameable(url: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'preview', 'frame-check', url],
    queryFn: () => adminApi.frameCheck(cleanSiteUrl(url!)),
    enabled: !!url,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

/** "https://www.x.com/a" → "www.x.com"; Wayback links show the archived site's host. */
export function siteHostOf(url: string): string {
  try {
    const u = new URL(cleanSiteUrl(url));
    const inner = u.hostname === 'web.archive.org' ? u.pathname.match(/\/web\/[^/]+\/(https?:\/\/[^/]+)/i)?.[1] : null;
    return inner ? new URL(inner).host : u.host;
  } catch {
    return url;
  }
}

export const isWaybackUrl = (url: string) => /web\.archive\.org\/web\//i.test(url);
