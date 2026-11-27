/**
 * Admin → Marketing, SEO and Local: live figures for an Eloma Group company,
 * read on request (nothing typed in by hand, nothing stored in the database).
 *
 *  - Search Console  (provider 'search_console'):   clicks, impressions, position, by
 *    day and by country, and the queries each country finds the site with.
 *  - Google Analytics (provider 'google_analytics'): key events (leads) from organic search.
 *  - Business Profile (provider 'business_profile'): views, calls, direction requests,
 *    website clicks and reviews.
 *  - PageSpeed Insights (no sign-in): mobile score and Core Web Vitals of the site.
 *
 * Each company is pointed at its own property / location with the same
 * Connected accounts links the social figures use.
 */
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import * as google from './google.service.js';
import { accessTokenFor, type TokenStore } from './oauth2.js';
import { FIRST_DAY } from './social.service.js';

const CACHE_MS = 30 * 60_000;
/** Search Console keeps 16 months. */
const GSC_DAYS = 480;
/** The five markets the SEO report tracks, with Search Console's country codes. */
const COUNTRIES = { au: 'aus', nz: 'nzl', gb: 'gbr', us: 'usa', ca: 'can' } as const;

type Json = Record<string, unknown>;

class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function gget<T = Json>(token: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      msg = j.error?.message ?? msg;
    } catch {
      /* not json */
    }
    throw new GoogleApiError(res.status, String(msg).split('\n')[0].slice(0, 300));
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const firstDay = () => {
  const min = day(daysAgo(GSC_DAYS));
  return min > FIRST_DAY ? min : FIRST_DAY;
};

// ─── Choices shown in Connected accounts (read when the login is connected) ───

export type Choice = { id: string; name: string; account?: string };

/** The sites, properties or locations a freshly connected login can read. */
export async function listChoices(provider: google.GoogleDataProvider, token: string): Promise<{ choices: Choice[]; note: string | null }> {
  if (provider === 'search_console') {
    const j = await gget<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites');
    const choices = (j.siteEntry ?? [])
      .filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
      .map((s) => ({ id: s.siteUrl, name: s.siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '') }));
    return { choices, note: choices.length ? null : 'Connected, but this Google login has no verified Search Console property.' };
  }
  if (provider === 'google_analytics') {
    const out: Choice[] = [];
    let next: string | undefined;
    do {
      const j = await gget<{ accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[]; nextPageToken?: string }>(
        token,
        `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${next ? `&pageToken=${encodeURIComponent(next)}` : ''}`
      );
      for (const a of j.accountSummaries ?? []) for (const p of a.propertySummaries ?? []) out.push({ id: p.property, name: `${p.displayName} (${a.displayName})` });
      next = j.nextPageToken;
    } while (next);
    return { choices: out, note: out.length ? null : 'Connected, but this Google login cannot read any Google Analytics 4 property.' };
  }
  // Business Profile: every location on every account the login manages.
  try {
    const accs = await gget<{ accounts?: { name: string; accountName: string }[] }>(token, 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
    const out: Choice[] = [];
    for (const a of accs.accounts ?? []) {
      let next: string | undefined;
      do {
        const j = await gget<{ locations?: { name: string; title: string; storefrontAddress?: { locality?: string } }[]; nextPageToken?: string }>(
          token,
          `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress&pageSize=100${next ? `&pageToken=${encodeURIComponent(next)}` : ''}`
        );
        for (const l of j.locations ?? []) out.push({ id: l.name, name: l.title + (l.storefrontAddress?.locality ? `, ${l.storefrontAddress.locality}` : ''), account: a.name });
        next = j.nextPageToken;
      } while (next);
    }
    return { choices: out, note: out.length ? null : 'Connected, but this Google login does not manage any Business Profile.' };
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 403 || err.status === 429))
      return { choices: [], note: 'Connected, but Google has not approved Business Profile API access for this app yet. Press Connect again once access is approved.' };
    throw err;
  }
}

// ─── Live report ───

const store: TokenStore = {
  read: (id) => prisma.groupSocialConnection.findUnique({ where: { id } }),
  write: (id, data) => prisma.groupSocialConnection.update({ where: { id }, data }),
};

