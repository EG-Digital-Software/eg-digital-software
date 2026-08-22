import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Users, UserCheck, KeyRound, AlertTriangle, ArrowRight } from 'lucide-react';
import { employeeApi } from '@/api/staff-portal';
import { useAuth } from '@/store/auth';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LicenceBadge } from '@/components/shared/status';
import { EmptyState } from '@/components/shared/states';
import { formatNumber, formatDate } from '@/lib/utils';

function Kpi({ title, icon: Icon, value, tone }: { title: string; icon: typeof Users; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone ?? 'bg-primary/10 text-primary'}`}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function EmployeeDashboard() {
  const user = useAuth((s) => s.user);
  const dashQ = useQuery({ queryKey: ['employee', 'dashboard'], queryFn: employeeApi.dashboard });
  const licQ = useQuery({ queryKey: ['employee', 'licences'], queryFn: employeeApi.licences });
  const d = dashQ.data;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user?.firstName ?? ''}`} description="Operational overview — customers and licence monitoring" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashQ.isLoading || !d ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Kpi title="Customers" icon={Users} value={formatNumber(d.customers)} />
            <Kpi title="Active Customers" icon={UserCheck} value={formatNumber(d.activeCustomers)} tone="bg-success/10 text-success" />
            <Kpi title="Expiring Licences" icon={KeyRound} value={formatNumber(d.expiringLicences)} tone="bg-warning/10 text-[hsl(30_90%_38%)]" />
            <Kpi title="Low Stock Items" icon={AlertTriangle} value={formatNumber(d.lowStock)} tone="bg-destructive/10 text-destructive" />
          </>
        )}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Licences needing attention</CardTitle>
          <Link to="/employee/licences" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {licQ.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !licQ.data?.length ? (
            <div className="p-6">
              <EmptyState title="All licences healthy" description="No licences need attention." />
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
                {licQ.data.slice(0, 8).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <p className="font-medium">{l.customer}</p>
                      <p className="text-xs text-muted-foreground">{l.clientId}</p>
                    </TableCell>
                    <TableCell className="text-sm">{l.product}</TableCell>
                    <TableCell className="text-sm">{formatDate(l.expiryDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.daysRemaining ?? '—'}</TableCell>
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
    </div>
  );
}
