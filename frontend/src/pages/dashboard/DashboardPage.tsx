import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Users, UserPlus, ArrowRight, Building2, ChevronDown, Check, Search } from 'lucide-react';
import { adminApi, dashboardApi, productApi, customerApi } from '@/api/resources';
import type { DashboardSummary } from '@/types';
import { useAuth } from '@/store/auth';
import { useStaffAccess } from '@/lib/staffAccess';
import { StatDelta } from '@/components/shared/misc';
import { SalesChart } from './SalesChart';
import { PublicHolidaysCard } from '@/components/client/PublicHolidays';
import { Input } from '@/components/ui/input';
import { Skeleton, Avatar, AvatarFallback } from '@/components/ui/misc';
import { EmptyState } from '@/components/shared/states';
import { healthLabel } from '@/components/shared/HeroHealth';
import { customerName } from '@/lib/customer';
import { ProductGlyph } from '@/lib/product-icon';
import { formatCurrency, formatNumber, formatDate, cn, initials } from '@/lib/utils';

/** Circumference of the health ring (r = 22). */
const RING_C = 2 * Math.PI * 22;

function StatCard({
  title,
  value,
  footer,
  to,
  hint,
  tone,
}: {
  title: string;
  value: string;
  footer: ReactNode;
  /** Where the tile drills through to. */
  to?: string;
  /** Tooltip clarifying what the number counts. */
  hint?: string;
  /** Optional colour for the value (design token). */
  tone?: string;
}) {
  const card = (
    <div className="glass card" style={{ padding: 20, height: '100%' }}>
      <div className="eyebrow">{title}</div>
      <div className="disp stat" style={{ fontSize: 30, fontWeight: 600, marginTop: 10, color: tone }}>
        {value}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {footer}
      </div>
    </div>
  );

  return to ? (
    <Link to={to} title={hint} className="block" style={{ color: 'inherit', textDecoration: 'none' }}>
      {card}
    </Link>
  ) : (
    <div title={hint}>{card}</div>
  );
}

function KpiSkeletons() {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="glass" style={{ padding: 20 }}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-8 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </>
  );
}

/**
 * Time-of-day greeting, always based on Australian Eastern time (Sydney) so it
 * reads correctly regardless of where the admin's device is. Handles AEST/AEDT
 * automatically via the IANA time zone.
 */
function greeting() {
  const h =
    Number(
      new Intl.DateTimeFormat('en-AU', {
        hour: 'numeric',
        hour12: false,
        timeZone: 'Australia/Sydney',
      }).format(new Date())
    ) % 24; // some engines report midnight as "24"
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Section header row used across the dashboard (design: h2 18px + action). */
function SectionHead({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '18px 22px',
        borderBottom: '1px solid rgba(var(--w),.06)',
      }}
    >
      <h2 className="disp" style={{ margin: 0, fontSize: 18 }}>
        {title}
      </h2>
      {action}
    </div>
  );
}

const KPI_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 } as const;