export type SearchReport = {
  company: string;
  fetchedAt: string;
  /** What each source needs, when it gave nothing. */
  status: Record<'gsc' | 'ga' | 'gbp' | 'psi', { connected: boolean; name: string | null; error: string | null }>;
  /** day → [clicks, impressions, position × impressions] */
  gsc: Record<string, [number, number, number]>;
  countries: Record<string, Record<string, [number, number, number]>>;
  /** Queries per country: last 28 days and the 28 days before. */
  queries: Record<string, { q: string; pos: number; impr: number; clicks: number; url: string | null; prevPos: number | null; prevUrl: string | null }[]>;
  windows: { cur: [string, string]; prev: [string, string] } | null;
  /** day → organic-search key events */
  leads: Record<string, number>;
  psi: { url: string; perf: number | null; lcp: number | null; inp: number | null; cls: number | null } | null;
  /** day → [views, calls, directions, website clicks, new reviews] */
  gbp: Record<string, [number, number, number, number, number]>;
  reviews: { total: number; rating: number | null; replied: number | null } | null;
  /** Portal tasks completed for this company (its own customer record, matched by name). */
  tasks: { id: string; date: string; title: string; list: string; team: string | null }[];
};

const cache = new Map<string, { at: number; data: SearchReport }>();
const inflight = new Map<string, Promise<SearchReport>>();

/** Drop a company's cached figures (after its accounts change). */
export const forget = (company: string) => cache.delete(company);

export async function getSearchReport(company: string, refresh = false): Promise<SearchReport> {
  if (!/^[a-z]+$/.test(company)) throw ApiError.badRequest('Unknown company');
  const hit = cache.get(company);
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  let p = inflight.get(company);
  if (!p) {
    p = build(company)
      .then((data) => {
        cache.set(company, { at: Date.now(), data });
        return data;
      })
      .finally(() => inflight.delete(company));
    inflight.set(company, p);
  }
  return p;
}

const errText = (label: string, err: unknown) => {
  if (err instanceof GoogleApiError && err.status === 403) return `${label} refused access: ${err.message}`;
  if (err instanceof GoogleApiError && err.status === 401) return `${label} access has expired. Connect it again.`;
  return `${label} could not be read: ${(err as Error).message}`;
};

