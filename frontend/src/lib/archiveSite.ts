import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mediaUrl } from '@/lib/utils';

/**
 * Archived websites: a ZIP or saved HTML page put in a task's Archive tab gets a
 * fast website copy built by the server next to it, at `<upload url>.site/`
 * (inline images moved out, lazy-loaded), with a manifest written last.
 * Mirrors backend/src/services/archiveSite.service.ts.
 */
export const SITE_SUFFIX = '.site/';
export const SITE_MANIFEST = '__eg_site.json';

export interface SiteManifest {
  version: 1;
  entry: string;
  pages: { path: string; title: string }[];
  pageCount: number;
  fileCount: number;
  totalSize: number;
  /** An image from the home page (site-relative), for card thumbnails. */
  thumb?: string;
  builtAt: string;
}

export interface ArchivedFileLike {
  url: string;
  fileName: string;
  contentType?: string | null;
  createdAt: string;
}

export const isZipFile = (f: Pick<ArchivedFileLike, 'fileName' | 'url' | 'contentType'>) =>
  /\.zip$/i.test(f.fileName) || /\.zip$/i.test(f.url) || /zip/i.test(f.contentType ?? '');
export const isImageFile = (f: Pick<ArchivedFileLike, 'contentType'>) => !!f.contentType?.startsWith('image/');
export const isVideoFile = (f: Pick<ArchivedFileLike, 'contentType'>) => !!f.contentType?.startsWith('video/');
export const isPdfFile = (f: Pick<ArchivedFileLike, 'contentType' | 'fileName'>) =>
  f.contentType === 'application/pdf' || /\.pdf$/i.test(f.fileName);
/** A single saved page (e.g. from SingleFile) opens in the viewer as a one-page site. */
export const isHtmlFile = (f: Pick<ArchivedFileLike, 'contentType' | 'fileName'>) =>
  !!f.contentType?.startsWith('text/html') || /\.html?$/i.test(f.fileName);

/** A ZIP or saved HTML page — both open as a website. */
export const isSiteFile = (f: Pick<ArchivedFileLike, 'fileName' | 'url' | 'contentType'>) => isZipFile(f) || isHtmlFile(f);

/** Absolute URL of an upload's website folder (ends with "/"). */
export const siteBaseOf = (zipUrl: string) => `${mediaUrl(zipUrl) ?? zipUrl}${SITE_SUFFIX}`;

/** How long after upload a missing manifest still means "being unpacked". */
const BUILD_WINDOW_MS = 15 * 60 * 1000;

export type SiteState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'building' }
  | { status: 'missing' }
  | { status: 'ready'; base: string; manifest: SiteManifest };

/**
 * The website copy behind an archived ZIP or HTML page: ready (with its page
 * list), still being built (polls until it is), or missing (archived before
 * this existed — the admin can build it). Other files report "none".
 */
export function useArchiveSite(
  file: ArchivedFileLike | null | undefined,
  /** Keep checking until it's ready (e.g. right after the admin asked for a build). */
  watch = false
): SiteState {
  // Captured once per mount so renders stay pure.
  const [now] = useState(() => Date.now());
  const zip = !!file && isSiteFile(file);
  const base = zip ? siteBaseOf(file!.url) : '';
  const recent = zip && (watch || now - new Date(file!.createdAt).getTime() < BUILD_WINDOW_MS);
  const q = useQuery({
    queryKey: ['archive-site', base],
    enabled: zip,
    queryFn: async (): Promise<SiteManifest | null> => {
      const res = await fetch(base + SITE_MANIFEST, { cache: 'no-cache' });
      if (res.status === 404 || res.status === 403) return null;
      if (!res.ok) throw new Error(`Snapshot check failed (${res.status})`);
      return (await res.json()) as SiteManifest;
    },
    staleTime: 60_000,
    // Keep checking while a fresh upload is still being unpacked.
    refetchInterval: (query) => (query.state.data === null && recent ? 4000 : false),
  });
  if (!zip) return { status: 'none' };
  if (q.data) return { status: 'ready', base, manifest: q.data };
  if (q.isLoading) return { status: 'loading' };
  return recent ? { status: 'building' } : { status: 'missing' };
}

/** "3two1.com.au.zip" → "3two1.com.au"; "1700000000-my_site.zip" → "my_site". */
export function siteNameOf(fileName: string): string {
  return fileName.replace(/\.(zip|html?)$/i, '').replace(/^\d{10,}-/, '') || fileName;
}

/** A site page's path as it reads on the live site: "about/index.html" → "/about/", "index.html" → "/". */
export function livePathOf(pagePath: string): string {
  const p = pagePath.replace(/(^|\/)index\.html?$/i, '$1').replace(/\.html?$/i, '');
  return `/${p}`;
}

/** Hostname of a URL for the address bar ("https://www.x.com/a" → "www.x.com"). */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
