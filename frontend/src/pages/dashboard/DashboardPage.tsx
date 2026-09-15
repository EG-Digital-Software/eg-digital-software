import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  Users,
  Package,
  FileWarning,
  KeyRound,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  Building2,
  ChevronDown,
  Check,
  Search,
} from 'lucide-react';
import { dashboardApi, productApi, customerApi } from '@/api/resources';
import type { DashboardSummary } from '@/types';
import type { LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';
import { useAuth } from '@/store/auth';
import { StatDelta } from '@/components/shared/misc';
import { SalesChart } from './SalesChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton, Avatar, AvatarFallback } from '@/components/ui/misc';
import { EmptyState } from '@/components/shared/states';
import { HeroWave, HeroHealthCluster, healthLabel } from '@/components/shared/HeroHealth';
import { customerName } from '@/lib/customer';
import { ProductGlyph } from '@/lib/product-icon';
import { formatCurrency, formatNumber, formatDate, cn, initials } from '@/lib/utils';

// Soft pastel tones for the stat-card icon tiles (matches the reference).
const TONES: Record<string, string> = {
  violet: 'bg-violet-100 text-violet-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  blue: 'bg-blue-100 text-blue-600',
  amber: 'bg-amber-100 text-amber-600',
  rose: 'bg-rose-100 text-rose-600',
  cyan: 'bg-cyan-100 text-cyan-600',
};

function StatCard({
  title,
  icon: Icon,
  value,
  footer,
  tone,
  to,
  hint,
}: {
  title: string;
  icon: ComponentType<LucideProps>;
  value: string;
  footer: React.ReactNode;
  tone: keyof typeof TONES;
  /** Where the tile drills through to. */
  to?: string;
  /** Tooltip clarifying what the number counts. */
  hint?: string;
}) {
  const card = (
    <Card className="h-full p-5 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
          <Icon className="h-[22px] w-[22px]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          <div className="mt-0.5 text-xs text-muted-foreground">{footer}</div>
        </div>
      </div>
    </Card>
  );

  return to ? (
    <Link to={to} title={hint} className="block">
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
        <Card key={i}>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
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

export default function DashboardPage() {
  const user = useAuth((s) => s.user);
  const summaryQ = useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: dashboardApi.summary,
  });

  const s = summaryQ.data;

  // Portfolio health = share of licences that aren't expiring soon or expired.
  const licTotal = s ? s.licences.active + s.licences.expiringSoon + s.licences.expired : 0;
  const healthPct = licTotal > 0 ? Math.round((s!.licences.active / licTotal) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#eaf1ff] via-[#f3f7ff] to-[#e9f6ef] p-6 sm:p-8">
        <HeroWave />
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
              {greeting()}, {user?.firstName ?? 'Admin'} <span className="align-middle">👋</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Here’s an overview of your business performance.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link to="/admin/approvals?role=EMPLOYEE">Manage Team</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/admin/customers">Manage customers</Link>
              </Button>
            </div>
          </div>

          {s && (
            <HeroHealthCluster title="System Health" pct={healthPct} label={healthLabel(healthPct)} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {summaryQ.isLoading || !s ? (
          <KpiSkeletons />
        ) : (
          <>
            <StatCard
              title="Sales (Month)"
              icon={DollarSign}
              tone="violet"
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
              title="Total Customers"
              icon={Users}
              tone="emerald"
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
              title="Total Products"
              icon={Package}
              tone="blue"
              to="/admin/products"
              hint="Active products in the catalogue"
              value={formatNumber(s.products.active)}
              footer={<span>In the catalogue</span>}
            />
            <StatCard
              title="Outstanding"
              icon={FileWarning}
              tone="amber"
              to="/admin/billing"
              hint="Total still owed across every unpaid invoice"
              value={formatCurrency(s.outstanding.amount)}
              footer={
                <span>
                  {s.outstanding.count} unpaid {s.outstanding.count === 1 ? 'invoice' : 'invoices'}
                </span>
              }
            />
            <StatCard
              title="Overdue"
              icon={AlertTriangle}
              tone="rose"
              to="/admin/billing"
              hint="Owed and already past the due date"
              value={formatCurrency(s.overdue.amount)}
              footer={
                s.overdue.count > 0 ? (
                  <span className="font-medium text-destructive">{s.overdue.count} past due</span>
                ) : (
                  <span>Nothing past due</span>
                )
              }
            />
            <StatCard
              title="Expiring Licences"
              icon={KeyRound}
              tone="rose"
              to="/admin/customers"
              hint="Licences expiring within 30 days"
              value={formatNumber(s.licences.expiringSoon)}
              footer={
                <span>
                  {s.licences.expired} expired · {s.licences.active} active
                </span>
              }
            />
            <StatCard
              title="Revenue (Month)"
              icon={TrendingUp}
              tone="cyan"
              to="/admin/billing"
              hint="Cash actually collected this month — payments received, not invoiced value"
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

      <SalesChart />

      <RecentActivity />

      {/* Task overview + Total products */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
  let acc = 0;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="10" />
        {segments.map((seg, i) => {
          if (seg.value <= 0) return null;
          const len = (seg.value / sum) * c;
          const el = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="10"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
              strokeLinecap="round"
            />
          );
          acc += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums">{total}</span>
        <span className="text-[11px] text-muted-foreground">Total tasks</span>
      </div>
    </div>
  );
}

const TASK_PILL: Record<string, { label: string; cls: string }> = {
  IN_PROGRESS: { label: 'In progress', cls: 'bg-amber-100 text-amber-700' },
  ONGOING: { label: 'In progress', cls: 'bg-amber-100 text-amber-700' },
  NOT_STARTED: { label: 'Pending', cls: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700' },
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
    <Card className="h-full">
      <CardHeader className="flex-col items-stretch gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Task Overview</CardTitle>
        <div className="flex items-center gap-3">
          <TaskCustomerPicker customers={custQ.data?.items ?? []} selected={clientId} onSelect={setClientId} />
          <Link to="/admin/tasks" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
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
                  { value: data.inProgress, color: '#f59e0b' },
                  { value: data.pending, color: '#3b82f6' },
                  { value: data.completed, color: '#10b981' },
                ]}
              />
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="font-semibold tabular-nums">{data.inProgress}</span>
                  <span className="text-muted-foreground">In progress</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <span className="font-semibold tabular-nums">{data.pending}</span>
                  <span className="text-muted-foreground">Pending</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="font-semibold tabular-nums">{data.completed}</span>
                  <span className="text-muted-foreground">Completed</span>
                </li>
              </ul>
            </div>

            <div className="min-w-0 flex-1">
              {data.upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open tasks — everything is done.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.upcoming.map((t) => {
                    const pill = TASK_PILL[t.progress] ?? TASK_PILL.NOT_STARTED;
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{t.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{t.customer}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-xs text-muted-foreground">{t.dueDate ? formatDate(t.dueDate) : '—'}</span>
                          <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', pill.cls)}>{pill.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
        className="flex h-9 min-w-[190px] items-center gap-2 rounded-lg border border-input bg-card px-2.5 text-sm shadow-sm transition hover:border-ring"
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-left font-medium">{label}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[300px] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="relative border-b border-border p-2">
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
              onClick={() => { onSelect(''); setOpen(false); setQ(''); }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-secondary',
                selected === '' && 'bg-secondary'
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Users className="h-4 w-4" />
              </span>
              <span className="flex-1 font-medium">All customers</span>
              {selected === '' && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
            {filtered.map((c) => {
              const active = c.clientId === selected;
              return (
                <button
                  key={c.clientId}
                  type="button"
                  onClick={() => { onSelect(c.clientId); setOpen(false); setQ(''); }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-secondary',
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
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
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
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Total Products</CardTitle>
          {data && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
              {data.meta.total}
            </span>
          )}
        </div>
        <Link to="/admin/products" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState title="No products" description="Products you add will appear here." />
        ) : (
          <ul className="space-y-3">
            {data.items.map((p) => {
              return (
              <li key={p.id} className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
                  <ProductGlyph parts={[p.name, p.category, p.type]} className="h-[20px] w-[20px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.category || p.productCode}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    p.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  )}
                >
                  {p.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </span>
              </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
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

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Customers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent?.customers.map((c) => (
                <li key={c.clientId} className="flex items-center justify-between px-5 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{c.companyName || c.contactPerson || c.clientId}</p>
                    <p className="text-xs text-muted-foreground">{c.clientId}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!isLoading && (
            <ul className="divide-y divide-border">
              {recent?.invoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-5 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{i.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{i.customer?.companyName ?? '—'}</p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{formatCurrency(i.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Payments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!isLoading && (
            <ul className="divide-y divide-border">
              {recent?.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-5 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{p.invoice?.invoiceNumber ?? 'Payment'}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(p.paidAt)}</p>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-success">
                    {formatCurrency(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
