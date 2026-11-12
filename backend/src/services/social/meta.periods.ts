import { decryptSecret } from '../../utils/secretBox.js';
import { MetaError, dayKey, graph, graphPages, unix, type MetaAssets, type MetaSelection } from './meta.service.js';

/**
 * Channel insights figures Meta only gives as a total for a date range (not day
 * by day): Instagram account totals and breakdowns, Instagram audience, and
 * Meta Ads results, placements, audience and the campaign / ad tables. They are
 * read once per reporting period (a calendar month, or the matching part of the
 * month before) and stored as SocialPeriodValue rows.
 *
 * Every request stands alone: whatever Meta refuses is skipped and noted, so
 * one renamed metric never blanks the rest.
 */

export interface Period {
  key: string;
  /** First and last day, inclusive (UTC midnight). */
  start: Date;
  end: Date;
}

export interface PeriodRow {
  /** 'meta' holds bookkeeping rows (which months have been read), not figures. */
  platform: 'ig' | 'ma' | 'meta';
  metric: string;
  key: string;
  start: Date;
  end: Date;
  value: number | null;
  data?: unknown;
}

const DAY = 86400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pctOf = (a: number, total: number) => (total > 0 ? r2((a / total) * 100) : 0);

// ─── Instagram ──────────────────────────────────────────────

type TotalRow = {
  name: string;
  total_value?: { value?: number; breakdowns?: { results?: { dimension_values: string[]; value: number }[] }[] };
};

interface Total {
  value: number;
  by: Map<string, number>;
}

/** Totals for `metrics` over [start, end], in ≤30-day windows (Instagram's limit), summed. */
async function igTotals(igId: string, token: string, metrics: string[], start: Date, end: Date, breakdown?: string) {
  const out = new Map<string, Total>();
  const add = (rows: TotalRow[]) => {
    for (const r of rows) {
      const t = out.get(r.name) ?? { value: 0, by: new Map() };
      t.value += Number(r.total_value?.value ?? 0) || 0;
      for (const b of r.total_value?.breakdowns ?? []) {
        for (const x of b.results ?? []) {
          const k = x.dimension_values.join('|');
          t.by.set(k, (t.by.get(k) ?? 0) + (Number(x.value) || 0));
        }
      }
      out.set(r.name, t);
    }
  };
  for (let s = start.getTime(); s <= end.getTime(); s += 30 * DAY) {
    const e = Math.min(end.getTime(), s + 29 * DAY);
    const params = { metric_type: 'total_value', period: 'day', since: unix(new Date(s)), until: unix(new Date(e + DAY)), ...(breakdown ? { breakdown } : {}) };
    try {
      add((await graph<{ data: TotalRow[] }>(`/${igId}/insights`, { ...params, metric: metrics.join(',') }, token)).data ?? []);
    } catch (err) {
      if (err instanceof MetaError && err.expired) throw err;
      // One unsupported metric fails the whole request — ask for each on its own.
      if (metrics.length === 1) continue;
      for (const m of metrics) {
        try {
          add((await graph<{ data: TotalRow[] }>(`/${igId}/insights`, { ...params, metric: m }, token)).data ?? []);
        } catch (e2) {
          if (e2 instanceof MetaError && e2.expired) throw e2;
        }
      }
    }
  }
  return out;
}

const byKey = (t: Total | undefined, k: string) => t?.by.get(k) ?? 0;

