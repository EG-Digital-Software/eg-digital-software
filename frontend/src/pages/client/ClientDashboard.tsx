import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FileWarning,
  CheckCircle2,
  Package,
  ArrowRight,
  AlertTriangle,
  ListChecks,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';
import { clientApi } from '@/api/client-portal';
import { clientTaskApi } from '@/api/tasks';
import { useAuth } from '@/store/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LicenceBadge, InvoiceBadge } from '@/components/shared/status';
import { EmptyState } from '@/components/shared/states';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { HeroWave, HeroHealthCluster } from '@/components/shared/HeroHealth';
import { ProductGlyph } from '@/lib/product-icon';
import headphonesArt from '@/assets/headphones.png';

// Soft pastel tones for the stat-card icon tiles (matches the reference).
const TONES: Record<string, { tile: string; link: string }> = {
  violet: { tile: 'bg-violet-100 text-violet-600', link: 'text-violet-600' },
  emerald: { tile: 'bg-emerald-100 text-emerald-600', link: 'text-emerald-600' },
  blue: { tile: 'bg-blue-100 text-blue-600', link: 'text-blue-600' },
  amber: { tile: 'bg-amber-100 text-amber-600', link: 'text-amber-600' },
  rose: { tile: 'bg-rose-100 text-rose-600', link: 'text-rose-600' },
};

function StatCard({
  title,
  icon: Icon,
  value,
  sub,
  to,
  tone,
}: {
  title: string;
  icon: ComponentType<LucideProps>;
  value: string;
  sub?: React.ReactNode;
  to: string;
  tone: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <Card className="flex flex-col justify-between p-5 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', t.tile)}>
          <Icon className="h-[22px] w-[22px]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        </div>
      </div>
      <Link
        to={to}
        className={cn('mt-4 inline-flex items-center gap-1 text-sm font-medium hover:gap-1.5 transition-all', t.link)}
      >
        View all <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </Card>
  );
}