export default function DashboardPage() {
  const user = useAuth((s) => s.user);
  // Team members with the Dashboard tab don't manage logins or approvals.
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const { canEdit } = useStaffAccess();
  // Captured once per mount so renders stay pure.
  const [now] = useState(() => Date.now());
  const summaryQ = useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: dashboardApi.summary,
  });
  // Same query (and cache) as the dock's Approvals badge.
  const { data: pending } = useQuery({
    queryKey: ['admin', 'pendingCount'],
    queryFn: adminApi.pendingCount,
    refetchInterval: 60_000,
    enabled: isAdmin,
  });

  const s = summaryQ.data;

  // Portfolio health = share of licences still running. Expiring-soon licences
  // are live, so they count as healthy (the licence table flags them); only
  // expired and suspended ones pull the score down.
  const licLive = s ? s.licences.active + s.licences.expiringSoon : 0;
  const licTotal = s ? licLive + s.licences.expired + s.licences.suspended : 0;
  const healthPct = licTotal > 0 ? Math.round((licLive / licTotal) * 100) : 100;
  const pendingN = pending ?? 0;

  return (
    <div className="ec-page">
      {/* Hero */}
      <div
        className="up"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}
      >
        <div>
          <div className="eyebrow">EG Eloma · Admin</div>
          <h1 className="disp ec-hero-h1">
            {greeting()}, {user?.firstName ?? 'Admin'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isAdmin && (
            <Link to="/admin/approvals?role=EMPLOYEE" className="btn bg">
              <Users /> Manage team
            </Link>
          )}
          {canEdit('customers.overview') && (
            <Link to="/admin/customers/new" className="btn bp">
              <UserPlus /> Create Customer
            </Link>
          )}
        </div>
      </div>

      {/* Business summary */}
      <div className="aib up">
        <div className="aib-in" style={{ padding: '22px 24px', display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'center' }}>
          <div className="orb" aria-hidden="true" />
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <span className="eyebrow">Business summary</span>
            <p style={{ margin: '8px 0 0', fontSize: 17, lineHeight: 1.55, color: 'var(--fg)' }}>
              {!s ? (
                'Loading your business overview…'
              ) : (
                <>
                  <b style={{ color: pendingN ? 'var(--wT)' : 'var(--okT)' }}>
                    {pendingN ? `${pendingN} approval${pendingN === 1 ? '' : 's'}` : 'No approvals'}
                  </b>{' '}
                  {pendingN === 1 ? 'is' : 'are'} waiting,{' '}
                  {s.outstanding.amount > 0 ? (
                    <>
                      <b style={{ color: 'var(--vT)' }}>{formatCurrency(s.outstanding.amount)}</b> is outstanding across{' '}
                      {s.outstanding.count} {s.outstanding.count === 1 ? 'invoice' : 'invoices'}
                    </>
                  ) : (
                    <b style={{ color: 'var(--okT)' }}>nothing is outstanding</b>
                  )}{' '}
                  and{' '}
                  {s.overdue.count > 0 ? (
                    <b style={{ color: 'var(--rT)' }}>{s.overdue.count} past due</b>
                  ) : (
                    <b style={{ color: 'var(--okT)' }}>nothing is overdue</b>
                  )}
                  . {formatNumber(s.licences.expiringSoon)} licence{s.licences.expiringSoon === 1 ? '' : 's'} expire
                  within 30 days.
                </>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <Link to="/admin/billing" className="btn bg">
              Open billing
            </Link>
          </div>
        </div>
      </div>

      {/* Headline KPIs */}
      <div style={KPI_GRID}>
        <div className="glass card up" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg viewBox="0 0 52 52" width="64" height="64" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(var(--w),.08)" strokeWidth="5" />
            <circle
              cx="26"
              cy="26"
              r="22"
              fill="none"
              stroke={healthPct < 50 ? '#E5484D' : 'var(--brand)'}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${(RING_C * healthPct) / 100} ${RING_C}`}
              transform="rotate(-90 26 26)"
            />
          </svg>
          <div>
            <div className="eyebrow">System health</div>
            <div className="disp stat" style={{ fontSize: 30, fontWeight: 600, marginTop: 6 }}>
              {s ? healthPct : '—'}
              <span className="muted" style={{ fontSize: 16 }}>
                %
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {healthLabel(healthPct)}
            </div>
          </div>
        </div>
        <Link to="/admin/customers" className="glass card up" style={{ padding: 20, color: 'inherit', textDecoration: 'none' }}>
          <div className="eyebrow">Customers</div>
          <div className="disp stat" style={{ fontSize: 30, fontWeight: 600, marginTop: 10 }}>
            {s ? formatNumber(s.customers.total) : '—'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Active accounts
          </div>
        </Link>
        <Link to="/admin/billing" className="glass card up" style={{ padding: 20, color: 'inherit', textDecoration: 'none' }}>
          <div className="eyebrow">Sales (month)</div>
          <div className="disp stat" style={{ fontSize: 30, fontWeight: 600, marginTop: 10 }}>
            {s ? formatCurrency(s.totalSales.current) : '—'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Invoiced this month
          </div>
        </Link>
      </div>

      <div className="stag" style={KPI_GRID}>
        {summaryQ.isLoading || !s ? (
          <KpiSkeletons />
        ) : (
          <>
            <StatCard
              title="Sales (month)"
              to="/admin/billing"
              hint="Value invoiced this month, paid or not (drafts and cancellations excluded)"
              value={formatCurrency(s.totalSales.current)}
              footer={
                <span className="flex items-center gap-1.5">
                  <StatDelta value={s.totalSales.changePct} /> vs last month
                </span>
              }
            />
            <StatCard
              title="Total customers"
              to="/admin/customers"
              hint="Active customers; the delta compares new sign-ups month on month"
              value={formatNumber(s.customers.total)}
              footer={
                <span className="flex items-center gap-1.5">
                  <StatDelta value={s.customers.changePct} /> {s.customers.new} new
                </span>
              }
            />
            <StatCard
              title="Total products"
              to="/admin/products"
              hint="Active products in the catalogue"
              value={formatNumber(s.products.active)}
              footer={<span>In the catalogue</span>}
            />
            <StatCard
              title="Outstanding"
              to="/admin/billing"
              hint="Total still owed across every unpaid invoice"
              tone="var(--wT)"
              value={formatCurrency(s.outstanding.amount)}
              footer={
                <span>
                  {s.outstanding.count} unpaid {s.outstanding.count === 1 ? 'invoice' : 'invoices'}
                </span>
              }
            />
            <StatCard
              title="Overdue"
              to="/admin/billing"
              hint="Owed and already past the due date"
              tone={s.overdue.count > 0 ? 'var(--rT)' : undefined}
              value={formatCurrency(s.overdue.amount)}
              footer={
                s.overdue.count > 0 ? (
                  <span style={{ color: 'var(--rT)', fontWeight: 600 }}>{s.overdue.count} past due</span>
                ) : (
                  <span>Nothing past due</span>
                )
              }
            />
            <StatCard
              title="Expiring licences"
              to="/admin/customers"
              hint="Licences expiring within 30 days"
              tone={s.licences.expiringSoon > 0 ? 'var(--wT)' : undefined}
              value={formatNumber(s.licences.expiringSoon)}
              footer={
                <span>
                  {s.licences.expired} expired · {s.licences.active} active
                </span>
              }
            />
            <StatCard
              title="Revenue (month)"
              to="/admin/billing"
              hint="Cash actually collected this month — payments received, not invoiced value"
              tone="var(--brand)"
              value={formatCurrency(s.revenue.current)}
              footer={
                <span className="flex items-center gap-1.5">
                  <StatDelta value={s.revenue.changePct} /> vs {formatCurrency(s.revenue.previous)}
                </span>
              }
            />
          </>
        )}
      </div>

      {/* Sales analytics + public holidays, side by side */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
        <div style={{ flex: '2 1 560px', minWidth: 0, display: 'grid' }}>
          <SalesChart />
        </div>
        <PublicHolidaysCard
          now={now}
          note="The Melbourne office is closed on these days. Plan task due dates and client follow-ups around them."
          style={{ flex: '1 1 320px', minWidth: 0 }}
        />
      </div>

      <RecentActivity />

      {/* Task overview + Total products */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
        <TasksOverviewCard />
        <TotalProductsCard />
      </div>
    </div>
  );
}

/** Multi-segment donut for the Tasks Overview card. */
function Donut({ total, segments }: { total: number; segments: { value: number; color: string }[] }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1;
  // Each segment starts where the previous ones end.
  const lens = segments.map((seg) => (seg.value / sum) * c);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(var(--w),.08)" strokeWidth="10" />
        {segments.map((seg, i) => {
          if (seg.value <= 0) return null;
          const len = lens[i];
          return (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="10"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-starts[i]}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="disp stat" style={{ fontSize: 24, fontWeight: 600 }}>
          {total}
        </span>
        <span className="muted" style={{ fontSize: 11 }}>
          Total tasks
        </span>
      </div>
    </div>
  );
}

const TASK_PILL: Record<string, { label: string; cls: string }> = {
  IN_PROGRESS: { label: 'In progress', cls: 'chip c-on' },
  ONGOING: { label: 'In progress', cls: 'chip c-on' },
  NOT_STARTED: { label: 'Pending', cls: 'chip c-ns' },
  COMPLETED: { label: 'Completed', cls: 'chip c-ok' },
};

function TasksOverviewCard() {
  // '' = all customers; otherwise a specific customer's clientId.
  const [clientId, setClientId] = useState('');
  const custQ = useQuery({
    queryKey: ['customers', 'task-picker'],
    queryFn: () => customerApi.list({ pageSize: 200, sortBy: 'companyName', sortDir: 'asc' }),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'tasks-overview', clientId],
    queryFn: () => dashboardApi.tasksOverview(clientId || undefined),
  });

  return (
    <section className="glass up" style={{ height: '100%' }}>
      <SectionHead
        title="Task overview"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <TaskCustomerPicker customers={custQ.data?.items ?? []} selected={clientId} onSelect={setClientId} />
            <Link to="/admin/tasks" className="btn bg sm">
              View all <ArrowRight />
            </Link>
          </div>
        }
      />
      <div style={{ padding: '18px 22px 20px' }}>
        {isLoading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-28 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-5">
              <Donut
                total={data.total}
                segments={[
                  { value: data.inProgress, color: '#5B7FC7' },
                  { value: data.pending, color: '#0F2340' },
                  { value: data.completed, color: '#2DB98A' },
                ]}
              />
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13 }} className="space-y-2.5">
                <li className="flex items-center gap-2">
                  <span className="dot" style={{ color: '#5B7FC7' }} />
                  <span className="stat" style={{ fontWeight: 600 }}>
                    {data.inProgress}
                  </span>
                  <span className="muted">In progress</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="dot" style={{ color: 'var(--mu)' }} />
                  <span className="stat" style={{ fontWeight: 600 }}>
                    {data.pending}
                  </span>
                  <span className="muted">Pending</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="dot" style={{ color: '#2DB98A' }} />
                  <span className="stat" style={{ fontWeight: 600 }}>
                    {data.completed}
                  </span>
                  <span className="muted">Completed</span>
                </li>
              </ul>
            </div>

            <div className="min-w-0 flex-1">
              {data.upcoming.length === 0 ? (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  No open tasks — everything is done.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {data.upcoming.map((t, i) => {
                    const pill = TASK_PILL[t.progress] ?? TASK_PILL.NOT_STARTED;
                    return (
                      <li
                        key={t.id}
                        className="row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '10px 0',
                          borderTop: i ? '1px solid rgba(var(--w),.05)' : undefined,
                        }}
                      >
                        <div className="min-w-0">
                          <div className="truncate" style={{ fontWeight: 500 }}>
                            {t.title}
                          </div>
                          <div className="muted truncate" style={{ fontSize: 12 }}>
                            {t.customer}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="muted" style={{ fontSize: 12 }}>
                            {t.dueDate ? formatDate(t.dueDate) : '—'}
                          </span>
                          <span className={pill.cls} style={{ padding: '2px 8px', fontSize: 11 }}>
                            {pill.label}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface PickerCustomer {
  clientId: string;
  companyName?: string | null;
  contactPerson?: string | null;
}

/** Compact customer filter for the Task Overview card. "All customers" clears the scope. */
function TaskCustomerPicker({
  customers,
  selected,
  onSelect,
}: {
  customers: PickerCustomer[];
  selected: string;
  onSelect: (clientId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = customers.find((c) => c.clientId === selected);
  const label = current ? customerName(current) : 'All customers';
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter(
      (c) => customerName(c).toLowerCase().includes(s) || c.clientId.toLowerCase().includes(s)
    );
  }, [customers, q]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inp flex items-center gap-2"
        style={{ minHeight: 36, minWidth: 190, padding: '0 10px', fontSize: 13, cursor: 'pointer' }}
      >
        <Building2 className="h-4 w-4 shrink-0" style={{ color: 'var(--mu)' }} />
        <span className="flex-1 truncate text-left font-medium">{label}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition', open && 'rotate-180')} style={{ color: 'var(--mu)' }} />
      </button>

      {open && (
        <div
          className="glass absolute right-0 z-30 mt-1 w-[300px] overflow-hidden"
          style={{ boxShadow: '0 20px 40px -16px rgba(15,35,64,.45)' }}
        >
          <div className="relative p-2" style={{ borderBottom: '1px solid rgba(var(--w),.06)' }}>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              placeholder="Search customers"
              className="h-9 pl-8"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => {
                onSelect('');
                setOpen(false);
                setQ('');
              }}
              className={cn(
                'row flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm',
                selected === '' && 'bg-secondary'
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground">
                <Users className="h-4 w-4" />
              </span>
              <span className="flex-1 font-medium">All customers</span>
              {selected === '' && <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--brand)' }} />}
            </button>
            {filtered.map((c) => {
              const active = c.clientId === selected;
              return (
                <button
                  key={c.clientId}
                  type="button"
                  onClick={() => {
                    onSelect(c.clientId);
                    setOpen(false);
                    setQ('');
                  }}
                  className={cn(
                    'row flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm',
                    active && 'bg-secondary'
                  )}
                >
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-[10px]">{initials(customerName(c))}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{customerName(c)}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.clientId}</div>
                  </div>
                  {active && <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--brand)' }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TotalProductsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'products-list'],
    queryFn: () => productApi.list({ page: 1, pageSize: 6, status: '', sortBy: 'createdAt', sortDir: 'desc' }),
  });

  return (
    <section className="glass up" style={{ overflow: 'hidden', height: '100%' }}>
      <SectionHead
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Total products
            {data && (
              <span className="chip c-ns" style={{ padding: '2px 8px', fontSize: 11 }}>
                {data.meta.total}
              </span>
            )}
          </span>
        }
        action={
          <Link to="/admin/products" className="btn bg sm">
            View all <ArrowRight />
          </Link>
        }
      />
      {isLoading ? (
        <div className="space-y-2" style={{ padding: '18px 22px' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <div style={{ padding: '18px 22px' }}>
          <EmptyState title="No products" description="Products you add will appear here." />
        </div>
      ) : (
        <ul className="stag" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.items.map((p, i) => (
            <li
              key={p.id}
              className="row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 22px',
                borderTop: i ? '1px solid rgba(var(--w),.05)' : undefined,
              }}
            >
              <span className="ico">
                <ProductGlyph parts={[p.name, p.category, p.type]} className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate" style={{ fontWeight: 500 }}>
                  {p.name}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {p.category || p.productCode}
                </div>
              </div>
              <span className={p.status === 'ACTIVE' ? 'chip c-ok' : 'chip c-ns'}>
                <span className="dot" />
                {p.status === 'ACTIVE' ? 'Active' : 'Inactive'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Timeline rows in the style of the client Overview's "Recent activity". */
function TimelineList({
  items,
  color,
  rightColor,
}: {
  items: { key: string; title: string; sub: string; right: string }[];
  color: string;
  rightColor?: string;
}) {
  if (!items.length) {
    return (
      <p className="muted" style={{ margin: 0, padding: '14px 22px', fontSize: 13 }}>
        Nothing yet.
      </p>
    );
  }
  return (
    <div className="stag" style={{ padding: '16px 22px 4px' }}>
      {items.map((a) => (
        <div key={a.key} style={{ display: 'flex', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: `2px solid ${color}`,
                marginTop: 4,
                boxShadow: `0 0 10px ${color}`,
              }}
            />
            <span style={{ flex: 1, width: 1, background: 'rgba(var(--w),.08)', margin: '4px 0' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 14 }}>
            <div className="min-w-0">
              <div className="truncate" style={{ fontWeight: 500, fontSize: 14 }}>
                {a.title}
              </div>
              <div className="muted truncate" style={{ fontSize: 12.5, marginTop: 2 }}>
                {a.sub}
              </div>
            </div>
            <div className="stat" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: rightColor }}>
              {a.right}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentActivity() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'recent'],
    queryFn: dashboardApi.recent,
  });

  const recent = data as
    | {
        customers: Array<{ clientId: string; companyName?: string; contactPerson?: string; createdAt: string }>;
        invoices: Array<{ id: string; invoiceNumber: string; total: string; createdAt: string; customer?: { companyName?: string } }>;
        payments: Array<{ id: string; amount: string; paidAt: string; invoice?: { invoiceNumber: string } }>;
      }
    | undefined;

  const loadingRows = (
    <div className="space-y-2" style={{ padding: '14px 22px' }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
      <section className="glass up" style={{ overflow: 'hidden' }}>
        <SectionHead title="Recent customers" />
        {isLoading ? (
          loadingRows
        ) : (
          <TimelineList
            color="#2DB98A"
            items={(recent?.customers ?? []).map((c) => ({
              key: c.clientId,
              title: c.companyName || c.contactPerson || c.clientId,
              sub: c.clientId,
              right: formatDate(c.createdAt),
            }))}
          />
        )}
      </section>

      <section className="glass up" style={{ overflow: 'hidden' }}>
        <SectionHead title="Recent invoices" />
        {isLoading ? (
          loadingRows
        ) : (
          <TimelineList
            color="#5B7FC7"
            items={(recent?.invoices ?? []).map((i) => ({
              key: i.id,
              title: i.invoiceNumber,
              sub: i.customer?.companyName ?? '—',
              right: formatCurrency(i.total),
            }))}
          />
        )}
      </section>

      <section className="glass up" style={{ overflow: 'hidden' }}>
        <SectionHead title="Recent payments" />
        {isLoading ? (
          loadingRows
        ) : (
          <TimelineList
            color="#E39B2E"
            rightColor="var(--okT)"
            items={(recent?.payments ?? []).map((p) => ({
              key: p.id,
              title: p.invoice?.invoiceNumber ?? 'Payment',
              sub: formatDate(p.paidAt),
              right: formatCurrency(p.amount),
            }))}
          />
        )}
      </section>
    </div>
  );
}
