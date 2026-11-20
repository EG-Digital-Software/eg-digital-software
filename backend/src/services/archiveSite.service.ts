import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { unzip, type Unzipped } from 'fflate';
import { logger } from '../config/logger.js';
import { storage } from './storage/index.js';

/**
 * Archived websites. An admin uploads a saved copy of a site to a task's
 * Archive tab — either a ZIP (HTTrack, "Save page as", …) or a single HTML file
 * (SingleFile). The upload is kept untouched for download, and a fast,
 * clickable copy is built next to it for viewing in the portal:
 *
 *   <key>.site/<every page and file of the site>
 *   <key>.site/__eg_site.json   ← manifest, written LAST (its presence = ready)
 *
 * Saved pages often inline every image as base64 (a SingleFile page can be
 * 60 MB+), which makes them crawl. Those images are moved out into their own
 * files, below-the-fold images load lazily, and text is stored gzipped, so the
 * page shows in a moment and images stream in.
 */
export const SITE_SUFFIX = '.site/';
export const SITE_MANIFEST = '__eg_site.json';

/** Generous but bounded, so a huge or hostile upload can't exhaust the server. */
const MAX_FILES = 5000;
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;
const MAX_FILE_BYTES = 150 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 8;
const MAX_LISTED_PAGES = 60;
/** Inline data: URIs smaller than this stay inline (icons, tiny SVGs). */
const MIN_EXTRACT_CHARS = 3000;
/** The first images of a page load straight away; the rest load as they scroll into view. */
const EAGER_IMAGES = 4;
const ASSET_DIR = '_assets/';

export interface SiteManifest {
  version: 1;
  /** Path (relative to the site folder) of the page that opens first. */
  entry: string;
  /** HTML pages, entry first, for the viewer's page list. */
  pages: { path: string; title: string }[];
  pageCount: number;
  fileCount: number;
  totalSize: number;
  /** An image from the home page, for the archive card's thumbnail. */
  thumb?: string;
  builtAt: string;
}

const ZIP_TYPES = new Set(['application/zip', 'application/x-zip-compressed', 'application/x-zip', 'multipart/x-zip']);

export function isZipUpload(name: string, mimetype?: string | null): boolean {
  return /\.zip$/i.test(name) || (!!mimetype && ZIP_TYPES.has(mimetype.toLowerCase()));
}
export function isHtmlUpload(name: string, mimetype?: string | null): boolean {
  return /\.html?$/i.test(name) || (!!mimetype && mimetype.toLowerCase().startsWith('text/html'));
}
/** A ZIP or a saved HTML page — both open as a website snapshot. */
export const isSiteUpload = (name: string, mimetype?: string | null) =>
  isZipUpload(name, mimetype) || isHtmlUpload(name, mimetype);

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json',
  xml: 'application/xml',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
};
/** data: URI media type → file extension. */
const EXT_OF: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/bmp': 'bmp',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'application/font-woff2': 'woff2',
  'application/font-woff': 'woff',
  'application/x-font-woff': 'woff',
  'font/ttf': 'ttf',
  'application/x-font-ttf': 'ttf',
  'font/otf': 'otf',
  'application/vnd.ms-fontobject': 'eot',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'text/css': 'css',
  'application/javascript': 'js',
  'text/javascript': 'js',
};
const COMPRESSIBLE = /\.(html?|css|m?js|json|xml|txt|svg)$/i;

const extOf = (p: string) => p.split('.').pop()?.toLowerCase() ?? '';
const mimeOf = (p: string) => MIME[extOf(p)] ?? 'application/octet-stream';
const isHtml = (p: string) => /\.html?$/i.test(p);
const isImagePath = (p: string) => /^(png|jpe?g|gif|webp|avif|svg|bmp)$/.test(extOf(p));

