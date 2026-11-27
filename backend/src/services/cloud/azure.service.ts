/**
 * Admin → Cloud: live figures read from Azure for every client on EG Eloma's
 * subscription(s). Nothing is entered by hand and nothing is written to Azure —
 * the app registration only needs read roles.
 *
 * A client is a resource group, or several resource groups sharing the same
 * value in the AZURE_MONITOR_CLIENT_TAG tag. Built-in groups (NetworkWatcherRG,
 * DefaultResourceGroup-*, AKS node groups …) count as shared cost.
 *
 * Sources: Cost Management (spend, cost by service, cost per resource),
 * Consumption budgets, Resource Graph (resources, Defender recommendations,
 * vulnerabilities, patch assessments), Azure Monitor metrics (usage,
 * availability, response time), Azure Advisor, Defender for Cloud (Secure Score,
 * alerts), Azure Backup jobs, the Activity Log (Resource Health incidents and
 * the changes the team made) and Microsoft Graph (MFA registration).
 */
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// Azure REST and Resource Graph answers are loosely typed JSON; fields are read defensively.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AzJson = any;

const ARM = 'https://management.azure.com';
const GRAPH = 'https://graph.microsoft.com';
const MONTHS_BACK = 6; // cost history; metrics and the activity log keep ~90 days
const CACHE_MS = 15 * 60_000;

// ───────────────────────── types (shape the report page reads) ─────────────────────────
type MonthFigures = {
  uptime?: number;
  resp?: number;
  cost?: number;
  budget?: number;
  patch?: number;
  bjobs?: number;
  bfail?: number;
  ahigh?: number;
  amed?: number;
  vuln?: number;
  svc?: Record<string, number>;
};
type Resource = {
  id: string;
  name: string;
  type: string;
  size: string;
  cpu_avg: number | null;
  cpu_peak: number | null;
  memory: number | null;
  disk: number | null;
  monthly_cost: number | null;
};
type Recommendation = {
  id: string;
  title: string;
  solution: string;
  cat: string;
  imp: 'High' | 'Medium' | 'Low';
  res: string;
  save: number;
  source: 'Azure Advisor' | 'Defender for Cloud';
};
type Incident = { id: string; date: string; title: string; dur: number; res: string; cause: string; prov: boolean; ongoing: boolean };
type WorkItem = { id: string; date: string; cat: string; title: string; detail: string; owner: string };
export type CloudClient = {
  id: string;
  name: string;
  rgs: string[];
  subscriptions: string[];
  months: Record<string, MonthFigures>;
  res: Resource[];
  recs: Recommendation[];
  inc: Incident[];
  work: WorkItem[];
};
export type CloudReport = {
  configured: boolean;
  missing: string[];
  fetchedAt: string | null;
  currency: string;
  months: string[];
  sub: { name: string; ids: string[]; months: Record<string, { cost?: number; budget?: number; score?: number; mfa?: number }> };
  clients: CloudClient[];
  errors: { area: string; message: string }[];
};

