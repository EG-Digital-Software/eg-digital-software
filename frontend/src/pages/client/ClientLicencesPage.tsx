import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Search, Plus } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { apiErrorMessage } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { LicenceBadge } from '@/components/shared/status';
import { EmptyState, ErrorState, Spinner } from '@/components/shared/states';
import { formatDate, formatCurrency } from '@/lib/utils';

const STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRING_SOON', label: 'Expiring soon' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

export default function ClientLicencesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['client', 'products', { debounced, status }],
    queryFn: () => clientApi.products({ search: debounced, status }),
  });

  const { data: available } = useQuery({
    queryKey: ['client', 'available-products'],
    queryFn: clientApi.availableProducts,
    enabled: addOpen,
  });
  const addMut = useMutation({
    mutationFn: () => clientApi.addProduct(selected),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', 'products'] });
      toast.success('Product added — pending admin approval');
      setAddOpen(false);
      setSelected('');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
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
        icon={KeyRound}
        iconTone="emerald"
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
          <Button onClick={() => setAddOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4" /> Add Product
          </Button>
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
          <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap text-center">Product</TableHead>
                <TableHead className="whitespace-nowrap text-center">Licence Key</TableHead>
                <TableHead className="whitespace-nowrap text-center">Issued</TableHead>
                <TableHead className="whitespace-nowrap text-center">Expiry</TableHead>
                <TableHead className="whitespace-nowrap text-center">Days Left</TableHead>
                <TableHead className="whitespace-nowrap text-center">Agreed Price</TableHead>
                <TableHead className="whitespace-nowrap text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-center font-medium">{p.product}</TableCell>
                  <TableCell className="whitespace-nowrap text-center text-sm tracking-wide">{p.licence}</TableCell>
                  <TableCell className="whitespace-nowrap text-center text-sm">{formatDate(p.issueDate)}</TableCell>
                  <TableCell className="whitespace-nowrap text-center text-sm">{formatDate(p.expiryDate)}</TableCell>
                  <TableCell className="whitespace-nowrap text-center text-sm tabular-nums">
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
                  <TableCell className="whitespace-nowrap text-center text-sm font-medium tabular-nums">{formatCurrency(p.price)}</TableCell>
                  <TableCell className="text-center">
                    {p.pending ? <Badge variant="warning">Pending</Badge> : <LicenceBadge status={p.status} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </Card>

      {/* Add a product — goes to the admin as a pending request. */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose a product to add. It will be sent to the admin for approval and shown as
              <span className="font-medium"> Pending</span> until approved.
            </p>
            <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select a product…</option>
              {available?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={!selected || addMut.isPending} onClick={() => addMut.mutate()}>
              {addMut.isPending && <Spinner />} Add for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