async function igPeriod(igId: string, token: string, p: Period): Promise<PeriodRow[]> {
  const rows: PeriodRow[] = [];
  const put = (metric: string, value: number | null | undefined) => {
    if (value != null && Number.isFinite(value)) rows.push({ platform: 'ig', metric, key: p.key, start: p.start, end: p.end, value: r2(value) });
  };
  const A = await igTotals(igId, token, ['views', 'reach', 'profile_views', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'reposts'], p.start, p.end);
  const map: [string, string][] = [
    ['views', 'views'],
    ['reach', 'reach'],
    ['profile_views', 'visits'],
    ['total_interactions', 'interactions'],
    ['likes', 'likes'],
    ['comments', 'comments'],
    ['shares', 'shares'],
    ['saves', 'saves'],
    ['reposts', 'reposts'],
  ];
  // Meta reports these net of un-likes and un-saves, so a quiet month can come back below zero.
  for (const [meta, id] of map) if (A.has(meta)) put(id, Math.max(0, A.get(meta)!.value));

  const vf = (await igTotals(igId, token, ['views'], p.start, p.end, 'follow_type')).get('views');
  if (vf && vf.by.size) {
    const f = byKey(vf, 'FOLLOWER'),
      n = byKey(vf, 'NON_FOLLOWER');
    put('views_followers', pctOf(f, f + n));
    put('views_nonfollowers', pctOf(n, f + n));
  }
  const vt = (await igTotals(igId, token, ['views'], p.start, p.end, 'media_product_type')).get('views');
  if (vt && vt.by.size) {
    put('views_posts', byKey(vt, 'POST') + byKey(vt, 'CAROUSEL_CONTAINER'));
    put('views_reels', byKey(vt, 'REEL'));
    put('views_stories', byKey(vt, 'STORY'));
  }
  const rf = (await igTotals(igId, token, ['reach'], p.start, p.end, 'follow_type')).get('reach');
  if (rf && rf.by.size) {
    put('reach_followers', byKey(rf, 'FOLLOWER'));
    put('reach_nonfollowers', byKey(rf, 'NON_FOLLOWER'));
  }
  const fu = (await igTotals(igId, token, ['follows_and_unfollows'], p.start, p.end, 'follow_type')).get('follows_and_unfollows');
  if (fu && fu.by.size) {
    const follows = byKey(fu, 'FOLLOWER'),
      unfollows = byKey(fu, 'NON_FOLLOWER');
    put('follows', follows);
    put('unfollows', unfollows);
    put('net_follows', follows - unfollows);
  }
  const lt = (await igTotals(igId, token, ['profile_links_taps'], p.start, p.end, 'contact_button_type')).get('profile_links_taps');
  if (lt) {
    const call = byKey(lt, 'CALL'),
      email = byKey(lt, 'EMAIL'),
      dir = byKey(lt, 'DIRECTION'),
      text = byKey(lt, 'TEXT');
    put('call_taps', call);
    put('email_taps', email);
    put('direction_taps', dir);
    put('text_taps', text);
    put('link_clicks', Math.max(0, lt.value - call - email - dir - text));
  }
  return rows;
}

const AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const regionName = (() => {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    return (code: string) => dn.of(code) ?? code;
  } catch {
    return (code: string) => code;
  }
})();

/** Followers by age and gender, top cities and countries (Meta needs 100+ followers). */
async function igAudience(igId: string, token: string): Promise<PeriodRow | null> {
  const ask = async (breakdown: string) => {
    for (const extra of [{}, { timeframe: 'this_month' }]) {
      try {
        const res = await graph<{ data: TotalRow[] }>(
          `/${igId}/insights`,
          { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown, ...extra },
          token
        );
        const t = new Map<string, number>();
        for (const b of res.data?.[0]?.total_value?.breakdowns ?? []) for (const x of b.results ?? []) t.set(x.dimension_values.join('|'), Number(x.value) || 0);
        if (t.size) return t;
      } catch (err) {
        if (err instanceof MetaError && err.expired) throw err;
      }
    }
    return null;
  };
  const ag = await ask('age,gender');
  if (!ag) return null;
  let total = 0,
    women = 0,
    men = 0;
  const ages = new Map<string, [number, number]>();
  for (const [k, v] of ag) {
    const [age, g] = k.split('|');
    total += v;
    const a = ages.get(age) ?? [0, 0];
    if (g === 'M') {
      men += v;
      a[0] += v;
    } else if (g === 'F') {
      women += v;
      a[1] += v;
    }
    ages.set(age, a);
  }
  const top = (m: Map<string, number> | null, n: number, name: (k: string) => string) => {
    if (!m) return [];
    const sum = [...m.values()].reduce((a, b) => a + b, 0);
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => [name(k), pctOf(v, sum)]);
  };
  const cities = await ask('city');
  const countries = await ask('country');
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  return {
    platform: 'ig',
    metric: 'audience',
    key: 'now',
    start: today,
    end: today,
    value: null,
    data: {
      women: pctOf(women, women + men),
      men: pctOf(men, women + men),
      // [age, men %, women %] of all followers — the order the page draws.
      ages: AGE_ORDER.filter((a) => ages.has(a)).map((a) => [a.replace('-', '–'), pctOf(ages.get(a)![0], total), pctOf(ages.get(a)![1], total)]),
      cities: top(cities, 5, (k) => k.split(',')[0]),
      countries: top(countries, 4, regionName),
    },
  };
}