// ───────────────────────── helpers ─────────────────────────
class AzureHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const tokens = new Map<string, { value: string; exp: number }>();
async function token(scope: string): Promise<string> {
  const hit = tokens.get(scope);
  if (hit && hit.exp > Date.now() + 60_000) return hit.value;
  const res = await fetch(`https://login.microsoftonline.com/${env.AZURE_MONITOR_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.AZURE_MONITOR_CLIENT_ID ?? '',
      client_secret: env.AZURE_MONITOR_CLIENT_SECRET ?? '',
      scope,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) {
    throw new AzureHttpError(res.status, `Sign-in to Azure failed: ${(j.error_description ?? res.statusText).split(/\r?\n| Trace ID:/)[0]}`);
  }
  tokens.set(scope, { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T = AzJson>(url: string, init: { method?: string; body?: unknown; graph?: boolean } = {}): Promise<T> {
  const full = url.startsWith('http') ? url : ARM + url;
  const auth = await token(init.graph ? `${GRAPH}/.default` : `${ARM}/.default`);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(full, {
      method: init.method ?? 'GET',
      headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 429 && attempt < 2) {
      const ra =
        Number(res.headers.get('retry-after')) ||
        Number(res.headers.get('x-ms-ratelimit-microsoft.costmanagement-entity-retry-after')) ||
        10;
      await sleep(Math.min(ra, 30) * 1000);
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = JSON.parse(text);
        msg = j.error?.message ?? j.message ?? msg;
      } catch {
        /* not json */
      }
      throw new AzureHttpError(res.status, String(msg).split('\n')[0].slice(0, 300));
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}

/** Follows nextLink pages (ARM and Graph). */
async function listAll<T = AzJson>(url: string, opts: { graph?: boolean; maxPages?: number } = {}): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  for (let page = 0; next && page < (opts.maxPages ?? 50); page++) {
    const j: AzJson = await call(next, { graph: opts.graph });
    out.push(...((j.value ?? []) as T[]));
    next = j.nextLink ?? j['@odata.nextLink'] ?? null;
  }
  return out;
}

async function graphQuery<T = AzJson>(subs: string[], query: string, max = 5000): Promise<T[]> {
  const out: T[] = [];
  let skipToken: string | undefined;
  do {
    const j: AzJson = await call('/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01', {
      method: 'POST',
      body: { subscriptions: subs, query, options: { $top: 1000, ...(skipToken ? { $skipToken: skipToken } : {}) } },
    });
    out.push(...((j.data ?? []) as T[]));
    skipToken = j.$skipToken;
  } while (skipToken && out.length < max);
  return out;
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}

const lc = (s: unknown) => String(s ?? '').toLowerCase();
const rgOf = (id: unknown) => (lc(id).match(/\/resourcegroups\/([^/]+)/) ?? [])[1] ?? '';
const subOf = (id: unknown) => (lc(id).match(/\/subscriptions\/([^/]+)/) ?? [])[1] ?? '';
const nameOf = (id: unknown) => String(id ?? '').split('/').filter(Boolean).pop() ?? '';
const monthKey = (d: Date | string) => new Date(d).toISOString().slice(0, 7);
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const slug = (s: string) => lc(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';

const SYSTEM_RG = /^(networkwatcherrg|defaultresourcegroup-|cloud-shell-storage-|mc_|azurebackuprg|resourcemoverrg|loganalyticsdefaultresources|dashboards$|azure-?advisor|managed-)/i;

/** What each area needs, shown when Azure refuses. */
const NEEDS: Record<string, string> = {
  Subscriptions: 'Reader on the subscription',
  'Resource groups': 'Reader on the subscription',
  Cost: 'Cost Management Reader on the subscription',
  Budgets: 'Cost Management Reader on the subscription',
  Resources: 'Reader on the subscription',
  Usage: 'Reader (or Monitoring Reader) on the subscription',
  Advisor: 'Reader on the subscription',
  'Secure Score': 'Security Reader on the subscription, with Defender for Cloud on',
  'Security alerts': 'Security Reader on the subscription',
  'Security recommendations': 'Security Reader on the subscription',
  Vulnerabilities: 'Security Reader, with a Defender vulnerability scanner on the servers',
  Patching: 'Reader, with periodic assessment on in Azure Update Manager',
  Backups: 'Backup Reader on the Recovery Services vaults',
  'Activity log': 'Reader (or Monitoring Reader) on the subscription',
  MFA: 'Microsoft Graph application permission AuditLog.Read.All, admin-consented (Entra ID P1 or P2)',
};

function errText(area: string, e: unknown): string {
  if (e instanceof AzureHttpError && (e.status === 401 || e.status === 403)) return `No access. Needs ${NEEDS[area] ?? 'Reader'}.`;
  return e instanceof Error ? e.message : String(e);
}

// ───────────────────────── config ─────────────────────────
function missingSettings(): string[] {
  const m: string[] = [];
  if (!env.AZURE_MONITOR_TENANT_ID) m.push('AZURE_MONITOR_TENANT_ID');
  if (!env.AZURE_MONITOR_CLIENT_ID) m.push('AZURE_MONITOR_CLIENT_ID');
  if (!env.AZURE_MONITOR_CLIENT_SECRET) m.push('AZURE_MONITOR_CLIENT_SECRET');
  if (!env.AZURE_MONITOR_SUBSCRIPTION_IDS.length) m.push('AZURE_MONITOR_SUBSCRIPTION_IDS');
  return m;
}

// ───────────────────────── metrics ─────────────────────────
type Series = { avg: Map<string, number>; max: Map<string, number>; total: Map<string, number> }; // day (YYYY-MM-DD) → value

async function metrics(resourceId: string, names: string[], days: number): Promise<Record<string, Series>> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const one = async (list: string[]) => {
    const q = new URLSearchParams({
      'api-version': '2023-10-01',
      metricnames: list.join(','),
      timespan: `${start.toISOString()}/${end.toISOString()}`,
      interval: 'P1D',
      aggregation: 'Average,Maximum,Total',
    });
    const j: AzJson = await call(`${resourceId}/providers/Microsoft.Insights/metrics?${q}`);
    const out: Record<string, Series> = {};
    for (const m of j.value ?? []) {
      const s: Series = { avg: new Map(), max: new Map(), total: new Map() };
      for (const ts of m.timeseries ?? []) {
        for (const p of ts.data ?? []) {
          const d = String(p.timeStamp).slice(0, 10);
          if (p.average != null) s.avg.set(d, p.average);
          if (p.maximum != null) s.max.set(d, p.maximum);
          if (p.total != null) s.total.set(d, (s.total.get(d) ?? 0) + p.total);
        }
      }
      out[m.name?.value ?? ''] = s;
    }
    return out;
  };
  try {
    return await one(names);
  } catch (e) {
    // One unsupported metric fails the whole call: read them one by one instead.
    if (!(e instanceof AzureHttpError) || e.status !== 400 || names.length === 1) throw e;
    const parts = await Promise.all(names.map((n) => one([n]).catch(() => ({}))));
    return Object.assign({}, ...parts);
  }
}

const lastDays = (m: Map<string, number>, days: number) => {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return [...m.entries()].filter(([d]) => d >= from).map(([, v]) => v);
};
const byMonth = (m: Map<string, number>) => {
  const g = new Map<string, number[]>();
  for (const [d, v] of m) g.set(d.slice(0, 7), [...(g.get(d.slice(0, 7)) ?? []), v]);
  return g;
};

/** Usage metrics per resource type: [cpu, memory, disk], and how to name it. */
const USAGE: Record<string, { label: string; cpu?: string; mem?: string; disk?: string; extra?: string[] }> = {
  'microsoft.compute/virtualmachines': { label: 'Virtual machine', cpu: 'Percentage CPU', mem: 'Available Memory Percentage', extra: ['VmAvailabilityMetric'] },
  'microsoft.compute/virtualmachinescalesets': { label: 'Scale set', cpu: 'Percentage CPU', mem: 'Available Memory Percentage' },
  'microsoft.web/serverfarms': { label: 'App Service plan', cpu: 'CpuPercentage', mem: 'MemoryPercentage' },
  'microsoft.sql/servers/databases': { label: 'SQL database', cpu: 'cpu_percent', mem: 'sql_instance_memory_percent', disk: 'storage_percent' },
  'microsoft.sql/servers/elasticpools': { label: 'SQL elastic pool', cpu: 'cpu_percent', disk: 'storage_percent' },
  'microsoft.dbforpostgresql/flexibleservers': { label: 'PostgreSQL server', cpu: 'cpu_percent', mem: 'memory_percent', disk: 'storage_percent' },
  'microsoft.dbformysql/flexibleservers': { label: 'MySQL server', cpu: 'cpu_percent', mem: 'memory_percent', disk: 'storage_percent' },
  'microsoft.cache/redis': { label: 'Redis cache', cpu: 'percentProcessorTime', mem: 'usedmemorypercentage' },
  'microsoft.containerservice/managedclusters': {
    label: 'Kubernetes cluster',
    cpu: 'node_cpu_usage_percentage',
    mem: 'node_memory_working_set_percentage',
    disk: 'node_disk_usage_percentage',
  },
};
/** Services whose availability and response time are measured. */
const SERVICE_TYPES = ['microsoft.web/sites', 'microsoft.insights/components'];

// ───────────────────────── the read ─────────────────────────
let cache: { at: number; data: CloudReport } | null = null;
let inflight: Promise<CloudReport> | null = null;

export async function getCloudReport(refresh = false): Promise<CloudReport> {
  const missing = missingSettings();
  if (missing.length) {
    return { configured: false, missing, fetchedAt: null, currency: 'AUD', months: [], sub: { name: '', ids: [], months: {} }, clients: [], errors: [] };
  }
  if (!refresh && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  if (!inflight) {
    inflight = build()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

async function build(): Promise<CloudReport> {
  const subs = env.AZURE_MONITOR_SUBSCRIPTION_IDS.map(lc);
  const errors: CloudReport['errors'] = [];
  const now = new Date();
  const months: string[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) months.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  const curMonth = months[months.length - 1];
  const fail = (area: string, e: unknown) => {
    const message = errText(area, e);
    if (!errors.some((x) => x.area === area && x.message === message)) errors.push({ area, message });
    logger.warn({ area, err: e instanceof Error ? e.message : e }, 'cloud: Azure read failed');
  };
  const safe = async <T>(area: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      fail(area, e);
      return fallback;
    }
  };

  // Sign-in problems make every call fail — say so once, clearly.
  try {
    await token(`${ARM}/.default`);
  } catch (e) {
    return {
      configured: true,
      missing: [],
      fetchedAt: new Date().toISOString(),
      currency: 'AUD',
      months,
      sub: { name: '', ids: subs, months: {} },
      clients: [],
      errors: [{ area: 'Sign-in', message: e instanceof Error ? e.message : String(e) }],
    };
  }

  // ── subscriptions and resource groups → clients ──
  const subNames = await Promise.all(
    subs.map((s) => safe('Subscriptions', async () => (await call(`/subscriptions/${s}?api-version=2022-12-01`)).displayName as string, s))
  );
  const rgClient = new Map<string, string>(); // "sub/rg" → client id
  const clients = new Map<string, CloudClient>();
  const blank = (): MonthFigures => ({});
  const ensure = (id: string, name: string): CloudClient => {
    let c = clients.get(id);
    if (!c) {
      c = { id, name, rgs: [], subscriptions: [], months: Object.fromEntries(months.map((m) => [m, blank()])), res: [], recs: [], inc: [], work: [] };
      clients.set(id, c);
    }
    return c;
  };
  for (const s of subs) {
    const rgs = await safe('Resource groups', () => listAll<AzJson>(`/subscriptions/${s}/resourcegroups?api-version=2021-04-01`), []);
    for (const rg of rgs) {
      if (SYSTEM_RG.test(rg.name)) continue;
      const tagKey = Object.keys(rg.tags ?? {}).find((k) => lc(k) === lc(env.AZURE_MONITOR_CLIENT_TAG));
      const label = (tagKey && String(rg.tags[tagKey]).trim()) || rg.name;
      const c = ensure(slug(label), label);
      c.rgs.push(rg.name);
      if (!c.subscriptions.includes(s)) c.subscriptions.push(s);
      rgClient.set(`${s}/${lc(rg.name)}`, c.id);
    }
  }
  const clientOf = (id: unknown, sub?: string, rg?: string): CloudClient | undefined => {
    const key = `${sub ?? subOf(id)}/${rg ?? rgOf(id)}`;
    const cid = rgClient.get(key);
    return cid ? clients.get(cid) : undefined;
  };
  const subMonths: CloudReport['sub']['months'] = Object.fromEntries(months.map((m) => [m, {}]));
  let currency = env.DEFAULT_CURRENCY;

  // ── cost: monthly by resource group and service, then last 30 days by resource ──
  const costByResource = new Map<string, number>();
  const costQuery = async (s: string, body: (field: string) => unknown) => {
    const url = `/subscriptions/${s}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`;
    let field = 'Cost';
    let j: AzJson;
    try {
      j = await call(url, { method: 'POST', body: body(field) });
    } catch (e) {
      if (!(e instanceof AzureHttpError) || e.status !== 400) throw e;
      field = 'PreTaxCost'; // pay-as-you-go subscriptions name the column differently
      j = await call(url, { method: 'POST', body: body(field) });
    }
    const rows: AzJson[][] = [...(j.properties?.rows ?? [])];
    const cols: string[] = (j.properties?.columns ?? []).map((c: AzJson) => c.name);
    let next = j.properties?.nextLink;
    for (let page = 0; next && page < 20; page++) {
      const n: AzJson = await call(next, { method: 'POST', body: body(field) });
      rows.push(...(n.properties?.rows ?? []));
      next = n.properties?.nextLink;
    }
    return { rows, idx: (n: string) => cols.findIndex((c) => lc(c) === lc(n)), field };
  };
  for (const s of subs) {
    await safe(
      'Cost',
      async () => {
        const from = `${months[0]}-01T00:00:00Z`;
        const r = await costQuery(s, (field) => ({
          type: 'ActualCost',
          timeframe: 'Custom',
          timePeriod: { from, to: now.toISOString() },
          dataset: {
            granularity: 'Monthly',
            aggregation: { totalCost: { name: field, function: 'Sum' } },
            grouping: [
              { type: 'Dimension', name: 'ResourceGroupName' },
              { type: 'Dimension', name: 'ServiceName' },
            ],
          },
        }));
        const iCost = r.idx(r.field), iMonth = r.idx('BillingMonth'), iRg = r.idx('ResourceGroupName'), iSvc = r.idx('ServiceName'), iCur = r.idx('Currency');
        for (const row of r.rows) {
          const v = +row[iCost] || 0;
          const m = String(row[iMonth]).slice(0, 7);
          if (!subMonths[m]) continue;
          if (iCur >= 0 && row[iCur]) currency = String(row[iCur]);
          subMonths[m].cost = round((subMonths[m].cost ?? 0) + v);
          const c = clientOf(null, s, lc(row[iRg]));
          if (!c) continue;
          const f = c.months[m];
          f.cost = round((f.cost ?? 0) + v);
          const svc = String(row[iSvc] || 'Other');
          f.svc = f.svc ?? {};
          f.svc[svc] = round((f.svc[svc] ?? 0) + v);
        }
        const r2 = await costQuery(s, (field) => ({
          type: 'ActualCost',
          timeframe: 'Custom',
          timePeriod: { from: new Date(now.getTime() - 30 * 86_400_000).toISOString(), to: now.toISOString() },
          dataset: { granularity: 'None', aggregation: { totalCost: { name: field, function: 'Sum' } }, grouping: [{ type: 'Dimension', name: 'ResourceId' }] },
        }));
        const jc = r2.idx(r2.field), jr = r2.idx('ResourceId');
        for (const row of r2.rows) costByResource.set(lc(row[jr]), (costByResource.get(lc(row[jr])) ?? 0) + (+row[jc] || 0));
      },
      undefined
    );
  }

  // ── budgets (subscription and each client resource group) ──
  const budgetMonthly = (b: AzJson): number | null => {
    const a = +b?.properties?.amount;
    if (!a) return null;
    const g = lc(b.properties.timeGrain);
    return g.includes('annual') ? a / 12 : g.includes('quarter') ? a / 3 : a;
  };
  const applyBudget = (target: Record<string, { budget?: number }>, list: AzJson[]) => {
    for (const b of list) {
      const per = budgetMonthly(b);
      if (per == null) continue;
      const startM = String(b.properties?.timePeriod?.startDate ?? '').slice(0, 7);
      const endM = String(b.properties?.timePeriod?.endDate ?? '9999').slice(0, 7);
      for (const m of months) if ((!startM || m >= startM) && m <= endM) target[m].budget = round((target[m].budget ?? 0) + per);
    }
  };
  await Promise.all(
    subs.map((s) =>
      safe(
        'Budgets',
        async () => {
          const all = await listAll<AzJson>(`/subscriptions/${s}/providers/Microsoft.Consumption/budgets?api-version=2023-05-01`);
          applyBudget(subMonths, all.filter((b) => !rgOf(b.id)));
        },
        undefined
      )
    )
  );
  const rgList = [...rgClient.keys()];
  await pool(rgList, 6, (key) =>
    safe(
      'Budgets',
      async () => {
        const [s, rg] = key.split('/');
        const list = await listAll<AzJson>(`/subscriptions/${s}/resourceGroups/${rg}/providers/Microsoft.Consumption/budgets?api-version=2023-05-01`);
        const c = clientOf(null, s, rg);
        if (c) applyBudget(c.months, list.filter((b) => rgOf(b.id) === rg));
      },
      undefined
    )
  );

  // ── resources, usage, availability and response time ──
  const types = [...Object.keys(USAGE), ...SERVICE_TYPES, 'microsoft.recoveryservices/vaults'];
  const resources = await safe(
    'Resources',
    () =>
      graphQuery<AzJson>(
        subs,
        `Resources | where type in~ (${types.map((t) => `'${t}'`).join(',')}) | where not(type =~ 'microsoft.sql/servers/databases' and name =~ 'master') | project id, name, type=tolower(type), resourceGroup=tolower(resourceGroup), subscriptionId=tolower(subscriptionId), sku, vmSize=tostring(properties.hardwareProfile.vmSize)`
      ),
    []
  );
  const vmNames = new Map<string, CloudClient>(); // backup jobs name the VM, not its id
  type Avail = { uptime: Map<string, number[]>; resp: Map<string, number[]> };
  const avail = new Map<string, Avail>(); // client id → month → values
  const addAvail = (c: CloudClient, kind: keyof Avail, m: string, v: number) => {
    const a = avail.get(c.id) ?? { uptime: new Map(), resp: new Map() };
    a[kind].set(m, [...(a[kind].get(m) ?? []), v]);
    avail.set(c.id, a);
  };
  await pool(
    resources.filter((r) => r.type !== 'microsoft.recoveryservices/vaults'),
    8,
    (r) =>
      safe(
        'Usage',
        async () => {
          const c = clientOf(r.id, r.subscriptionId, r.resourceGroup);
          if (!c) return;
          const u = USAGE[r.type];
          if (u) {
            if (r.type === 'microsoft.compute/virtualmachines') vmNames.set(lc(r.name), c);
            const names = [u.cpu, u.mem, u.disk, ...(u.extra ?? [])].filter(Boolean) as string[];
            const M = await metrics(r.id, names, 90);
            const cpuA = u.cpu ? lastDays(M[u.cpu]?.avg ?? new Map(), 30) : [];
            const cpuP = u.cpu ? lastDays(M[u.cpu]?.max ?? new Map(), 30) : [];
            const mem = u.mem ? lastDays(M[u.mem]?.avg ?? new Map(), 30) : [];
            const disk = u.disk ? lastDays(M[u.disk]?.avg ?? new Map(), 30) : [];
            const memAvg = avg(mem);
            const cost = costByResource.get(lc(r.id));
            c.res.push({
              id: r.id,
              name: r.name,
              type: u.label,
              size: r.vmSize || r.sku?.name || r.sku?.tier || '',
              cpu_avg: cpuA.length ? round(avg(cpuA)!, 1) : null,
              cpu_peak: cpuP.length ? round(Math.max(...cpuP), 1) : null,
              // VMs report free memory: turn it into memory in use.
              memory: memAvg == null ? null : round(u.mem === 'Available Memory Percentage' ? 100 - memAvg : memAvg, 1),
              disk: disk.length ? round(avg(disk)!, 1) : null,
              monthly_cost: cost != null ? round(cost) : null,
            });
            const va = M.VmAvailabilityMetric?.avg;
            if (va) for (const [m, vals] of byMonth(va)) if (c.months[m]) addAvail(c, 'uptime', m, avg(vals)! * 100);
            return;
          }
          if (r.type === 'microsoft.web/sites') {
            const M = await metrics(r.id, ['Requests', 'Http5xx', 'HttpResponseTime'], 90);
            const req = byMonth(M.Requests?.total ?? new Map());
            const err = byMonth(M.Http5xx?.total ?? new Map());
            const rt = byMonth(M.HttpResponseTime?.avg ?? new Map());
            for (const [m, vals] of req) {
              const n = vals.reduce((a, b) => a + b, 0);
              if (!c.months[m] || !n) continue;
              const e = (err.get(m) ?? []).reduce((a, b) => a + b, 0);
              addAvail(c, 'uptime', m, (1 - e / n) * 100);
            }
            for (const [m, vals] of rt) if (c.months[m] && vals.length) addAvail(c, 'resp', m, avg(vals)! * 1000);
            return;
          }
          if (r.type === 'microsoft.insights/components') {
            const M = await metrics(r.id, ['availabilityResults/availabilityPercentage', 'requests/duration'], 90);
            for (const [m, vals] of byMonth(M['availabilityResults/availabilityPercentage']?.avg ?? new Map()))
              if (c.months[m] && vals.length) addAvail(c, 'uptime', m, avg(vals)!);
            for (const [m, vals] of byMonth(M['requests/duration']?.avg ?? new Map())) if (c.months[m] && vals.length) addAvail(c, 'resp', m, avg(vals)!);
          }
        },
        undefined
      )
  );
  for (const [cid, a] of avail) {
    const c = clients.get(cid)!;
    for (const [m, v] of a.uptime) c.months[m].uptime = round(Math.min(100, avg(v)!), 3);
    for (const [m, v] of a.resp) c.months[m].resp = Math.round(avg(v)!);
  }

  // ── Azure Advisor (cost, reliability, performance, operational excellence) ──
  const ADV: Record<string, string> = {
    cost: 'Cost',
    highavailability: 'Reliability',
    performance: 'Performance',
    operationalexcellence: 'Operational excellence',
  };
  for (const s of subs) {
    const recs = await safe('Advisor', () => listAll<AzJson>(`/subscriptions/${s}/providers/Microsoft.Advisor/recommendations?api-version=2023-01-01`), []);
    for (const r of recs) {
      const p = r.properties ?? {};
      const cat = ADV[lc(p.category)];
      if (!cat) continue; // security comes from Defender for Cloud below
      const target = p.resourceMetadata?.resourceId ?? r.id;
      const c = clientOf(target);
      if (!c) continue;
      const x = p.extendedProperties ?? {};
      const save = x.annualSavingsAmount ? +x.annualSavingsAmount / 12 : +x.savingsAmount || 0;
      c.recs.push({
        id: r.name,
        title: p.shortDescription?.problem ?? 'Recommendation',
        solution: p.shortDescription?.solution ?? '',
        cat,
        imp: p.impact === 'High' ? 'High' : p.impact === 'Low' ? 'Low' : 'Medium',
        res: p.impactedValue ?? nameOf(target),
        save: Math.round(save || 0),
        source: 'Azure Advisor',
      });
    }
  }

  // ── Defender for Cloud: recommendations, vulnerabilities, Secure Score, alerts ──
  const resIdExpr = `tolower(coalesce(tostring(properties.resourceDetails.Id), tostring(properties.resourceDetails.id), tostring(properties.resourceDetails.ResourceId)))`;
  const assessments = await safe(
    'Security recommendations',
    () =>
      graphQuery<AzJson>(
        subs,
        `securityresources | where type =~ 'microsoft.security/assessments' | where tostring(properties.status.code) =~ 'Unhealthy' | project id, title=tostring(properties.displayName), severity=tostring(properties.metadata.severity), resId=${resIdExpr}`
      ),
    []
  );
  for (const a of assessments) {
    const c = clientOf(a.resId);
    if (!c) continue;
    c.recs.push({
      id: nameOf(a.id) + '-' + nameOf(a.resId),
      title: a.title || 'Security recommendation',
      solution: '',
      cat: 'Security',
      imp: a.severity === 'High' ? 'High' : a.severity === 'Low' ? 'Low' : 'Medium',
      res: nameOf(a.resId),
      save: 0,
      source: 'Defender for Cloud',
    });
  }
  const vulns = await safe(
    'Vulnerabilities',
    () =>
      graphQuery<AzJson>(
        subs,
        `securityresources | where type =~ 'microsoft.security/assessments/subassessments' | where tostring(properties.status.code) =~ 'Unhealthy' | extend sev=tostring(properties.status.severity) | where sev in~ ('High','Critical') | project resId=${resIdExpr}`,
        20000
      ),
    []
  );
  for (const c of clients.values()) c.months[curMonth].vuln = 0;
  for (const v of vulns) {
    const c = clientOf(v.resId);
    if (c) c.months[curMonth].vuln = (c.months[curMonth].vuln ?? 0) + 1;
  }
  if (errors.some((e) => e.area === 'Vulnerabilities')) for (const c of clients.values()) delete c.months[curMonth].vuln;

  const scores = await Promise.all(
    subs.map((s) =>
      safe(
        'Secure Score',
        async () => {
          const j: AzJson = await call(`/subscriptions/${s}/providers/Microsoft.Security/secureScores/ascScore?api-version=2020-01-01`);
          const sc = j.properties?.score;
          return sc ? { cur: +sc.current || 0, max: +sc.max || 0 } : null;
        },
        null
      )
    )
  );
  const sc = scores.filter(Boolean) as { cur: number; max: number }[];
  const scMax = sc.reduce((t, x) => t + x.max, 0);
  if (scMax) subMonths[curMonth].score = round((sc.reduce((t, x) => t + x.cur, 0) / scMax) * 100, 1);

  for (const s of subs) {
    const ok = await safe(
      'Security alerts',
      async () => {
        const alerts = await listAll<AzJson>(`/subscriptions/${s}/providers/Microsoft.Security/alerts?api-version=2022-01-01`, { maxPages: 30 });
        return alerts;
      },
      null
    );
    if (!ok) continue;
    for (const c of clients.values()) for (const m of months) {
      c.months[m].ahigh = c.months[m].ahigh ?? 0;
      c.months[m].amed = c.months[m].amed ?? 0;
    }
    for (const a of ok) {
      const p = a.properties ?? {};
      const m = String(p.timeGeneratedUtc ?? p.startTimeUtc ?? '').slice(0, 7);
      const rid = (p.resourceIdentifiers ?? []).find((x: AzJson) => x.azureResourceId)?.azureResourceId ?? p.compromisedEntity;
      const c = clientOf(rid);
      if (!c || !c.months[m]) continue;
      if (p.severity === 'High') c.months[m].ahigh! += 1;
      else if (p.severity === 'Medium') c.months[m].amed! += 1;
    }
  }

  // ── patching (Azure Update Manager assessments) ──
  const patches = await safe(
    'Patching',
    () =>
      graphQuery<AzJson>(
        subs,
        `patchassessmentresources | where type in~ ('microsoft.compute/virtualmachines/patchassessmentresults','microsoft.hybridcompute/machines/patchassessmentresults') | project id, crit=toint(properties.availablePatchCountByClassification.critical), sec=toint(properties.availablePatchCountByClassification.security)`
      ),
    []
  );
  const patchBy = new Map<string, { n: number; okN: number }>();
  for (const p of patches) {
    const c = clientOf(p.id);
    if (!c) continue;
    const x = patchBy.get(c.id) ?? { n: 0, okN: 0 };
    x.n++;
    if (!(+p.crit || 0) && !(+p.sec || 0)) x.okN++;
    patchBy.set(c.id, x);
  }
  for (const [cid, x] of patchBy) clients.get(cid)!.months[curMonth].patch = round((x.okN / x.n) * 100, 1);

  // ── backups (jobs in each Recovery Services vault) ──
  const vaults = resources.filter((r) => r.type === 'microsoft.recoveryservices/vaults');
  const fmtJob = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} 12:00:00 AM`;
  };
  const jobFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  await pool(vaults, 4, (v) =>
    safe(
      'Backups',
      async () => {
        const filter = `operation eq 'Backup' and startTime eq '${fmtJob(jobFrom)}' and endTime eq '${fmtJob(new Date(now.getTime() + 86_400_000))}'`;
        const jobs = await listAll<AzJson>(`${v.id}/backupJobs?api-version=2023-04-01&$filter=${encodeURIComponent(filter)}`, { maxPages: 30 });
        const vaultClient = clientOf(v.id, v.subscriptionId, v.resourceGroup);
        for (const j of jobs) {
          const p = j.properties ?? {};
          const m = String(p.startTime ?? '').slice(0, 7);
          const c = vmNames.get(lc(p.entityFriendlyName)) ?? vaultClient;
          if (!c || !c.months[m] || /inprogress/i.test(p.status)) continue;
          const f = c.months[m];
          f.bjobs = (f.bjobs ?? 0) + 1;
          f.bfail = (f.bfail ?? 0) + (/failed|cancel/i.test(p.status) ? 1 : 0);
        }
      },
      undefined
    )
  );

  // ── activity log: Resource Health incidents and the changes the team made ──
  const logFrom = new Date(now.getTime() - 89 * 86_400_000).toISOString();
  for (const s of subs) {
    const filter = `eventTimestamp ge '${logFrom}' and eventTimestamp le '${now.toISOString()}'`;
    const select = 'eventTimestamp,category,operationName,status,caller,resourceGroupName,resourceId,correlationId,properties';
    const events = await safe(
      'Activity log',
      () =>
        listAll<AzJson>(
          `/subscriptions/${s}/providers/Microsoft.Insights/eventtypes/management/values?api-version=2015-04-01&$filter=${encodeURIComponent(filter)}&$select=${select}`,
          { maxPages: 60 }
        ),
      []
    );
    events.sort((a, b) => String(a.eventTimestamp).localeCompare(String(b.eventTimestamp)));
    const open = new Map<string, { start: string; title: string; cause: string; prov: boolean }>();
    const seenWork = new Set<string>();
    for (const e of events) {
      const cat = e.category?.value;
      const c = clientOf(e.resourceId, s, lc(e.resourceGroupName) || undefined);
      if (!c) continue;
      if (cat === 'ResourceHealth') {
        const p = e.properties ?? {};
        const health = String(p.currentHealthStatus ?? '');
        const rid = lc(e.resourceId);
        if (/unavailable|degraded/i.test(health) && !open.has(rid)) {
          if (/userinitiated/i.test(p.cause ?? '')) continue; // a planned stop by the team
          open.set(rid, { start: e.eventTimestamp, title: p.title || `${nameOf(e.resourceId)} ${health.toLowerCase()}`, cause: p.details || p.type || '', prov: /platform/i.test(p.cause ?? '') });
        } else if (/available/i.test(health) && !/un/i.test(health) && open.has(rid)) {
          const o = open.get(rid)!;
          open.delete(rid);
          c.inc.push({
            id: `${rid}@${o.start}`,
            date: o.start.slice(0, 10),
            title: o.title,
            dur: Math.max(1, Math.round((Date.parse(e.eventTimestamp) - Date.parse(o.start)) / 60_000)),
            res: nameOf(e.resourceId),
            cause: o.cause,
            prov: o.prov,
            ongoing: false,
          });
        }
        continue;
      }
      if (cat !== 'Administrative' || e.status?.value !== 'Succeeded') continue;
      const caller = String(e.caller ?? '');
      if (!caller.includes('@')) continue; // people only, not automation
      const op = lc(e.operationName?.value);
      if (!/\/(write|delete|action)$/.test(op) || /(list|\/get|read|validate|check|export|query|generate|sas|token|preflight)/.test(op.split('/').slice(-2).join('/')))
        continue;
      const key = `${e.correlationId}|${op}|${lc(e.resourceId)}`;
      if (seenWork.has(key)) continue;
      seenWork.add(key);
      const catName = /backup|recoveryservices/.test(op)
        ? 'Backup and recovery'
        : /patch|maintenance|update/.test(op) && /compute|maintenance|hybridcompute/.test(op)
          ? 'Patching and updates'
          : /security|authorization|keyvault|policy/.test(op)
            ? 'Security'
            : /insights|alert|diagnostic|actiongroup|monitor/.test(op)
              ? 'Monitoring'
              : /\/delete$|deallocate|poweroff/.test(op)
                ? 'Cost optimisation'
                : /resize|autoscale|scale/.test(op)
                  ? 'Performance'
                  : 'Configuration';
      c.work.push({
        id: key,
        date: e.eventTimestamp,
        cat: catName,
        title: `${e.operationName?.localizedValue ?? op}: ${nameOf(e.resourceId)}`,
        detail: e.resourceGroupName ? `Resource group ${e.resourceGroupName}` : '',
        owner: caller,
      });
    }
    for (const [rid, o] of open) {
      const c = clientOf(rid);
      if (!c) continue;
      c.inc.push({
        id: `${rid}@${o.start}`,
        date: o.start.slice(0, 10),
        title: o.title,
        dur: Math.max(1, Math.round((now.getTime() - Date.parse(o.start)) / 60_000)),
        res: nameOf(rid),
        cause: o.cause,
        prov: o.prov,
        ongoing: true,
      });
    }
  }

  // ── MFA registration (Microsoft Graph, tenant-wide) ──
  await safe(
    'MFA',
    async () => {
      const users = await listAll<AzJson>(`${GRAPH}/v1.0/reports/authenticationMethods/userRegistrationDetails?$select=isMfaRegistered,userType`, {
        graph: true,
        maxPages: 100,
      });
      const members = users.filter((u) => lc(u.userType) !== 'guest');
      if (members.length) subMonths[curMonth].mfa = round((members.filter((u) => u.isMfaRegistered).length / members.length) * 100, 1);
    },
    undefined
  );

  const list = [...clients.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const c of list) {
    c.work.sort((a, b) => b.date.localeCompare(a.date));
    c.work = c.work.slice(0, 300);
  }
  return {
    configured: true,
    missing: [],
    fetchedAt: new Date().toISOString(),
    currency,
    months,
    sub: { name: subNames.join(', '), ids: subs, months: subMonths },
    clients: list,
    errors,
  };
}
