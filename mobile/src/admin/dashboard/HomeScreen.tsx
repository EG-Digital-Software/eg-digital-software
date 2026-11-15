import React, { useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import {
  approvalsApi,
  dashboardApi,
  type DashboardSummary,
  type SeriesMetric,
  type SeriesRange,
  type TaskOverview,
} from '../../api/admin/dashboard';
import { useAuth } from '../../context/AuthContext';
import { fmtDate, money } from '../../lib/portal';
import {
  Btn,
  Card,
  Chips,
  EmptyCard,
  ErrorBox,
  Eyebrow,
  Loading,
  Muted,
  Pill,
  Screen,
  SearchField,
  SectionHead,
  Sheet,
  SheetOption,
  T,
  s as ui,
  type PillKind,
} from '../../ui';
import { colors } from '../../theme';
import { AreaChart, Donut, Ring } from './charts';
import { HolidaysCard } from './holidays';
import { ProductGlyph } from './ProductsScreen';
import { Delta, Segs } from './common';
import { LicenceList, LowStockList } from './lists';

/** Greeting on Australian Eastern time, as on the web dashboard. */
function greeting() {
  let h = 12;
  try {
    h = Number(new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Australia/Sydney' }).format(new Date())) % 24;
  } catch {
    h = new Date().getHours();
  }
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const healthLabel = (pct: number) => (pct >= 90 ? 'Excellent' : pct >= 75 ? 'Good' : pct >= 50 ? 'Fair' : 'At risk');

/** Whole dollars for tiles: $12,340. */
const dollars = (n: number) => money(Math.round(Number(n) || 0)).replace(/\.00$/, '');
const num = (n: number) => (Number(n) || 0).toLocaleString('en-AU');

export default function DashboardHome() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const summary = useQuery({ queryKey: ['admin-dashboard', 'summary'], queryFn: dashboardApi.summary });
  const pending = useQuery({
    queryKey: ['admin-approvals', 'count'],
    queryFn: approvalsApi.pendingCount,
    refetchInterval: 60_000,
    enabled: isAdmin,
  });
  const tsPending = useQuery({
    queryKey: ['admin-approvals', 'timesheet', 'ADMIN_PENDING'],
    queryFn: () => approvalsApi.timeSheetRequests('ADMIN_PENDING'),
    refetchInterval: 60_000,
  });

  const s = summary.data;
  const pendingN = pending.data ?? 0;
  const tsN = tsPending.data?.length ?? 0;
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] }),
      qc.invalidateQueries({ queryKey: ['admin-approvals'] }),
    ]);
    setRefreshing(false);
  };

  return (
    <Screen title="Dashboard" refreshing={refreshing} onRefresh={refresh}>
      <Eyebrow>EG Eloma · Admin</Eyebrow>
      <T w="b" size={24} style={{ marginTop: 4 }}>
        {greeting()}, {user?.firstName ?? 'Admin'}
      </T>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        {isAdmin ? (
          <Btn title="Manage team" icon="people-outline" variant="ghost" style={{ flex: 1 }} onPress={() => nav.navigate('Approvals', { role: 'EMPLOYEE' })} />
        ) : null}
        <Btn title="New customer" icon="person-add-outline" style={{ flex: 1 }} onPress={() => nav.navigate('CustomerForm', {})} />
      </View>

      {/* Approvals waiting */}
      <Card onPress={() => nav.navigate('Approvals')} style={[st.approvals, pendingN + tsN > 0 && { borderColor: '#F5D9A8', backgroundColor: '#FFFBF3' }]}>
        <View style={[st.icon, { backgroundColor: pendingN + tsN > 0 ? colors.warnBg : colors.greenSoft }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={pendingN + tsN > 0 ? colors.warnFg : colors.green} />
        </View>
        <View style={{ flex: 1 }}>
          <T w="s" size={15}>
            Approvals
          </T>
          <Muted size={12.5} style={{ marginTop: 2 }}>
            {isAdmin ? `${pendingN} sign-up${pendingN === 1 ? '' : 's'} · ` : ''}
            {tsN} time sheet request{tsN === 1 ? '' : 's'} waiting
          </Muted>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </Card>

      {summary.isError ? (
        <View style={{ marginTop: 16 }}>
          <ErrorBox message={errorMessage(summary.error, 'Could not load the dashboard')} onRetry={() => summary.refetch()} />
        </View>
      ) : !s ? (
        <Loading />
      ) : (
        <Summary s={s} pendingN={isAdmin ? pendingN : null} />
      )}

      <SalesAnalytics />
      <HolidaysCard />
      <RecentActivityCard />
      <TasksOverviewCard />
      <AttentionCards />
      <ProductsCard />
    </Screen>
  );
}

// ─── Summary + KPIs ───────────────────────────────────────

function Summary({ s, pendingN }: { s: DashboardSummary; pendingN: number | null }) {
  const nav = useNavigation<any>();
  // Expiring-soon licences are still live, so they count as healthy.
  const live = s.licences.active + s.licences.expiringSoon;
  const total = live + s.licences.expired + s.licences.suspended;
  const health = total > 0 ? Math.round((live / total) * 100) : 100;

  const sentence = [
    pendingN === null ? null : pendingN ? `${pendingN} approval${pendingN === 1 ? ' is' : 's are'} waiting` : 'No approvals are waiting',
    s.outstanding.amount > 0
      ? `${money(s.outstanding.amount)} is outstanding across ${s.outstanding.count} ${s.outstanding.count === 1 ? 'invoice' : 'invoices'}`
      : 'nothing is outstanding',
    s.overdue.count > 0 ? `${s.overdue.count} past due` : 'nothing is overdue',
  ]
    .filter(Boolean)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1');

  const tiles: { title: string; value: string; foot: React.ReactNode; tone?: string; go: () => void }[] = [
    {
      title: 'Sales (month)',
      value: dollars(s.totalSales.current),
      foot: <FootDelta v={s.totalSales.changePct} text="vs last month" />,
      go: () => nav.navigate('Billing'),
    },
    {
      title: 'Revenue (month)',
      value: dollars(s.revenue.current),
      tone: colors.green,
      foot: <FootDelta v={s.revenue.changePct} text={`vs ${dollars(s.revenue.previous)}`} />,
      go: () => nav.navigate('Billing'),
    },
    {
      title: 'Customers',
      value: num(s.customers.total),
      foot: <FootDelta v={s.customers.changePct} text={`${s.customers.new} new`} />,
      go: () => nav.navigate('Customers'),
    },
    {
      title: 'Products',
      value: num(s.products.active),
      foot: <Muted size={12}>{s.products.lowStock ? `${s.products.lowStock} low on stock` : 'In the catalogue'}</Muted>,
      go: () => nav.navigate('DashLowStock'),
    },
    {
      title: 'Outstanding',
      value: dollars(s.outstanding.amount),
      tone: colors.warnFg,
      foot: <Muted size={12}>{`${s.outstanding.count} unpaid ${s.outstanding.count === 1 ? 'invoice' : 'invoices'}`}</Muted>,
      go: () => nav.navigate('Billing'),
    },
    {
      title: 'Overdue',
      value: dollars(s.overdue.amount),
      tone: s.overdue.count > 0 ? colors.redFg : undefined,
      foot:
        s.overdue.count > 0 ? (
          <T w="s" size={12} color={colors.redFg}>{`${s.overdue.count} past due`}</T>
        ) : (
          <Muted size={12}>Nothing past due</Muted>
        ),
      go: () => nav.navigate('Billing'),
    },
    {
      title: 'Expiring licences',
      value: num(s.licences.expiringSoon),
      tone: s.licences.expiringSoon > 0 ? colors.warnFg : undefined,
      foot: <Muted size={12}>{`${s.licences.expired} expired · ${s.licences.active} active`}</Muted>,
      go: () => nav.navigate('DashLicences'),
    },
  ];

  return (
    <>
      <Card style={st.summary}>
        <Eyebrow style={{ color: '#A9E8CF' }}>Business summary</Eyebrow>
        <T size={15.5} color="#fff" style={{ marginTop: 8, lineHeight: 23 }}>
          {sentence}. {num(s.licences.expiringSoon)} licence{s.licences.expiringSoon === 1 ? '' : 's'} expire within 30 days.
        </T>
        <Pressable onPress={() => nav.navigate('Billing')} style={st.summaryBtn}>
          <T w="s" size={13} color={colors.navy}>
            Open billing
          </T>
          <Ionicons name="arrow-forward" size={14} color={colors.navy} />
        </Pressable>
      </Card>

      <Card style={{ padding: 16, marginTop: 12 }} onPress={() => nav.navigate('DashLicences')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Ring pct={health} color={health < 50 ? colors.red : colors.green2} />
          <View style={{ flex: 1 }}>
            <Eyebrow>System health</Eyebrow>
            <T w="b" size={28} style={{ marginTop: 2 }}>
              {health}
              <T size={15} color={colors.muted}>
                %
              </T>
            </T>
            <Muted size={12}>
              {live} of {total} licences running
            </Muted>
          </View>
          <Pill kind={health >= 75 ? 'ok' : health >= 50 ? 'warn' : 'red'} label={healthLabel(health)} />
        </View>
      </Card>

      <View style={st.grid}>
        {tiles.map((t) => (
          <Card key={t.title} onPress={t.go} style={st.tile}>
            <Eyebrow style={{ fontSize: 10, letterSpacing: 1.2 }}>{t.title}</Eyebrow>
            <T w="b" size={21} color={t.tone ?? colors.fg} style={{ marginTop: 8 }} numberOfLines={1} adjustsFontSizeToFit>
              {t.value}
            </T>
            <View style={{ marginTop: 4 }}>{t.foot}</View>
          </Card>
        ))}
      </View>
    </>
  );
}

function FootDelta({ v, text }: { v: number; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Delta value={v} />
      <Muted size={12} numberOfLines={1} style={{ flexShrink: 1 }}>
        {text}
      </Muted>
    </View>
  );
}

// ─── Sales analytics ──────────────────────────────────────

const METRICS: { value: SeriesMetric; label: string }[] = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'sales', label: 'Sales' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'customers', label: 'Customers' },
];
const RANGES: { value: SeriesRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '12M' },
];

