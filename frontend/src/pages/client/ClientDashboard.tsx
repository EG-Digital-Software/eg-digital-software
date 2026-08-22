import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FileWarning,
  CheckCircle2,
  KeyRound,
  Package,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { useAuth } from '@/store/auth';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LicenceBadge, InvoiceBadge } from '@/components/shared/status';
import { EmptyState } from '@/components/shared/states';
import { formatCurrency, formatDate } from '@/lib/utils';

function Kpi({
  title,
  icon: Icon,
  value,
  sub,
  tone,
  to,
}: {
  title: string;
  icon: typeof FileWarning;
  value: string;
  sub?: React.ReactNode;
  tone?: string;
  /** Where the tile drills through to. */
  to?: string;
}) {
  const card = (
    <Card className="h-full transition-shadow hover:shadow-card-hover">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone ?? 'bg-primary/10 text-primary'}`}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
  return to ? (
    <Link to={to} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

export default function ClientDashboard() {
  const user = useAuth((s) => s.user);
  const dashQ = useQuery({ queryKey: ['client', 'dashboard'], queryFn: clientApi.dashboard });
  const invQ = useQuery({
    queryKey: ['client', 'invoices', 'recent'],
    queryFn: () => clientApi.invoices({ pageSize: 5 }),
  });
  const prodQ = useQuery({ queryKey: ['client', 'products'], queryFn: clientApi.products });

  const d = dashQ.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.firstName ?? ''}`}
        description="Your invoices, licences and account overview"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {dashQ.isLoading || !d ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-28" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Kpi
              title="Outstanding"
              icon={FileWarning}
              to="/client/invoices"
              value={formatCurrency(d.outstanding.amount)}
              sub={`${d.outstanding.count} unpaid invoice${d.outstanding.count === 1 ? '' : 's'}`}
              tone="bg-warning/10 text-[hsl(30_90%_38%)]"
            />
            <Kpi
              title="Overdue"
              icon={AlertTriangle}
              to="/client/invoices"
              value={formatCurrency(d.overdue.amount)}
              sub={
                d.overdue.count > 0 ? (
                  <span className="font-medium text-destructive">
                    {d.overdue.count} past due — please pay
                  </span>
                ) : (
                  'Nothing past due'
                )
              }
              tone="bg-destructive/10 text-destructive"
            />
            <Kpi
              title="Total Paid"
              icon={CheckCircle2}
              to="/client/invoices"

              value={formatCurrency(d.totalPaid)}
              sub={`${d.invoices} invoice${d.invoices === 1 ? '' : 's'} total`}
              tone="bg-success/10 text-success"
            />
            <Kpi
              title="Active Licences"
              icon={KeyRound}
              to="/client/licences"

              value={String(d.licences.active)}
              sub={`${d.licences.expiringSoon} expiring · ${d.licences.expired} expired`}
            />
            <Kpi
              title="Products"
              icon={Package}
              to="/client/licences"
              value={String(d.products)}
              sub="assigned to you"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent invoices */}
        <Card>
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

        {/* Licences */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Your Licences</CardTitle>
            <Link to="/client/licences" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {prodQ.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !prodQ.data?.length ? (
              <div className="p-6">
                <EmptyState title="No products" description="Your licences will appear here." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prodQ.data.slice(0, 5).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.product}</TableCell>
                      <TableCell className="text-sm">{formatDate(p.expiryDate)}</TableCell>
                      <TableCell>
                        <LicenceBadge status={p.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
