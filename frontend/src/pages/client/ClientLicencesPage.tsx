import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Search } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { useDebounce } from '@/hooks/useDebounce';
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
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRING_SOON', label: 'Expiring soon' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

export default function ClientLicencesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['client', 'products', { debounced, status }],
    queryFn: () => clientApi.products({ search: debounced, status }),
  });

  const filtered = !!(debounced || status);
  const clearFilters = () => {
    setSearch('');
    setStatus('');
  };

  // Renewal-attention count, so an expiring licence is not buried in the table.
  const needsAttention =
    data?.filter((p) => p.status === 'EXPIRING_SOON' || p.status === 'CRITICAL' || p.status === 'EXPIRED')
      .length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products & Licences"
        description="Your assigned products and licence status"
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, SKU or licence key…"
              className="pl-9"
            />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {!filtered && needsAttention > 0 && (
          <div className="border-b border-border bg-warning/10 px-5 py-3 text-sm font-medium text-[hsl(30_90%_38%)]">
            {needsAttention} {needsAttention === 1 ? 'licence needs' : 'licences need'} attention —
            expiring soon or already expired.
          </div>
        )}

        {isError ? (
          <div className="p-6">
            <ErrorState onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data?.length ? (
          <div className="p-6">
            <EmptyState
              icon={<KeyRound className="h-6 w-6" />}
              title={filtered ? 'No matching licences' : 'No products'}
              description={
                filtered
                  ? 'No licence matches this search or status filter.'
                  : 'You have no assigned products yet.'
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
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Licence Key</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Days Left</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.product}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.sku}</TableCell>
                  <TableCell className="font-mono text-xs">{p.licence}</TableCell>
                  <TableCell className="text-center tabular-nums">{p.quantity}</TableCell>
                  <TableCell className="text-sm">{formatDate(p.issueDate)}</TableCell>
                  <TableCell className="text-sm">{formatDate(p.expiryDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.daysRemaining == null ? (
                      '—'
                    ) : p.daysRemaining < 0 ? (
                      <span className="font-medium text-destructive">
                        {Math.abs(p.daysRemaining)} overdue
                      </span>
                    ) : (
                      p.daysRemaining
                    )}
                  </TableCell>
                  <TableCell>
                    <LicenceBadge status={p.status} />
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