/** A safe, normalised relative path — or null for folders, junk and anything that tries to escape. */
function cleanPath(raw: string): string | null {
  const p = raw.replace(/\\/g, '/');
  if (!p || p.endsWith('/')) return null;
  const parts = p.split('/').filter((s) => s && s !== '.');
  if (!parts.length || parts.some((s) => s === '..' || s.includes(':'))) return null;
  if (parts[0] === '__MACOSX' || parts.some((s) => s === '.DS_Store' || s === 'Thumbs.db')) return null;
  if (parts[parts.length - 1] === SITE_MANIFEST || parts[0] === ASSET_DIR.slice(0, -1)) return null;
  return parts.join('/');
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

function htmlTitle(html: string, fallback: string): string {
  const m = html.slice(0, 256 * 1024).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const raw = decodeEntities(m?.[1] ?? '').replace(/\s+/g, ' ').trim();
  return (raw || fallback).slice(0, 80);
}

/** Readable fallback label from a page path: "about-us/index.html" → "About us". */
function labelFromPath(p: string): string {
  const parts = p.replace(/\.html?$/i, '').split('/');
  let last = parts.pop() ?? '';
  if (/^index$/i.test(last)) last = parts.pop() ?? 'Home';
  const words = last.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Home';
}

/**
 * Tiny helper added to each archived page (the original upload stays
 * untouched): tells the portal which page is showing, and lets the viewer's
 * Back button step back through the snapshot's own history.
 */
const BRIDGE =
  '<script>(function(){try{var s=function(){parent.postMessage({egSite:"nav",path:location.pathname,title:document.title},"*")};' +
  's();addEventListener("pageshow",s);addEventListener("message",function(e){if(e.data&&e.data.egSite==="back")history.back()})}catch(e){}})();</script>';

/**
 * Make a saved page light: move large inline data: URIs into files under
 * _assets/ (deduplicated by content), and let images past the first few load
 * lazily. Returns the rewritten HTML plus the new files.
 */
function lightenHtml(html: string, pagePath: string, assets: Map<string, Buffer>): string {
  const up = '../'.repeat(pagePath.split('/').length - 1);
  let out = html.replace(
    /data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;[a-z0-9=._-]+)*;base64,([A-Za-z0-9+/=]+)/gi,
    (whole, type: string, b64: string) => {
      if (b64.length < MIN_EXTRACT_CHARS) return whole;
      const ext = EXT_OF[type.toLowerCase()];
      if (!ext) return whole;
      const bytes = Buffer.from(b64, 'base64');
      const name = `${ASSET_DIR}${createHash('sha1').update(bytes).digest('hex').slice(0, 20)}.${ext}`;
      if (!assets.has(name)) assets.set(name, bytes);
      return up + name;
    }
  );
  let seen = 0;
  out = out.replace(/<img\b[^>]*>/gi, (tag) => {
    seen++;
    if (seen <= EAGER_IMAGES || /\sloading\s*=/i.test(tag)) return tag;
    return tag.replace(/^<img\b/i, '<img loading="lazy" decoding="async"');
  });
  const at = out.toLowerCase().lastIndexOf('</body>');
  return at >= 0 ? out.slice(0, at) + BRIDGE + out.slice(at) : out + BRIDGE;
}