// ─── Meta Ads ───────────────────────────────────────────────

type Action = { action_type: string; value: string };
const first = (list: Action[] | undefined, types: string[]) => {
  for (const t of types) {
    const hit = list?.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
};
const LEADS = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'onsite_web_lead'];
const PURCHASES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'];
const ATC = ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'];
const CHECKOUT = ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'];

async function adsPeriod(actId: string, token: string, p: Period, active: Map<string, boolean>, warnings: string[]): Promise<PeriodRow[]> {
  const rows: PeriodRow[] = [];
  const time_range = JSON.stringify({ since: dayKey(p.start), until: dayKey(p.end) });
  const put = (metric: string, value: number | null | undefined, data?: unknown) => {
    if (data !== undefined) rows.push({ platform: 'ma', metric, key: p.key, start: p.start, end: p.end, value: null, data });
    else if (value != null && Number.isFinite(value)) rows.push({ platform: 'ma', metric, key: p.key, start: p.start, end: p.end, value: r2(value) });
  };
  const ask = async <T>(params: Record<string, string | number>, label: string) => {
    try {
      return await graphPages<T>(`/${actId}/insights`, { time_range, limit: 500, ...params }, token, undefined, 10);
    } catch (err) {
      if (err instanceof MetaError && err.expired) throw err;
      warnings.push(`Meta Ads ${label} could not be read`);
      return null;
    }
  };

  // Account totals
  type Acc = {
    spend?: string;
    reach?: string;
    impressions?: string;
    frequency?: string;
    cpm?: string;
    inline_link_clicks?: string;
    inline_link_click_ctr?: string;
    actions?: Action[];
    action_values?: Action[];
    video_thruplay_watched_actions?: Action[];
    video_avg_time_watched_actions?: Action[];
  };
  const accRows = await ask<Acc>(
      {
        level: 'account',
        fields:
          'spend,reach,impressions,frequency,cpm,inline_link_clicks,inline_link_click_ctr,actions,action_values,video_thruplay_watched_actions,video_avg_time_watched_actions',
      },
      'totals'
  );
  const acc = accRows?.[0];
  // Meta answers a month with no ads running with no rows: that month really spent nothing.
  if (accRows && !acc) for (const m of ['ma_spend', 'ma_reach', 'ma_impr', 'ma_clicks', 'ma_results']) put(m, 0);
  if (acc) {
    const spend = Number(acc.spend) || 0,
      impr = Number(acc.impressions) || 0,
      clicks = Number(acc.inline_link_clicks) || 0;
    const leads = first(acc.actions, LEADS),
      purchases = first(acc.actions, PURCHASES),
      value = first(acc.action_values, PURCHASES);
    const results = leads + purchases;
    put('ma_spend', spend);
    put('ma_reach', Number(acc.reach) || 0);
    put('ma_impr', impr);
    put('ma_freq', Number(acc.frequency) || 0);
    put('ma_cpm', Number(acc.cpm) || 0);
    put('ma_clicks', clicks);
    put('ma_ctr', Number(acc.inline_link_click_ctr) || 0);
    if (clicks) put('ma_cpc', spend / clicks);
    put('ma_leads', leads);
    if (leads) put('ma_cpl', spend / leads);
    put('ma_value', value);
    if (spend) put('ma_roas', value / spend);
    put('ma_results', results);
    if (results) put('ma_cpr', spend / results);
    put('ma_lpv', first(acc.actions, ['landing_page_view', 'omni_landing_page_view']));
    put('ma_atc', first(acc.actions, ATC));
    put('ma_checkout', first(acc.actions, CHECKOUT));
    put('ma_purchases', purchases);
    put('ma_post_eng', first(acc.actions, ['post_engagement']));
    put('ma_thruplays', first(acc.video_thruplay_watched_actions, ['video_view']));
    if (impr) put('ma_hook', (first(acc.actions, ['video_view']) / impr) * 100);
    const avg = first(acc.video_avg_time_watched_actions, ['video_view']);
    if (avg) put('ma_video_avg', avg);
  }

  // Placements (share of spend)
  const pl = await ask<{ spend?: string; publisher_platform?: string; platform_position?: string }>(
    { level: 'account', fields: 'spend', breakdowns: 'publisher_platform,platform_position' },
    'placements'
  );
  if (pl && pl.length) {
    const t = { fb_feed: 0, ig_feed: 0, stories: 0, reels: 0, other: 0 };
    let all = 0;
    for (const r of pl) {
      const s = Number(r.spend) || 0,
        pf = r.publisher_platform ?? '',
        pos = r.platform_position ?? '';
      all += s;
      if (/reels/.test(pos)) t.reels += s;
      else if (/stor/.test(pos)) t.stories += s;
      else if (pf === 'facebook' && pos === 'feed') t.fb_feed += s;
      else if (pf === 'instagram' && (pos === 'stream' || pos === 'feed')) t.ig_feed += s;
      else t.other += s;
    }
    if (all > 0) {
      put('ma_pl_fb_feed', pctOf(t.fb_feed, all));
      put('ma_pl_ig_feed', pctOf(t.ig_feed, all));
      put('ma_pl_stories', pctOf(t.stories, all));
      put('ma_pl_reels', pctOf(t.reels, all));
      put('ma_pl_other', pctOf(t.other, all));
    }
  }

  // Audience: age and gender, regions, platform (share of impressions)
  const demo: Record<string, unknown> = {};
  const ag = await ask<{ impressions?: string; age?: string; gender?: string }>({ level: 'account', fields: 'impressions', breakdowns: 'age,gender' }, 'audience');
  if (ag && ag.length) {
    const total = ag.reduce((a, r) => a + (Number(r.impressions) || 0), 0);
    const ages = new Map<string, [number, number]>();
    for (const r of ag) {
      const a = ages.get(r.age ?? '') ?? [0, 0];
      if (r.gender === 'male') a[0] += Number(r.impressions) || 0;
      else if (r.gender === 'female') a[1] += Number(r.impressions) || 0;
      ages.set(r.age ?? '', a);
    }
    demo['Age and gender'] = {
      ages: AGE_ORDER.filter((a) => ages.has(a)).map((a) => [a.replace('-', '–'), pctOf(ages.get(a)![0], total), pctOf(ages.get(a)![1], total)]),
    };
  }
  const share = (list: { impressions?: string }[] | null, keyOf: (r: never) => string, n: number) => {
    if (!list || !list.length) return null;
    const sum = list.reduce((a, r) => a + (Number(r.impressions) || 0), 0);
    return list
      .map((r) => [keyOf(r as never), pctOf(Number(r.impressions) || 0, sum)] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  };
  const reg = share(await ask<{ impressions?: string; region?: string }>({ level: 'account', fields: 'impressions', breakdowns: 'region' }, 'regions'), (r: { region?: string }) => r.region ?? 'Other', 5);
  if (reg) demo['Regions'] = reg;
  const pub = share(
    await ask<{ impressions?: string; publisher_platform?: string }>({ level: 'account', fields: 'impressions', breakdowns: 'publisher_platform' }, 'platforms'),
    (r: { publisher_platform?: string }) =>
      ({ instagram: 'Instagram', facebook: 'Facebook', messenger: 'Messenger', audience_network: 'Audience Network', threads: 'Threads' })[r.publisher_platform ?? ''] ??
      'Other',
    5
  );
  if (pub) demo['Platform'] = pub;
  if (Object.keys(demo).length) put('demo', null, demo);

  // Campaign table
  type Row = { campaign_id?: string; campaign_name?: string; ad_name?: string; objective?: string; spend?: string; reach?: string; impressions?: string; inline_link_click_ctr?: string; actions?: Action[]; action_values?: Action[] };
  const objective = (o?: string) =>
    ({ OUTCOME_LEADS: 'Leads', OUTCOME_SALES: 'Sales', OUTCOME_AWARENESS: 'Awareness', OUTCOME_TRAFFIC: 'Traffic', OUTCOME_ENGAGEMENT: 'Engagement', OUTCOME_APP_PROMOTION: 'App' })[o ?? ''] ??
    (o ? o.replace(/^OUTCOME_/, '').toLowerCase() : '');
  const camps = await ask<Row>({ level: 'campaign', fields: 'campaign_id,campaign_name,objective,spend,reach,inline_link_click_ctr,actions,action_values' }, 'campaigns');
  if (camps && camps.length) {
    put('table_campaigns', null, {
      cols: ['Spent', 'Reach', 'Results', 'Cost / result', 'CTR (link)', 'ROAS'],
      f: ['money', 'int', 'int', 'money', 'pct', 'x'],
      rows: camps
        .map((r) => {
          const spend = Number(r.spend) || 0,
            results = first(r.actions, LEADS) + first(r.actions, PURCHASES),
            value = first(r.action_values, PURCHASES);
          return [
            objective(r.objective),
            active.get(r.campaign_id ?? '') ? 'Active' : 'Paused',
            r.campaign_name ?? 'Campaign',
            [r2(spend), Number(r.reach) || 0, results, results ? r2(spend / results) : 0, r2(Number(r.inline_link_click_ctr) || 0), spend ? r2(value / spend) : 0],
          ];
        })
        .sort((a, b) => (b[3] as number[])[0] - (a[3] as number[])[0]),
    });
  }
  const adsRows = await ask<Row>({ level: 'ad', fields: 'ad_name,spend,impressions,inline_link_click_ctr,actions' }, 'ads');
  if (adsRows && adsRows.length) {
    put('table_ads', null, {
      cols: ['Spent', 'Impressions', 'Hook rate', 'CTR (link)', 'Results', 'Cost / result'],
      f: ['money', 'int', 'pct', 'pct', 'int', 'money'],
      rows: adsRows
        .map((r) => {
          const spend = Number(r.spend) || 0,
            impr = Number(r.impressions) || 0,
            results = first(r.actions, LEADS) + first(r.actions, PURCHASES);
          return [
            '',
            'Ad',
            r.ad_name ?? 'Ad',
            [r2(spend), impr, impr ? r2((first(r.actions, ['video_view']) / impr) * 100) : 0, r2(Number(r.inline_link_click_ctr) || 0), results, results ? r2(spend / results) : 0],
          ];
        })
        .sort((a, b) => (b[3] as number[])[0] - (a[3] as number[])[0])
        .slice(0, 25),
    });
  }
  return rows;
}

// ─── Entry point ────────────────────────────────────────────

export async function fetchPeriods(userTokenEnc: string, assets: MetaAssets, sel: MetaSelection, periods: Period[], warnings: string[]) {
  const rows: PeriodRow[] = [];
  const igPage = assets.pages.find((p) => p.ig?.id === sel.igId);
  const igToken = igPage?.tokenEnc ? decryptSecret(igPage.tokenEnc) : null;
  if (sel.igId && igToken) {
    for (const p of periods) rows.push(...(await igPeriod(sel.igId, igToken, p)));
    const aud = await igAudience(sel.igId, igToken).catch((err) => {
      if (err instanceof MetaError && err.expired) throw err;
      return null;
    });
    if (aud) rows.push(aud);
  }
  const userToken = decryptSecret(userTokenEnc);
  if (sel.adAccountId && userToken) {
    const statuses = await graphPages<{ id: string; effective_status?: string }>(`/${sel.adAccountId}/campaigns`, { fields: 'id,effective_status', limit: 500 }, userToken).catch(
      () => []
    );
    const active = new Map(statuses.map((c) => [c.id, c.effective_status === 'ACTIVE']));
    for (const p of periods) rows.push(...(await adsPeriod(sel.adAccountId, userToken, p, active, warnings)));
  }
  return rows;
}
