import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ConnectionError, type RefreshFields } from './oauth2.js';

/**
 * Google Ads through the customer's own Google login (Google Ads API). Read
 * only: daily spend, clicks, conversions and value, campaigns and the monthly
 * Google Ads figures. Every request also carries EG Eloma's developer token.
 */

export interface AdAccount {
  id: string;
  name: string;
  currency: string | null;
  /** Manager account to send as login-customer-id when the account is reached through one. */
  loginId: string | null;
}
export interface GoogleAdsAssets extends RefreshFields {
  accounts: AdAccount[];
}
export interface GoogleAdsSelection {
  customerId?: string | null;
}

export function publicAssets(a: unknown) {
  const x = (a ?? {}) as Partial<GoogleAdsAssets>;
  return { choices: (x.accounts ?? []).map((c) => ({ id: c.id, name: `${c.name} (${fmtId(c.id)}${c.currency ? `, ${c.currency}` : ''})`, url: null })) };
}
const fmtId = (id: string) => id.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');

const base = () => `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}`;

function headers(token: string, loginId?: string | null) {
  const login = loginId ?? env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, '');
  return {
    Authorization: `Bearer ${token}`,
    'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
    'Content-Type': 'application/json',
    ...(login ? { 'login-customer-id': login } : {}),
  };
}

async function asError(res: Response) {
  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; details?: { errors?: { message?: string; errorCode?: Record<string, string> }[] }[] } };
  const first = j.error?.details?.[0]?.errors?.[0];
  const code = first?.errorCode ? Object.values(first.errorCode)[0] : '';
  const msg =
    code === 'DEVELOPER_TOKEN_NOT_APPROVED'
      ? 'The EG Eloma Google Ads developer token only works with test accounts until Google approves it.'
      : code === 'USER_PERMISSION_DENIED'
        ? 'This Google login cannot read that Google Ads account. Sign in with a user of the account (or its manager account).'
        : (first?.message ?? j.error?.message ?? `Google Ads request failed (${res.status})`);
  return new ConnectionError(msg, res.status === 401, res.status);
}

type Row = Record<string, Record<string, unknown>>;

