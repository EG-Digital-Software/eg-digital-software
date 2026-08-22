import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Receipt, Search, AlertTriangle } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader, Pagination } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { InvoiceBadge } from '@/components/shared/status';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { formatCurrency, formatDate, daysOverdue } from '@/lib/utils';


export default function ClientInvoicesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['client', 'invoices', { page, tab, debounced }],
    queryFn: () => clientApi.invoices({ page, pageSize: 10, filter: tab, search: debounced }),
  });

  const filtered = !!(debounced || tab !== 'all');
  const clearFilters = () => {
    setSearch('');
    setTab('all');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" description="View and pay your invoices" />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search invoice number or reference…"
              className="pl-9"
            />
          </div>
        </div>

        {/* Balance across the whole filtered set, not just this page. */}
        {data?.meta && data.meta.balance > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-border bg-secondary/30 px-4 py-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Balance due
            </span>
            <span className="text-lg font-semibold tabular-nums text-destructive">
              {formatCurrency(data.meta.balance)}
            </span>
            <span className="text-xs text-muted-foreground">
              across {data.meta.total} {data.meta.total === 1 ? 'invoice' : 'invoices'}
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
              icon={<Receipt className="h-6 w-6" />}
              title="No invoices found"
              description={
                filtered
                  ? 'No invoice matches this tab or search.'
                  : 'Your invoices will appear here once they are issued.'
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
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((inv) => {
                  const balance = Number(inv.total) - Number(inv.amountPaid);
                  const overdue = daysOverdue(inv);
                  return (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/client/invoices/${inv.id}`)}
                    >
                      <TableCell>
                        <p className="font-medium">{inv.invoiceNumber}</p>
                        {inv.reference && (
                          <p className="text-xs text-muted-foreground">Ref {inv.reference}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(inv.invoiceDate)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(inv.dueDate)}
                        {overdue > 0 && (
                          <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            {overdue} {overdue === 1 ? 'day' : 'days'} overdue
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(inv.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatCurrency(inv.amountPaid)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {balance > 0 ? (
                          <span className="font-medium text-destructive">
                            {formatCurrency(balance)}
                          </span>
                        ) : (
                          <span className="text-success">Settled</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <InvoiceBadge status={inv.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