/** Multi-segment donut used by the Tasks Overview card. */
function Donut({ total, segments }: { total: number; segments: { value: number; color: string }[] }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
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

// Account status → health score shown by the hero donut.
const ACCOUNT_HEALTH: Record<string, { pct: number; label: string }> = {
  ACTIVE: { pct: 98, label: 'Excellent' },
  ACTIVE_TRIAL: { pct: 90, label: 'Trial' },
  DORMANT: { pct: 68, label: 'Fair' },
  SUSPENDED: { pct: 34, label: 'At risk' },
};

const TASK_PILL: Record<string, { label: string; cls: string }> = {
  IN_PROGRESS: { label: 'In progress', cls: 'bg-amber-100 text-amber-700' },
  ONGOING: { label: 'In progress', cls: 'bg-amber-100 text-amber-700' },
  NOT_STARTED: { label: 'Pending', cls: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700' },
};

export default function ClientDashboard() {
  const user = useAuth((s) => s.user);
  const dashQ = useQuery({ queryKey: ['client', 'dashboard'], queryFn: clientApi.dashboard });
  const tasksQ = useQuery({ queryKey: ['client', 'tasks', 'summary'], queryFn: () => clientTaskApi().board() });
  const allTasks = (tasksQ.data?.buckets ?? []).flatMap((b) => b.tasks);
  const activeTasks = allTasks.filter((t) => t.progress !== 'COMPLETED').length;
  const tInProgress = allTasks.filter((t) => t.progress === 'IN_PROGRESS' || t.progress === 'ONGOING').length;
  const tPending = allTasks.filter((t) => t.progress === 'NOT_STARTED').length;
  const tCompleted = allTasks.filter((t) => t.progress === 'COMPLETED').length;
  const upcomingTasks = allTasks
    .filter((t) => t.progress !== 'COMPLETED')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, 4);
  const invQ = useQuery({
    queryKey: ['client', 'invoices', 'recent'],
    queryFn: () => clientApi.invoices({ pageSize: 5 }),
  });
  const prodQ = useQuery({ queryKey: ['client', 'products'], queryFn: clientApi.products });
  const profileQ = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });

  const d = dashQ.data;
  const acctStatus = profileQ.data?.accountStatusEffective ?? profileQ.data?.accountStatus;
  const health = (acctStatus && ACCOUNT_HEALTH[acctStatus]) ?? ACCOUNT_HEALTH.ACTIVE;
  const displayName =
    profileQ.data?.companyName?.trim() ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    'there';

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#eaf1ff] via-[#f3f7ff] to-[#e9f6ef] p-6 sm:p-8">
        {/* Blue wave background graphic — fitted to the right and faded to the left */}
        <HeroWave />
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
              Welcome back, {displayName} <span className="align-middle">👋</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Here’s an overview of your invoices, products and account.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link to="/client/invoices">View invoices</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/client/licences">Explore products</Link>
              </Button>
            </div>
          </div>

          {/* Account Health floating cluster (shield · donut · chart) */}
          <HeroHealthCluster title="Account Health" pct={health.pct} label={health.label} />
        </div>
      </div>

      {/* Stat cards — existing KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {dashQ.isLoading || !d ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="p-5">
              <div className="space-y-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-20" />
              </div>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title="Products"
              icon={Package}
              tone="violet"
              to="/client/licences"
              value={String(d.products)}
              sub="assigned to you"
            />
            <StatCard
              title="Active Task"
              icon={ListChecks}
              tone="blue"
              to="/client/tasks"
              value={String(activeTasks)}
              sub="tasks in progress"
            />
            <StatCard
              title="Total Paid"
              icon={CheckCircle2}
              tone="emerald"
              to="/client/invoices"
              value={formatCurrency(d.totalPaid)}
              sub={`${d.invoices} invoice${d.invoices === 1 ? '' : 's'} total`}
            />
            <StatCard
              title="Outstanding"
              icon={FileWarning}
              tone="amber"
              to="/client/invoices"
              value={formatCurrency(d.outstanding.amount)}
              sub={`${d.outstanding.count} unpaid`}
            />
            <StatCard
              title="Overdue"
              icon={AlertTriangle}
              tone="rose"
              to="/client/invoices"
              value={formatCurrency(d.overdue.amount)}
              sub={d.overdue.count > 0 ? `${d.overdue.count} past due` : 'Nothing past due'}
            />
          </>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent invoices */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Invoices</CardTitle>
            <Link to="/client/invoices" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {invQ.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !invQ.data?.items.length ? (
              <div className="p-6">
                <EmptyState title="No invoices yet" description="Your invoices will appear here." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invQ.data.items.map((inv) => (
                    <TableRow key={inv.id} className="cursor-pointer">
                      <TableCell>
                        <Link to={`/client/invoices/${inv.id}`} className="font-medium hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(inv.dueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(inv.total)}</TableCell>
                      <TableCell>
                        <InvoiceBadge status={inv.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Product status */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Product Status</CardTitle>
            <Link to="/client/licences" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {prodQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !prodQ.data?.length ? (
              <EmptyState title="No products" description="Your licences will appear here." />
            ) : (
              <ul className="space-y-3">
                {prodQ.data.slice(0, 6).map((p) => {
                  return (
                  <li key={p.id} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
                      <ProductGlyph parts={[p.product]} className="h-[20px] w-[20px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.product}</p>
                      <p className="text-xs text-muted-foreground">Expires {formatDate(p.expiryDate)}</p>
                    </div>
                    <LicenceBadge status={p.status} />
                  </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tasks overview + Need help */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Tasks Overview</CardTitle>
            <Link to="/client/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all tasks <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              {/* Donut + legend */}
              <div className="flex items-center gap-5">
                <Donut
                  total={allTasks.length}
                  segments={[
                    { value: tInProgress, color: '#f59e0b' },
                    { value: tPending, color: '#3b82f6' },
                    { value: tCompleted, color: '#10b981' },
                  ]}
                />
                <ul className="space-y-2.5 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    <span className="font-semibold tabular-nums">{tInProgress}</span>
                    <span className="text-muted-foreground">In progress</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                    <span className="font-semibold tabular-nums">{tPending}</span>
                    <span className="text-muted-foreground">Pending</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="font-semibold tabular-nums">{tCompleted}</span>
                    <span className="text-muted-foreground">Completed</span>
                  </li>
                </ul>
              </div>

              {/* Upcoming task list */}
              <div className="min-w-0 flex-1">
                {upcomingTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open tasks — you’re all caught up.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {upcomingTasks.map((t) => {
                      const pill = TASK_PILL[t.progress] ?? TASK_PILL.NOT_STARTED;
                      return (
                        <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{t.title}</p>
                            <span className={cn('mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium', pill.cls)}>
                              {pill.label}
                            </span>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t.dueDate ? formatDate(t.dueDate) : '—'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Need help */}
        <Card className="relative overflow-hidden">
          {/* Headphones illustration — anchored to the bottom-right, fully visible */}
          <img
            src={headphonesArt}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 -right-1 z-0 h-60 w-60 select-none object-contain object-right-bottom drop-shadow-lg sm:h-64 sm:w-64"
          />
          <CardContent className="relative z-10 flex h-full min-h-[248px] flex-col pt-6">
            <div>
              <h3 className="text-lg font-semibold">Need Help?</h3>
              <p className="mt-1 text-sm text-muted-foreground">We’re here to help you 24/7.</p>
            </div>
            <div className="mt-auto max-w-[180px] space-y-2">
              <Button className="w-full" asChild>
                <a href="mailto:support@egdigital.com.au?subject=Support%20request">Create a Ticket</a>
              </Button>
              <Button variant="outline" className="w-full bg-card/80 backdrop-blur" asChild>
                <a href="mailto:support@egdigital.com.au?subject=Knowledge%20base%20enquiry">Browse Knowledge Base</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
