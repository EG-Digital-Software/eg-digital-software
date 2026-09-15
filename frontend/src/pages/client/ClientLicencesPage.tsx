import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Search, Plus, Eye } from 'lucide-react';
import { clientApi, type ClientProduct } from '@/api/client-portal';
import { apiErrorMessage } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { LicenceBadge } from '@/components/shared/status';
import { EmptyState, ErrorState, Spinner } from '@/components/shared/states';
import { formatDate, formatCurrency } from '@/lib/utils';
import { ProductGlyph } from '@/lib/product-icon';

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
  const [viewing, setViewing] = useState<ClientProduct | null>(null);
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

  // Only show the Unit/Hours column when at least one product has it enabled.
  const showUnit = data?.some((p) => p.unitHoursEnabled) ?? false;

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
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap text-center">Product</TableHead>
                <TableHead className="whitespace-nowrap text-center">Licence Key</TableHead>
                <TableHead className="whitespace-nowrap text-center">Issued</TableHead>
                <TableHead className="whitespace-nowrap text-center">Expiry</TableHead>
                <TableHead className="whitespace-nowrap text-center">Days Left</TableHead>
                <TableHead className="whitespace-nowrap text-center">Agreed Price</TableHead>
                {showUnit && <TableHead className="whitespace-nowrap text-center">Unit/Hours</TableHead>}
                <TableHead className="whitespace-nowrap text-center">Net Amount</TableHead>
                <TableHead className="whitespace-nowrap text-center">Contract</TableHead>
                <TableHead className="whitespace-nowrap text-center">GST</TableHead>
                <TableHead className="whitespace-nowrap text-center">Status</TableHead>
                <TableHead className="whitespace-nowrap text-center">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => {
                return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
                        <ProductGlyph parts={[p.product]} className="h-[18px] w-[18px]" />
                      </span>
                      {p.product}
                    </div>
                  </TableCell>
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
                  {showUnit && (
                    <TableCell className="whitespace-nowrap text-center text-sm tabular-nums">
                      {p.unitHoursEnabled ? (Number(p.unitHours) || 0) : '—'}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap text-center text-sm font-medium tabular-nums">{formatCurrency((Number(p.price) || 0) * (p.unitHoursEnabled ? Number(p.unitHours) || 0 : 1))}</TableCell>
                  <TableCell className="whitespace-nowrap text-center text-sm capitalize">{(p.contractType ?? 'LOCKED').toLowerCase()}</TableCell>
                  <TableCell className="whitespace-nowrap text-center text-sm capitalize">{(p.gstType ?? 'EXCLUSIVE').toLowerCase()}</TableCell>
                  <TableCell className="text-center">
                    {p.pending ? <Badge variant="warning">Pending</Badge> : <LicenceBadge status={p.status} />}
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      onClick={() => setViewing(p)}
                      title="View full details"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
                );
              })}
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

      <LicenceDetailsDialog product={viewing} onOpenChange={(v) => !v && setViewing(null)} />
    </div>
  );
}

/** Read-only full details of one assigned product/licence for the client. */
function LicenceDetailsDialog({
  product,
  onOpenChange,
}: {
  product: ClientProduct | null;
  onOpenChange: (v: boolean) => void;
}) {
  const unitOn = !!product?.unitHoursEnabled;
  const unitVal = unitOn ? Number(product?.unitHours) || 0 : 1;
  const net = (Number(product?.price) || 0) * unitVal;
  // GST is fixed at 10%; INCLUSIVE means it is already in the agreed price.
  const gst = product?.gstType === 'INCLUSIVE' ? 0 : net * 0.1;
  const total = net + gst;

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Licence details</DialogTitle>
          <DialogDescription>Full details of this product and its licence.</DialogDescription>
        </DialogHeader>
        {product && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card">
                <ProductGlyph parts={[product.product]} className="h-[24px] w-[24px]" />
              </span>
              <div>
                <p className="text-lg font-semibold">{product.product}</p>
                <p className="text-sm text-muted-foreground">{product.sku}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Detail label="Licence Key" value={product.licence} mono />
              <Detail
                label="Status"
                value={product.pending ? 'Pending approval' : (product.status ?? '').replace(/_/g, ' ')}
                className="capitalize"
              />
              <Detail label="Contract" value={(product.contractType ?? 'LOCKED').toLowerCase()} className="capitalize" />
              <Detail label="GST" value={(product.gstType ?? 'EXCLUSIVE').toLowerCase()} className="capitalize" />
              <Detail label="Unit/Hours" value={unitOn ? String(unitVal) : 'Off'} />
              <Detail label="Agreed Price" value={formatCurrency(product.price)} />
              <Detail label="Issued" value={formatDate(product.issueDate)} />
              <Detail label="Expiry" value={formatDate(product.expiryDate)} />
              <Detail
                label="Days Left"
                value={
                  product.daysRemaining == null
                    ? '—'
                    : product.daysRemaining < 0
                      ? `${Math.abs(product.daysRemaining)} overdue`
                      : String(product.daysRemaining)
                }
              />
            </div>
            <div className="space-y-1 rounded-lg border border-border bg-secondary/30 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Net amount</span><span className="tabular-nums">{formatCurrency(net)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GST (10%)</span><span className="tabular-nums">{formatCurrency(gst)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-medium"><span>Total</span><span className="tabular-nums">{formatCurrency(total)}</span></div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One label/value pair used in the details dialog. */
function Detail({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-medium ${mono ? 'font-mono tracking-wide' : ''} ${className ?? ''}`}>{value}</p>
    </div>
  );
}
