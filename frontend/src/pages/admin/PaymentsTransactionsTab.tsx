import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Wallet, Receipt } from 'lucide-react';
import { paymentApi, type PaymentRow } from '@/api/resources';
import { useDebounce } from '@/hooks/useDebounce';
import { Pagination } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS_VARIANT: Record<PaymentRow['status'], 'success' | 'warning' | 'destructive' | 'muted'> = {
  SUCCESS: 'success',
  PENDING: 'warning',
  FAILED: 'destructive',
  REFUNDED: 'muted',
  CANCELLED: 'muted',
};

function customerName(p: PaymentRow): string {
  const c = p.invoice?.customer;
  if (!c) return '—';
  return c.companyName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.clientId;
}

/** Every payment across every invoice — the money-in view. */
export function PaymentsTransactionsTab() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', { page, debounced, status, method }],
    queryFn: () => paymentApi.list({ page, pageSize: 10, search: debounced, status, method }),
  });
  const { data: methods } = useQuery({
    queryKey: ['payments', 'methods'],
    queryFn: paymentApi.methods,
  });

  const filtered = !!(debounced || status || method);
  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setMethod('');
    setPage(1);
  };

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search invoice, customer, Client ID or transaction ID…"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">All statuses</option>
          {(['SUCCESS', 'PENDING', 'FAILED', 'REFUNDED', 'CANCELLED'] as const).map((st) => (
            <option key={st} value={st}>
              {st.charAt(0) + st.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
        <Select
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">All methods</option>
          {methods?.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </div>

      {/* Collected total reflects the current filter, not just this page. */}
      {data?.meta && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-border bg-secondary/30 px-4 py-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Collected</span>
          <span className="text-lg font-semibold tabular-nums text-success">
            {formatCurrency(data.meta.collected ?? 0)}
          </span>
          <span className="text-xs text-muted-foreground">
            {data.meta.total} {data.meta.total === 1 ? 'payment' : 'payments'}
            {filtered ? ' matching these filters' : ' in total'}
          </span>
        </div>
      )}

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
      ) : !data?.items.length ? (
        <div className="p-6">
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title="No payments found"
            description={
              filtered
                ? 'No payment matches these filters.'
                : 'Payments appear here as soon as invoices are paid — online or recorded manually.'
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
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((p) => (
                <TableRow
                  key={p.id}
                  className={p.invoice ? 'cursor-pointer' : undefined}
                  onClick={() => p.invoice && navigate(`/admin/billing/${p.invoice.id}`)}
                >
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(p.paidAt ?? p.createdAt)}
                    {!p.paidAt && <p className="text-xs text-muted-foreground">not settled</p>}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Receipt className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{p.invoice?.invoiceNumber ?? '—'}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <p className="truncate text-sm">{customerName(p)}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {p.invoice?.customer?.clientId}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{p.paymentMethod ?? '—'}</TableCell>
                  <TableCell>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {p.transactionId ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">via {p.provider}</p>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCurrency(p.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[p.status]}>
                      {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination meta={data.meta} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}
