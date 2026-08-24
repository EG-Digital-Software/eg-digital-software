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
} from 'lucide-react';
import { dashboardApi } from '@/api/resources';
import type { DashboardSummary, LicenceRow, LowStockRow } from '@/types';
import { PageHeader, StatDelta } from '@/components/shared/misc';
import { SalesChart } from './SalesChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LicenceBadge } from '@/components/shared/status';
import { EmptyState } from '@/components/shared/states';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';

function KpiCard({
  title,
  icon: Icon,
  value,
  footer,
  accent,
  to,
  hint,
}: {
  title: string;
  icon: typeof DollarSign;
  value: string;
  footer: React.ReactNode;
  accent: [string, string];
  /** Where the tile drills through to. */
  to?: string;
  /** Tooltip clarifying what the number counts. */
  hint?: string;
}) {
  const card = (
    <Card className="group relative h-full overflow-hidden hover:-translate-y-0.5 hover:shadow-card-hover">
      {/* accent wash on hover */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-1 opacity-70"
        style={{ background: `linear-gradient(90deg, ${accent[0]}, ${accent[1]})` }}
      />
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-110"
            style={{ background: `linear-gradient(135deg, ${accent[0]}, ${accent[1]})` }}
          >
            <Icon className="h-[18px] w-[18px]" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
        <div className="mt-1.5 text-xs text-muted-foreground">{footer}</div>
      </CardContent>
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

export default function DashboardPage() {
  const summaryQ = useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: dashboardApi.summary,
  });
  const licencesQ = useQuery<LicenceRow[]>({
    queryKey: ['dashboard', 'licences'],
    queryFn: dashboardApi.licences,
  });
  const lowStockQ = useQuery<LowStockRow[]>({
    queryKey: ['dashboard', 'lowStock'],
    queryFn: dashboardApi.lowStock,
  });

  const s = summaryQ.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your business performance" />

      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {summaryQ.isLoading || !s ? (
          <KpiSkeletons />
        ) : (
          <>
            <KpiCard
              title="Sales (Month)"
              icon={DollarSign}
              accent={['#6366f1', '#8b5cf6']}
              to="/admin/billing"
              hint="Value invoiced this month, paid or not (drafts and cancellations excluded)"
              value={formatCurrency(s.totalSales.current)}
              footer={
                <span className="flex items-center gap-1.5">
                  <StatDelta value={s.totalSales.changePct} /> vs last month
                </span>
              }
            />
            <KpiCard
              title="Total Customers"
              icon={Users}
              accent={['#0d9488', '#10b981']}
              to="/admin/customers"
              hint="Active customers; the delta compares new sign-ups month on month"
              value={formatNumber(s.customers.total)}
              footer={
                <span className="flex items-center gap-1.5">
                  <StatDelta value={s.customers.changePct} /> {s.customers.new} new
                </span>
              }
            />
            <KpiCard
              title="Total Products"
              icon={Package}
              accent={['#0284c7', '#38bdf8']}
              to="/admin/products"
              hint="Active products in the catalogue"
              value={formatNumber(s.products.active)}
              footer={
                s.products.lowStock > 0 ? (
                  <span className="font-medium text-[hsl(30_90%_38%)]">
                    {s.products.lowStock} low stock
                  </span>
                ) : (
                  <span>Stock levels healthy</span>
                )
              }
            />
            <KpiCard
              title="Outstanding"
              icon={FileWarning}
              accent={['#ea580c', '#f59e0b']}
              to="/admin/billing"
              hint="Total still owed across every unpaid invoice"
              value={formatCurrency(s.outstanding.amount)}
              footer={
                <span>
                  {s.outstanding.count} unpaid {s.outstanding.count === 1 ? 'invoice' : 'invoices'}
                </span>
              }
            />
            <KpiCard
              title="Overdue"
              icon={AlertTriangle}
              accent={['#dc2626', '#f87171']}
              to="/admin/billing"
              hint="Owed and already past the due date"
              value={formatCurrency(s.overdue.amount)}
              footer={
                s.overdue.count > 0 ? (
                  <span className="font-medium text-destructive">
                    {s.overdue.count} past due
                  </span>
                ) : (
                  <span>Nothing past due</span>
                )
              }
            />
            <KpiCard
              title="Expiring Licences"
              icon={KeyRound}
              accent={['#e11d48', '#fb7185']}
              to="/admin/customers"
              hint="Licences expiring within 30 days"
              value={formatNumber(s.licences.expiringSoon)}
              footer={
                <span>
                  {s.licences.expired} expired · {s.licences.active} active
                </span>
              }
            />
            <KpiCard
              title="Revenue (Month)"
              icon={TrendingUp}
              accent={['#0891b2', '#22d3ee']}
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Licence monitoring */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Licence Monitoring</CardTitle>
            <Link
              to="/admin/customers"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {licencesQ.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !licencesQ.data?.length ? (
              <div className="p-6">
                <EmptyState title="All licences healthy" description="No licences are expiring soon." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {licencesQ.data.slice(0, 8).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <p className="font-medium">{l.customer}</p>
                        <p className="text-xs text-muted-foreground">{l.clientId}</p>
                      </TableCell>
                      <TableCell className="text-sm">{l.product}</TableCell>
                      <TableCell className="text-sm">{formatDate(l.expiryDate)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {l.daysRemaining ?? '—'}
                      </TableCell>
                      <TableCell>
                        <LicenceBadge status={l.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Low stock */}
        <Card>
          <CardHeader>
            <CardTitle>Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {lowStockQ.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !lowStockQ.data?.length ? (
              <div className="p-6">
                <EmptyState title="Stock looks good" description="No products below threshold." />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {lowStockQ.data.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={p.status === 'OUT_OF_STOCK' ? 'destructive' : 'warning'}>
                        {p.available} / {p.threshold}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <RecentActivity />
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