async function build(company: string): Promise<SearchReport> {
  const links = await prisma.groupSocialLink.findMany({
    where: { company, provider: { in: [...google.GOOGLE_DATA_PROVIDERS] } },
    include: { connection: true },
  });
  const linkOf = (p: google.GoogleDataProvider) => links.find((l) => l.provider === p && l.connection.status !== 'EXPIRED');
  const out: SearchReport = {
    company,
    fetchedAt: new Date().toISOString(),
    status: {
      gsc: { connected: false, name: null, error: null },
      ga: { connected: false, name: null, error: null },
      gbp: { connected: false, name: null, error: null },
      psi: { connected: false, name: null, error: null },
    },
    gsc: {},
    countries: {},
    queries: {},
    windows: null,
    leads: {},
    psi: null,
    gbp: {},
    reviews: null,
    tasks: [],
  };
  const tokenFor = (l: NonNullable<ReturnType<typeof linkOf>>) =>
    accessTokenFor(l.connection, google.refresher(l.provider as google.GoogleProvider), google.labelFor(l.provider as google.GoogleProvider), store);
  const sel = (l: { selected: unknown }) => (l.selected ?? {}) as Record<string, string | null | undefined>;

  const jobs: Promise<void>[] = [];
  let siteUrl: string | null = null;

  // ── Search Console ──
  const gscLink = linkOf('search_console');
  if (gscLink && sel(gscLink).siteUrl) {
    siteUrl = sel(gscLink).siteUrl!;
    out.status.gsc = { connected: true, name: siteUrl.replace(/^sc-domain:/, ''), error: null };
    jobs.push(
      (async () => {
        const token = await tokenFor(gscLink);
        const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl!)}/searchAnalytics/query`;
        const start = firstDay();
        const end = day(new Date());
        const byDate = async (country?: string) => {
          const j = await gget<{ rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] }>(token, base, {
            startDate: start,
            endDate: end,
            dimensions: ['date'],
            rowLimit: 25000,
            dataState: 'all',
            ...(country ? { dimensionFilterGroups: [{ filters: [{ dimension: 'country', operator: 'equals', expression: country }] }] } : {}),
          });
          const m: Record<string, [number, number, number]> = {};
          for (const r of j.rows ?? []) m[r.keys[0]] = [r.clicks, r.impressions, r.position * r.impressions];
          return m;
        };
        out.gsc = await byDate();
        // Queries: last 28 days (ending 2 days ago, when Search Console is complete) vs the 28 before.
        const curEnd = daysAgo(2), curStart = daysAgo(29), prevEnd = daysAgo(30), prevStart = daysAgo(57);
        out.windows = { cur: [day(curStart), day(curEnd)], prev: [day(prevStart), day(prevEnd)] };
        const queries = async (country: string, a: Date, b: Date) => {
          const j = await gget<{ rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] }>(token, base, {
            startDate: day(a),
            endDate: day(b),
            dimensions: ['query', 'page'],
            rowLimit: 500,
            dimensionFilterGroups: [{ filters: [{ dimension: 'country', operator: 'equals', expression: country }] }],
          });
          // One row per query: the page with the most impressions, impression-weighted position.
          const q = new Map<string, { impr: number; clicks: number; posw: number; url: string; best: number }>();
          for (const r of j.rows ?? []) {
            const [query, page] = r.keys;
            const e = q.get(query) ?? { impr: 0, clicks: 0, posw: 0, url: page, best: 0 };
            e.impr += r.impressions;
            e.clicks += r.clicks;
            e.posw += r.position * r.impressions;
            if (r.impressions > e.best) {
              e.best = r.impressions;
              e.url = page;
            }
            q.set(query, e);
          }
          return q;
        };
        await Promise.all(
          Object.entries(COUNTRIES).map(async ([k, code]) => {
            out.countries[k] = await byDate(code);
            const [cur, prev] = await Promise.all([queries(code, curStart, curEnd), queries(code, prevStart, prevEnd)]);
            out.queries[k] = [...cur.entries()]
              .sort((a, b) => b[1].impr - a[1].impr)
              .slice(0, 50)
              .map(([q, e]) => {
                const p = prev.get(q);
                return {
                  q,
                  pos: Math.round((e.posw / e.impr) * 10) / 10,
                  impr: e.impr,
                  clicks: e.clicks,
                  url: e.url,
                  prevPos: p ? Math.round((p.posw / p.impr) * 10) / 10 : null,
                  prevUrl: p?.url ?? null,
                };
              });
          })
        );
      })().catch((err) => {
        out.status.gsc.error = errText('Search Console', err);
      })
    );
  }

  // ── Google Analytics: key events from organic search ──
  const gaLink = linkOf('google_analytics');
  if (gaLink && sel(gaLink).propertyId) {
    const prop = sel(gaLink).propertyId!;
    out.status.ga = { connected: true, name: prop, error: null };
    jobs.push(
      (async () => {
        const token = await tokenFor(gaLink);
        const j = await gget<{ rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }>(
          token,
          `https://analyticsdata.googleapis.com/v1beta/${prop}:runReport`,
          {
            dateRanges: [{ startDate: firstDay(), endDate: 'today' }],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'keyEvents' }],
            dimensionFilter: { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { value: 'Organic Search' } } },
            limit: 100000,
          }
        );
        for (const r of j.rows ?? []) {
          const d = r.dimensionValues[0].value;
          out.leads[`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`] = Math.round(+r.metricValues[0].value || 0);
        }
      })().catch((err) => {
        out.status.ga.error = errText('Google Analytics', err);
      })
    );
  }

  // ── Business Profile: performance and reviews ──
  const gbpLink = linkOf('business_profile');
  if (gbpLink && sel(gbpLink).locationId) {
    const loc = sel(gbpLink).locationId!;
    const acc = sel(gbpLink).accountId ?? null;
    out.status.gbp = { connected: true, name: loc, error: null };
    jobs.push(
      (async () => {
        const token = await tokenFor(gbpLink);
        const s = new Date(`${firstDay() > day(daysAgo(540)) ? firstDay() : day(daysAgo(540))}T00:00:00Z`);
        const e = daysAgo(1);
        const q = new URLSearchParams();
        const metrics = {
          views: ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH'],
          calls: ['CALL_CLICKS'],
          dirs: ['BUSINESS_DIRECTION_REQUESTS'],
          web: ['WEBSITE_CLICKS'],
        };
        Object.values(metrics).flat().forEach((m) => q.append('dailyMetrics', m));
        q.set('dailyRange.startDate.year', String(s.getUTCFullYear()));
        q.set('dailyRange.startDate.month', String(s.getUTCMonth() + 1));
        q.set('dailyRange.startDate.day', String(s.getUTCDate()));
        q.set('dailyRange.endDate.year', String(e.getUTCFullYear()));
        q.set('dailyRange.endDate.month', String(e.getUTCMonth() + 1));
        q.set('dailyRange.endDate.day', String(e.getUTCDate()));
        type Series = { dailyMetric: string; timeSeries?: { datedValues?: { date: { year: number; month: number; day: number }; value?: string }[] } };
        const j = await gget<{ multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: Series[] }[] }>(
          token,
          `https://businessprofileperformance.googleapis.com/v1/${loc}:fetchMultiDailyMetricsTimeSeries?${q}`
        );
        const col = (m: string) => (metrics.views.includes(m) ? 0 : m === 'CALL_CLICKS' ? 1 : m === 'BUSINESS_DIRECTION_REQUESTS' ? 2 : 3);
        for (const group of j.multiDailyMetricTimeSeries ?? []) {
          for (const ser of group.dailyMetricTimeSeries ?? []) {
            for (const v of ser.timeSeries?.datedValues ?? []) {
              const d = `${v.date.year}-${String(v.date.month).padStart(2, '0')}-${String(v.date.day).padStart(2, '0')}`;
              const row = (out.gbp[d] ??= [0, 0, 0, 0, 0]);
              row[col(ser.dailyMetric)] += +(v.value ?? 0) || 0;
            }
          }
        }
        // Reviews (Google My Business v4): totals, rating, replies and new reviews by day.
        if (acc) {
          let next: string | undefined;
          let total = 0;
          let rating: number | null = null;
          let replied = 0;
          let seen = 0;
          let pages = 0;
          do {
            const r = await gget<{ reviews?: { createTime: string; reviewReply?: unknown }[]; averageRating?: number; totalReviewCount?: number; nextPageToken?: string }>(
              token,
              `https://mybusiness.googleapis.com/v4/${acc}/${loc}/reviews?pageSize=50${next ? `&pageToken=${encodeURIComponent(next)}` : ''}`
            );
            total = r.totalReviewCount ?? total;
            rating = r.averageRating ?? rating;
            for (const rv of r.reviews ?? []) {
              seen++;
              if (rv.reviewReply) replied++;
              const d = rv.createTime.slice(0, 10);
              (out.gbp[d] ??= [0, 0, 0, 0, 0])[4] += 1;
            }
            next = r.nextPageToken;
          } while (next && ++pages < 40);
          out.reviews = { total, rating, replied: seen ? Math.round((replied / seen) * 100) : null };
        }
      })().catch((err) => {
        out.status.gbp.error = errText('Business Profile', err);
      })
    );
  }

  jobs.push(
    completedTasks(company)
      .then((t) => {
        out.tasks = t;
      })
      .catch((err) => logger.warn({ err, company }, 'Marketing: reading completed tasks failed'))
  );
  await Promise.all(jobs);

  // ── PageSpeed Insights (mobile) for the site's home page ──
  const home = homeUrl(siteUrl);
  if (home) {
    out.status.psi = { connected: true, name: home, error: null };
    try {
      const q = new URLSearchParams({ url: home, strategy: 'mobile', category: 'performance' });
      if (env.PAGESPEED_API_KEY) q.set('key', env.PAGESPEED_API_KEY);
      const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(90_000) });
      const j = (await res.json()) as {
        error?: { message?: string };
        lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { numericValue?: number }> };
        loadingExperience?: { metrics?: Record<string, { percentile?: number }> };
      };
      if (!res.ok) throw new Error(j.error?.message ?? res.statusText);
      const field = j.loadingExperience?.metrics ?? {};
      const lab = j.lighthouseResult?.audits ?? {};
      const score = j.lighthouseResult?.categories?.performance?.score;
      out.psi = {
        url: home,
        perf: score != null ? Math.round(score * 100) : null,
        lcp: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile != null ? field.LARGEST_CONTENTFUL_PAINT_MS.percentile / 1000 : lab['largest-contentful-paint']?.numericValue != null ? lab['largest-contentful-paint'].numericValue / 1000 : null,
        inp: field.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
        cls: field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : lab['cumulative-layout-shift']?.numericValue ?? null,
      };
    } catch (err) {
      out.status.psi.error = `PageSpeed Insights could not test ${home}: ${(err as Error).message}`;
      logger.warn({ err, home }, 'PageSpeed Insights failed');
    }
  }
  return out;
}