/** Run a GAQL query on one account, all pages. */
export async function search(token: string, customerId: string, query: string, loginId?: string | null): Promise<Row[]> {
  const out: Row[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 50; i++) {
    const res = await fetch(`${base()}/customers/${customerId}/googleAds:search`, {
      method: 'POST',
      headers: headers(token, loginId),
      body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw await asError(res);
    const j = (await res.json()) as { results?: Row[]; nextPageToken?: string };
    out.push(...(j.results ?? []));
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out;
}

/** Every Google Ads account this login can read, including client accounts under a manager it can read. */
export async function listAccounts(token: string): Promise<AdAccount[]> {
  const res = await fetch(`${base()}/customers:listAccessibleCustomers`, { headers: headers(token, null), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw await asError(res);
  const ids = (((await res.json()) as { resourceNames?: string[] }).resourceNames ?? []).map((r) => r.split('/')[1]).filter(Boolean);
  const out = new Map<string, AdAccount>();
  for (const id of ids.slice(0, 30)) {
    try {
      const rows = await search(token, id, 'SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.level <= 1', id);
      for (const r of rows) {
        const c = r.customerClient as { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean; level?: string };
        if (!c?.id || c.manager) continue;
        const own = String(c.id) === id;
        if (!out.has(String(c.id)) || own) out.set(String(c.id), { id: String(c.id), name: c.descriptiveName || `Account ${fmtId(String(c.id))}`, currency: c.currencyCode ?? null, loginId: own ? null : id });
      }
    } catch (err) {
      logger.warn({ err, id }, 'Google Ads: could not read an account');
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: unknown) => Number(v) || 0;
const money = (micros: unknown) => Math.round(num(micros) / 10_000) / 100;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface AdsDay {
  spend: number;
  clicks: number;
  leads: number;
  revenue: number;
  impressions: number;
}

export async function daily(token: string, acc: AdAccount, since: Date, until: Date) {
  const rows = await search(
    token,
    acc.id,
    `SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${day(since)}' AND '${day(until)}'`,
    acc.loginId
  );
  const out = new Map<string, AdsDay>();
  for (const r of rows) {
    const m = r.metrics ?? {};
    out.set(String(r.segments?.date), { spend: money(m.costMicros), clicks: num(m.clicks), leads: r2(num(m.conversions)), revenue: r2(num(m.conversionsValue)), impressions: num(m.impressions) });
  }
  return out;
}

export interface CampaignDay {
  campaignId: string;
  campaignName: string;
  active: boolean;
  date: string;
  spend: number;
  leads: number;
  revenue: number;
}

export async function campaignDays(token: string, acc: AdAccount, since: Date, until: Date): Promise<CampaignDay[]> {
  const rows = await search(
    token,
    acc.id,
    `SELECT campaign.id, campaign.name, campaign.status, segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${day(since)}' AND '${day(until)}'`,
    acc.loginId
  );
  return rows.map((r) => ({
    campaignId: String(r.campaign?.id),
    campaignName: String(r.campaign?.name ?? 'Campaign'),
    active: r.campaign?.status === 'ENABLED',
    date: String(r.segments?.date),
    spend: money(r.metrics?.costMicros),
    leads: r2(num(r.metrics?.conversions)),
    revenue: r2(num(r.metrics?.conversionsValue)),
  }));
}

const CHANNEL: Record<string, string> = { SEARCH: 'ga_sp_search', PERFORMANCE_MAX: 'ga_sp_pmax', DISPLAY: 'ga_sp_display', VIDEO: 'ga_sp_video' };
const DEVICE: Record<string, string> = { MOBILE: 'ga_dev_mobile', DESKTOP: 'ga_dev_desktop', TABLET: 'ga_dev_tablet' };
const CONV: Record<string, string> = { PHONE_CALL_LEAD: 'ga_calls', SUBMIT_LEAD_FORM: 'ga_forms', CONTACT: 'ga_forms', PURCHASE: 'ga_purchases', GET_DIRECTIONS: 'ga_directions' };
const CHANNEL_NAME: Record<string, string> = { SEARCH: 'Search', PERFORMANCE_MAX: 'Performance Max', DISPLAY: 'Display', VIDEO: 'Video', SHOPPING: 'Shopping', DEMAND_GEN: 'Demand Gen' };

/** The monthly Google Ads figures for one period, plus its campaign table. */
export async function periodFigures(token: string, acc: AdAccount, start: Date, end: Date, current: boolean, warnings: string[]) {
  const where = `WHERE segments.date BETWEEN '${day(start)}' AND '${day(end)}'`;
  const v: Record<string, number> = {};
  let table: unknown = null;
  const [t] = await search(
    token,
    acc.id,
    `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share, metrics.search_top_impression_share FROM customer ${where}`,
    acc.loginId
  );
  const m = t?.metrics ?? {};
  const spend = money(m.costMicros),
    clicks = num(m.clicks),
    impr = num(m.impressions),
    conv = r2(num(m.conversions)),
    value = r2(num(m.conversionsValue));
  Object.assign(v, { ga_spend: spend, ga_impr: impr, ga_clicks: clicks, ga_conv: conv, ga_value: value });
  if (impr) v.ga_ctr = r1((clicks / impr) * 100);
  if (clicks) v.ga_cpc = r2(spend / clicks);
  if (clicks) v.ga_conv_rate = r1((conv / clicks) * 100);
  if (conv) v.ga_cpa = r2(spend / conv);
  if (spend) v.ga_roas = r2(value / spend);
  const pct = (x: unknown) => (x == null ? null : r1(num(x) * 100));
  for (const [id, x] of [
    ['ga_is', m.searchImpressionShare],
    ['ga_lost_budget', m.searchBudgetLostImpressionShare],
    ['ga_lost_rank', m.searchRankLostImpressionShare],
    ['ga_top_is', m.searchTopImpressionShare],
  ] as const) {
    const p = pct(x);
    if (p != null) v[id] = p;
  }
  const part = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      warnings.push(`Google Ads ${label} could not be read: ${(err as Error).message}`);
    }
  };
  await part('spend by campaign type', async () => {
    for (const id of Object.values(CHANNEL)) v[id] = 0;
    for (const r of await search(token, acc.id, `SELECT campaign.advertising_channel_type, metrics.cost_micros FROM campaign ${where}`, acc.loginId)) {
      const id = CHANNEL[String(r.campaign?.advertisingChannelType)];
      if (id) v[id] = r2(v[id] + money(r.metrics?.costMicros));
    }
  });
  await part('devices', async () => {
    const rows = await search(token, acc.id, `SELECT segments.device, metrics.clicks FROM customer ${where}`, acc.loginId);
    const total = rows.reduce((a, r) => a + num(r.metrics?.clicks), 0);
    for (const id of Object.values(DEVICE)) v[id] = 0;
    for (const r of rows) {
      const id = DEVICE[String(r.segments?.device)];
      if (id && total) v[id] = r1(v[id] + (num(r.metrics?.clicks) / total) * 100);
    }
  });
  await part('conversions by type', async () => {
    for (const id of new Set(Object.values(CONV))) v[id] = 0;
    for (const r of await search(token, acc.id, `SELECT segments.conversion_action_category, metrics.conversions FROM customer ${where}`, acc.loginId)) {
      const id = CONV[String(r.segments?.conversionActionCategory)];
      if (id) v[id] = r2(v[id] + num(r.metrics?.conversions));
    }
  });
  await part('campaigns', async () => {
    const rows = await search(
      token,
      acc.id,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM campaign ${where}`,
      acc.loginId
    );
    if (!rows.length) return;
    table = {
      cols: ['Spent', 'Clicks', 'CTR', 'Conversions', 'Cost / conversion', 'ROAS'],
      f: ['money', 'int', 'pct', 'dec', 'money', 'x'],
      rows: rows
        .map((r) => {
          const s = money(r.metrics?.costMicros),
            c = num(r.metrics?.clicks),
            i = num(r.metrics?.impressions),
            cv = r2(num(r.metrics?.conversions)),
            val = num(r.metrics?.conversionsValue);
          return [
            CHANNEL_NAME[String(r.campaign?.advertisingChannelType)] ?? 'Campaign',
            r.campaign?.status === 'ENABLED' ? 'Active' : 'Paused',
            String(r.campaign?.name ?? 'Campaign'),
            [s, c, i ? r1((c / i) * 100) : 0, cv, cv ? r2(s / cv) : 0, s ? r2(val / s) : 0],
          ];
        })
        .sort((a, b) => (b[3] as number[])[0] - (a[3] as number[])[0]),
    };
  });
  if (current) {
    await part('optimisation score', async () => {
      const [o] = await search(token, acc.id, 'SELECT customer.optimization_score FROM customer', acc.loginId);
      const s = o?.customer?.optimizationScore;
      if (s != null) v.ga_opt_score = r1(num(s) * 100);
    });
  }
  return { values: v, table };
}
