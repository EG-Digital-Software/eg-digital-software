import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { employeeApi } from '@/api/staff-portal';
import { useAuth } from '@/store/auth';
import { healthLabel } from '@/components/shared/HeroHealth';
import { Skeleton } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LicenceBadge } from '@/components/shared/status';
import { EmptyState } from '@/components/shared/states';
import { formatNumber, formatDate } from '@/lib/utils';

function Kpi({ title, value, color }: { title: string; value: string; color?: string }) {
  return (
    <div className="glass card" style={{ padding: 16 }}>
      <div className="eyebrow">{title}</div>
      <div className="disp stat" style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color }}>
        {value}
      </div>
    </div>
  );
}

export default function EmployeeDashboard() {
  const user = useAuth((s) => s.user);
  const dashQ = useQuery({ queryKey: ['employee', 'dashboard'], queryFn: employeeApi.dashboard });
  const licQ = useQuery({ queryKey: ['employee', 'licences'], queryFn: employeeApi.licences });
  const d = dashQ.data;

  // Portfolio health = share of customers that are active.
  const healthPct = d && d.customers > 0 ? Math.round((d.activeCustomers / d.customers) * 100) : 100;

  return (
    <div className="ec-page">
      {/* Hero */}
      <div className="up" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <div className="eyebrow">Team portal</div>
          <h1 className="disp ec-hero-h1">Welcome, {user?.firstName ?? ''}</h1>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            Operational overview — customers and licence monitoring.
          </p>
        </div>
        {d && (
          <span className={`chip ${healthPct >= 80 ? 'c-ok' : healthPct >= 50 ? 'c-warn' : 'c-red'}`}>
            <span className="dot" />
            Portfolio health {healthPct}% · {healthLabel(healthPct)}
          </span>
        )}
      </div>

      <div className="stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {dashQ.isLoading || !d ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="glass skel" style={{ height: 88 }} />)
        ) : (
          <>
            <Kpi title="Customers" value={formatNumber(d.customers)} />
            <Kpi title="Active customers" value={formatNumber(d.activeCustomers)} color="var(--okT)" />
            <Kpi title="Expiring licences" value={formatNumber(d.expiringLicences)} color="var(--wT)" />
            <Kpi title="Low stock items" value={formatNumber(d.lowStock)} color="var(--rT)" />
          </>
        )}
      </div>

      <section className="glass up" style={{ animationDelay: '.12s', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid rgba(var(--w),.06)' }}>
          <h2 className="disp" style={{ margin: 0, fontSize: 18 }}>Licences needing attention</h2>
          <Link to="/employee/licences" className="btn bg sm">
            View all <ArrowRight />
          </Link>
        </div>
        <div>
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
        </div>
      </section>
    </div>
  );
}