function SalesAnalytics() {
  const [metric, setMetric] = useState<SeriesMetric>('revenue');
  const [range, setRange] = useState<SeriesRange>('30d');
  const q = useQuery({
    queryKey: ['admin-dashboard', 'series', metric, range],
    queryFn: () => dashboardApi.series(metric, range),
  });
  const isMoney = metric === 'revenue' || metric === 'sales';
  const fmt = (v: number) => (isMoney ? money(v) : num(v));
  const axis = (v: number) =>
    isMoney ? (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : `$${Math.round(v)}`) : String(Math.round(v * 10) / 10);

  return (
    <>
      <SectionHead title={`${METRICS.find((m) => m.value === metric)?.label} over time`} />
      <Card style={{ padding: 16 }}>
        <Chips options={METRICS} value={metric} onChange={setMetric} style={{ marginHorizontal: -16 }} />
        <Segs options={RANGES} value={range} onChange={setRange} style={{ marginTop: 12, marginBottom: 14 }} />
        {q.isError ? (
          <ErrorBox message={errorMessage(q.error, 'Could not load the chart')} onRetry={() => q.refetch()} />
        ) : !q.data ? (
          <Loading />
        ) : (
          <AreaChart data={q.data.map((p) => ({ label: p.date, value: p.value }))} format={fmt} axis={axis} />
        )}
      </Card>
    </>
  );
}

