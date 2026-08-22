import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Search } from 'lucide-react';
import { employeeApi } from '@/api/staff-portal';
import { PageHeader } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { LicenceBadge } from '@/components/shared/status';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { formatDate } from '@/lib/utils';

const STATUSES = [
  { value: 'EXPIRING_SOON', label: 'Expiring soon' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

export default function EmployeeLicencesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['employee', 'licences'],
    queryFn: employeeApi.licences,
  });

  // The endpoint returns the full attention list in one shot, so filtering here
  // avoids a round trip per keystroke.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((l) => {
      if (status && l.status !== status) return false;
      if (!q) return true;
      return [l.customer, l.clientId, l.product, l.licence]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [data, search, status]);

  const filtered = !!(search.trim() || status);
  const clearFilters = () => {
    setSearch('');
    setStatus('');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Licence Monitoring" description="Licences expiring, critical or expired" />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, Client ID, product or licence key…"
              className="pl-9"
            />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44">
            <option value="">All statuses</option>
            {STATUSES.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </Select>
          <span className="hidden shrink-0 text-xs font-medium text-muted-foreground lg:block">
            {rows.length} {rows.length === 1 ? 'licence' : 'licences'}
          </span>
        </div>

        {isError ? (
          <div className="p-6">
            <ErrorState onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="p-6">
            <EmptyState
              icon={<KeyRound className="h-6 w-6" />}
              title={filtered ? 'No matching licences' : 'All licences healthy'}
              description={
                filtered
                  ? 'No licence matches this search or status filter.'
                  : 'No licences need attention right now.'
              }
              action={
                filtered ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Licence</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Days Left</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <p className="font-medium">{l.customer}</p>
                    <p className="text-xs text-muted-foreground">{l.clientId}</p>
                  </TableCell>
                  <TableCell className="text-sm">{l.product}</TableCell>
                  <TableCell className="font-mono text-xs">{l.licence}</TableCell>
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
      </Card>
    </div>
  );
}