/** The home page of the website chosen in Search Console (PageSpeed tests nothing else). */
function homeUrl(siteUrl: string | null): string | null {
  if (!siteUrl) return null;
  return siteUrl.startsWith('sc-domain:') ? `https://${siteUrl.slice(10)}/` : siteUrl;
}

const COMPANY_NAMES: Record<string, string> = {
  egeloma: 'EG Eloma',
  bivry: 'Bivry',
  egimports: 'EG Imports',
  egtravels: 'EG Travels',
  elomacare: 'ELOMA Customer Care',
};

/** Tasks completed in the portal for the group company's own customer record (read only). */
async function completedTasks(company: string): Promise<SearchReport['tasks']> {
  const name = COMPANY_NAMES[company];
  if (!name) return [];
  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { companyName: { equals: name, mode: 'insensitive' } },
        { tradingAs: { equals: name, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  if (!customers.length) return [];
  const rows = await prisma.task.findMany({
    where: { customerId: { in: customers.map((c) => c.id) }, completedAt: { gte: new Date(`${firstDay()}T00:00:00Z`) } },
    select: { taskNumber: true, title: true, completedAt: true, assignedTeam: true, bucket: { select: { name: true } } },
    orderBy: { completedAt: 'desc' },
    take: 500,
  });
  return rows.map((t) => ({ id: t.taskNumber, date: t.completedAt!.toISOString(), title: t.title, list: t.bucket.name, team: t.assignedTeam }));
}