/** Resolve a URL used in a page to a site-relative path ("../img/a.png" from "about/x.html" → "img/a.png"). */
function resolveIn(pagePath: string, ref: string): string | null {
  if (!ref || /^[a-z]+:|^\/\//i.test(ref) || ref.startsWith('#')) return null;
  const clean = decodeEntities(ref).split(/[?#]/)[0];
  const parts = clean.startsWith('/') ? [] : pagePath.split('/').slice(0, -1);
  for (const seg of clean.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  try {
    return decodeURIComponent(parts.join('/'));
  } catch {
    return parts.join('/');
  }
}

/** The home page's social-share image, else its first sizeable picture. */
function pickThumb(html: string, entry: string, sizes: Map<string, number>): string | undefined {
  const candidates: string[] = [];
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (og) candidates.push(og[1]);
  for (const m of html.matchAll(/<img\b[^>]*?\ssrc=["']([^"']+)["']/gi)) {
    candidates.push(m[1]);
    if (candidates.length > 40) break;
  }
  for (const c of candidates) {
    const p = resolveIn(entry, c);
    if (p && isImagePath(p) && (sizes.get(p) ?? 0) >= 8 * 1024) return p;
  }
  return undefined;
}

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  let files = 0;
  let total = 0;
  return new Promise((resolve, reject) => {
    unzip(
      data,
      {
        // Checked before anything is inflated — a ZIP bomb is refused, not expanded.
        filter: (f) => {
          if (!cleanPath(f.name)) return false;
          files++;
          total += f.originalSize;
          if (files > MAX_FILES) throw new Error(`the ZIP has more than ${MAX_FILES} files`);
          if (f.originalSize > MAX_FILE_BYTES) throw new Error(`"${f.name}" is larger than 150 MB`);
          if (total > MAX_TOTAL_BYTES) throw new Error('the unpacked site is larger than 400 MB');
          return true;
        },
      },
      (err, out) => (err ? reject(err) : resolve(out))
    );
  });
}

/** Storage key (or URL) of an upload's website folder. */
export const siteFolderOf = (uploadUrlOrKey: string) => `${uploadUrlOrKey}${SITE_SUFFIX}`;

async function saveFile(key: string, path: string, body: Buffer) {
  if (storage.supportsEncoding && COMPRESSIBLE.test(path) && body.length > 1024) {
    await storage.save(key, gzipSync(body, { level: 6 }), mimeOf(path), { contentEncoding: 'gzip' });
  } else {
    await storage.save(key, body, mimeOf(path));
  }
}

/**
 * Build the website copy of an archived ZIP or HTML page next to where it is
 * stored. Returns the manifest, or null when there are no web pages (it then
 * stays a plain downloadable file). Throws with a readable message when the
 * upload is refused (too big, corrupt).
 */
export async function buildArchiveSite(
  uploadKey: string,
  data: Buffer,
  kind: 'zip' | 'html' = 'zip'
): Promise<SiteManifest | null> {
  let entries: (readonly [string, Buffer])[];
  if (kind === 'html') {
    if (data.length > MAX_TOTAL_BYTES) throw new Error('the page is larger than 400 MB');
    entries = [['index.html', data]];
  } else {
    const unzipped = await unzipAsync(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    // Typed explicitly: @types/node versions differ on Buffer's generic, so an
    // inferred tuple type breaks the CI build.
    const named: (readonly [string | null, Buffer])[] = Object.entries(unzipped).map(([name, bytes]) => [
      cleanPath(name),
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as Buffer,
    ]);
    entries = named.filter((e): e is readonly [string, Buffer] => !!e[0]);
    // Drop a single wrapping folder ("mysite/index.html" → "index.html").
    const roots = new Set(entries.map(([p]) => (p.includes('/') ? p.split('/')[0] : '')));
    if (roots.size === 1 && !roots.has('')) {
      const cut = [...roots][0].length + 1;
      entries = entries.map(([p, b]) => [p.slice(cut), b] as const);
    }
  }

  const pageNames = entries.filter(([p]) => isHtml(p)).map(([p]) => p);
  if (!pageNames.length) return null;
  const depth = (p: string) => p.split('/').length;
  const entry =
    pageNames.find((p) => /^index\.html?$/i.test(p)) ??
    [...pageNames].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))[0];

  // Lighten every page; collect the images pulled out of them.
  const assets = new Map<string, Buffer>();
  const titles = new Map<string, string>();
  let entryHtml = '';
  const files: [string, Buffer][] = entries.map(([p, bytes]) => {
    if (!isHtml(p)) return [p, bytes];
    const html = bytes.toString('utf8');
    titles.set(p, p === entry ? 'Home' : htmlTitle(html, labelFromPath(p)));
    const light = lightenHtml(html, p, assets);
    if (p === entry) entryHtml = light;
    return [p, Buffer.from(light, 'utf8')];
  });
  for (const [name, bytes] of assets) files.push([name, bytes]);

  const prefix = siteFolderOf(uploadKey);
  const sizes = new Map(files.map(([p, b]) => [p, b.length]));
  let totalSize = 0;
  const queue = [...files];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [p, body] = next;
      totalSize += body.length;
      await saveFile(prefix + p, p, body);
    }
  };
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));

  const listed = [...pageNames]
    .sort((a, b) => (a === entry ? -1 : b === entry ? 1 : depth(a) - depth(b) || a.localeCompare(b)))
    .slice(0, MAX_LISTED_PAGES)
    .map((p) => ({ path: p, title: titles.get(p) ?? labelFromPath(p) }));

  const manifest: SiteManifest = {
    version: 1,
    entry,
    pages: listed,
    pageCount: pageNames.length,
    fileCount: files.length,
    totalSize,
    thumb: pickThumb(entryHtml, entry, sizes),
    builtAt: new Date().toISOString(),
  };
  // Written last, never compressed: the viewer treats its presence as "site is ready".
  await storage.save(prefix + SITE_MANIFEST, Buffer.from(JSON.stringify(manifest)), 'application/json');
  return manifest;
}

/**
 * Build in the background so a large site never holds the upload request open
 * (App Service cuts requests after ~230 s). The viewer polls for the manifest.
 * `load` supplies the bytes — already in memory on upload, read from storage on a rebuild.
 */
export function buildArchiveSiteInBackground(
  uploadKey: string,
  load: Buffer | (() => Promise<Buffer | null>),
  name: string,
  mimetype?: string | null
): void {
  const kind = isZipUpload(name, mimetype) ? 'zip' : 'html';
  void (async () => {
    const data = typeof load === 'function' ? await load() : load;
    if (!data) throw new Error('the file is missing from storage');
    const m = await buildArchiveSite(uploadKey, data, kind);
    logger.info({ uploadKey, pages: m?.pageCount ?? 0, files: m?.fileCount ?? 0 }, `Archived website ready: ${name}`);
  })().catch((err) => logger.warn({ err, uploadKey }, `Archived website could not be built: ${name}`));
}

/** Remove an upload's website copy (best-effort). */
export async function removeArchiveSite(uploadUrl: string): Promise<void> {
  await storage
    .removePrefix(siteFolderOf(uploadUrl))
    .catch((err) => logger.warn({ err, uploadUrl }, 'Failed to remove an archived website from storage'));
}