// ─── Recent activity ──────────────────────────────────────

type RecentTab = 'customers' | 'invoices' | 'payments';

function RecentActivityCard() {
  const nav = useNavigation<any>();
  const [tab, setTab] = useState<RecentTab>('customers');
  const q = useQuery({ queryKey: ['admin-dashboard', 'recent'], queryFn: dashboardApi.recent });

  const items: { key: string; title: string; sub: string; right: string; go?: () => void }[] = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    if (tab === 'customers')
      return d.customers.map((c) => ({
        key: c.clientId,
        title: c.companyName || c.contactPerson || c.clientId,
        sub: c.clientId,
        right: fmtDate(c.createdAt),
        go: () => nav.navigate('CustomerDetail', { clientId: c.clientId }),
      }));
    if (tab === 'invoices')
      return d.invoices.map((i) => ({
        key: i.id,
        title: i.invoiceNumber,
        sub: i.customer?.companyName ?? '—',
        right: money(Number(i.total)),
        go: () => nav.navigate('InvoiceDetail', { id: i.id }),
      }));
    return d.payments.map((p) => ({
      key: p.id,
      title: p.invoice?.invoiceNumber ?? 'Payment',
      sub: fmtDate(p.paidAt),
      right: money(Number(p.amount)),
      go: p.invoiceId ? () => nav.navigate('InvoiceDetail', { id: p.invoiceId }) : undefined,
    }));
  }, [q.data, tab, nav]);

  const dot = tab === 'customers' ? colors.green2 : tab === 'invoices' ? '#5B7FC7' : '#E39B2E';

  return (
    <>
      <SectionHead title="Recent activity" action={tab === 'payments' ? 'All payments' : undefined} onAction={() => nav.navigate('Payments')} />
      <Segs
        options={[
          { value: 'customers', label: 'Customers' },
          { value: 'invoices', label: 'Invoices' },
          { value: 'payments', label: 'Payments' },
        ]}
        value={tab}
        onChange={setTab}
        style={{ marginBottom: 10 }}
      />
      {q.isError ? (
        <ErrorBox message={errorMessage(q.error, 'Could not load recent activity')} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Loading />
      ) : !items.length ? (
        <EmptyCard icon="time-outline" title="Nothing yet" />
      ) : (
        <Card style={{ paddingHorizontal: 14, paddingTop: 14 }}>
          {items.map((a, i) => (
            <Pressable key={a.key} onPress={a.go} disabled={!a.go} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={[st.tdot, { borderColor: dot }]} />
                {i < items.length - 1 ? <View style={st.tline} /> : null}
              </View>
              <View style={{ flex: 1, flexDirection: 'row', gap: 10, paddingBottom: 14 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w="s" size={14} numberOfLines={1}>
                    {a.title}
                  </T>
                  <Muted size={12.5} numberOfLines={1} style={{ marginTop: 1 }}>
                    {a.sub}
                  </Muted>
                </View>
                <T w="s" size={13} color={tab === 'payments' ? colors.okFg : colors.fg}>
                  {a.right}
                </T>
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </>
  );
}

// ─── Task overview ────────────────────────────────────────

const TASK_PILL: Record<TaskOverview['upcoming'][number]['progress'], { label: string; kind: PillKind }> = {
  IN_PROGRESS: { label: 'In progress', kind: 'on' },
  ONGOING: { label: 'In progress', kind: 'on' },
  NOT_STARTED: { label: 'Pending', kind: 'ns' },
  COMPLETED: { label: 'Completed', kind: 'ok' },
};

const customerLabel = (c: { companyName?: string | null; contactPerson?: string | null; clientId: string }) =>
  c.companyName || c.contactPerson || c.clientId;

function TasksOverviewCard() {
  const nav = useNavigation<any>();
  const [clientId, setClientId] = useState('');
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState('');
  const customers = useQuery({ queryKey: ['admin-dashboard', 'customers'], queryFn: dashboardApi.customers });
  const q = useQuery({
    queryKey: ['admin-dashboard', 'tasks-overview', clientId],
    queryFn: () => dashboardApi.tasksOverview(clientId || undefined),
  });
  const list = customers.data ?? [];
  const current = list.find((c) => c.clientId === clientId);
  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return list;
    return list.filter((c) => customerLabel(c).toLowerCase().includes(t) || c.clientId.toLowerCase().includes(t));
  }, [list, search]);
  const d = q.data;

  /**
   * The overview names each task's customer (company, else contact, else
   * client ID — the same rule as `customerLabel`) but carries no ID. With a
   * customer picked it is that one; otherwise map the name back through the
   * customer list, only when exactly one customer matches.
   */
  const clientOf = (name: string): string | null => {
    if (clientId) return clientId;
    const hits = list.filter((c) => customerLabel(c) === name);
    return hits.length === 1 ? hits[0]!.clientId : null;
  };

  const pick = (id: string) => {
    setClientId(id);
    setPicker(false);
    setSearch('');
  };

  return (
    <>
      <SectionHead
        title="Task overview"
        action="View all"
        onAction={() =>
          current ? nav.navigate('AdminTaskBoard', { clientId: current.clientId, companyName: customerLabel(current) }) : nav.navigate('Tasks')
        }
      />
      <Pressable onPress={() => setPicker(true)} style={st.picker}>
        <Ionicons name="business-outline" size={18} color={colors.muted} />
        <T w="s" size={14} style={{ flex: 1 }} numberOfLines={1}>
          {current ? customerLabel(current) : 'All customers'}
        </T>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      <Card style={{ padding: 16, marginTop: 10 }}>
        {q.isError ? (
          <ErrorBox message={errorMessage(q.error, 'Could not load tasks')} onRetry={() => q.refetch()} />
        ) : !d ? (
          <Loading />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
              <Donut
                segments={[
                  { value: d.inProgress, color: '#5B7FC7' },
                  { value: d.pending, color: colors.navy },
                  { value: d.completed, color: colors.green2 },
                ]}
              >
                <T w="b" size={24}>
                  {d.total}
                </T>
                <Muted size={11}>Total tasks</Muted>
              </Donut>
              <View style={{ flex: 1, gap: 10 }}>
                {[
                  { n: d.inProgress, label: 'In progress', color: '#5B7FC7' },
                  { n: d.pending, label: 'Pending', color: colors.navy },
                  { n: d.completed, label: 'Completed', color: colors.green2 },
                ].map((x) => (
                  <View key={x.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: x.color }} />
                    <T w="s" size={14}>
                      {x.n}
                    </T>
                    <Muted size={13}>{x.label}</Muted>
                  </View>
                ))}
              </View>
            </View>
            <View style={[ui.hair, { marginTop: 14, marginHorizontal: -16 }]} />
            {d.upcoming.length === 0 ? (
              <Muted size={13} style={{ marginTop: 12 }}>
                No open tasks — everything is done.
              </Muted>
            ) : (
              d.upcoming.map((t, i) => {
                const pill = TASK_PILL[t.progress] ?? TASK_PILL.NOT_STARTED;
                const cid = t.clientId || clientOf(t.customer);
                return (
                  <Pressable
                    key={t.id}
                    disabled={!cid}
                    onPress={() => cid && nav.navigate('AdminTask', { clientId: cid, taskId: t.id })}
                    style={({ pressed }) => [st.row, { paddingVertical: 10, gap: 12 }, i > 0 && ui.hair, pressed && { opacity: 0.6 }]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w="m" size={14} numberOfLines={1}>
                        {t.title}
                      </T>
                      <Muted size={12} numberOfLines={1}>
                        {t.customer}
                      </Muted>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Muted size={12}>{t.dueDate ? fmtDate(t.dueDate) : '—'}</Muted>
                      <Pill kind={pill.kind} label={pill.label} style={{ height: 24 }} />
                    </View>
                    {cid ? <Ionicons name="chevron-forward" size={16} color={colors.faint} /> : null}
                  </Pressable>
                );
              })
            )}
          </>
        )}
      </Card>

      <Sheet open={picker} onClose={() => setPicker(false)}>
        <T w="s" size={17} style={{ marginBottom: 10 }}>
          Show tasks for
        </T>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search customers" />
        <SheetOption title="All customers" selected={clientId === ''} onPress={() => pick('')} />
        {customers.isLoading ? <Loading /> : null}
        {filtered.map((c) => (
          <SheetOption key={c.clientId} title={customerLabel(c)} right={c.clientId} selected={c.clientId === clientId} onPress={() => pick(c.clientId)} />
        ))}
        {!customers.isLoading && !filtered.length ? (
          <Muted size={13} style={{ textAlign: 'center', marginTop: 16 }}>
            No customer matches “{search}”.
          </Muted>
        ) : null}
      </Sheet>
    </>
  );
}

// ─── Licences + low stock ─────────────────────────────────

function AttentionCards() {
  const nav = useNavigation<any>();
  const lic = useQuery({ queryKey: ['admin-dashboard', 'licences'], queryFn: dashboardApi.licences });
  const low = useQuery({ queryKey: ['admin-dashboard', 'low-stock'], queryFn: dashboardApi.lowStock });
  const licRows = lic.data ?? [];
  const lowRows = low.data ?? [];
  return (
    <>
      <SectionHead
        title={`Licences to watch${licRows.length ? ` (${licRows.length})` : ''}`}
        action={licRows.length > 4 ? 'See all' : undefined}
        onAction={() => nav.navigate('DashLicences')}
      />
      {lic.isError ? (
        <ErrorBox message={errorMessage(lic.error, 'Could not load licences')} onRetry={() => lic.refetch()} />
      ) : !lic.data ? (
        <Loading />
      ) : !licRows.length ? (
        <EmptyCard icon="key-outline" title="All licences are healthy" body="Nothing expires in the next 30 days." />
      ) : (
        <LicenceList rows={licRows.slice(0, 4)} />
      )}

      <SectionHead
        title={`Low stock${lowRows.length ? ` (${lowRows.length})` : ''}`}
        action={lowRows.length > 4 ? 'See all' : undefined}
        onAction={() => nav.navigate('DashLowStock')}
      />
      {low.isError ? (
        <ErrorBox message={errorMessage(low.error, 'Could not load stock')} onRetry={() => low.refetch()} />
      ) : !low.data ? (
        <Loading />
      ) : !lowRows.length ? (
        <EmptyCard icon="cube-outline" title="Stock levels are fine" body="No active product is under its threshold." />
      ) : (
        <LowStockList rows={lowRows.slice(0, 4)} />
      )}
    </>
  );
}

function ProductsCard() {
  const nav = useNavigation<any>();
  const q = useQuery({ queryKey: ['admin-dashboard', 'products'], queryFn: dashboardApi.products });
  return (
    <>
      <SectionHead
        title={`Total products${q.data ? ` (${q.data.meta.total})` : ''}`}
        action="View all"
        onAction={() => nav.navigate('DashProducts')}
      />
      {q.isError ? (
        <ErrorBox message={errorMessage(q.error, 'Could not load products')} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Loading />
      ) : !q.data.items.length ? (
        <EmptyCard icon="cube-outline" title="No products" body="Products you add will appear here." />
      ) : (
        <Card>
          {q.data.items.map((p, i) => (
            <View key={p.id} style={[st.row, { padding: 14, gap: 12 }, i > 0 && ui.hair]}>
              <ProductGlyph name={p.name} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T w="s" size={14.5} numberOfLines={1}>
                  {p.name}
                </T>
                <Muted size={12} numberOfLines={1}>
                  {p.category || p.productCode || '—'}
                </Muted>
              </View>
              <Pill kind={p.status === 'ACTIVE' ? 'ok' : 'ns'} label={p.status === 'ACTIVE' ? 'Active' : 'Inactive'} />
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  approvals: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 16 },
  summary: { padding: 18, marginTop: 12, backgroundColor: colors.navy, borderColor: colors.navy },
  summaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  tile: { width: '48.4%', flexGrow: 1, padding: 14 },
  tdot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 4 },
  tline: { flex: 1, width: 1, backgroundColor: colors.line, marginVertical: 4 },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
  },
});
