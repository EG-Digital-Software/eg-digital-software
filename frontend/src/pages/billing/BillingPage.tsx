import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Receipt, AlertTriangle } from 'lucide-react';
import { invoiceApi } from '@/api/resources';
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


export default function BillingPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoices', { page, debounced, tab }],
    queryFn: () => invoiceApi.list({ page, pageSize: 10, search: debounced, filter: tab }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Invoices, payments and outstanding balances"
        actions={
          <Button asChild>
            <Link to="/admin/billing/new">
              <Plus className="h-4 w-4" /> Create Invoice
            </Link>
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
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
              placeholder="Search invoice number, reference, customer, email or Client ID…"
              className="pl-9"
            />
          </div>
          {data?.meta && (
            <span className="hidden shrink-0 text-xs font-medium text-muted-foreground sm:block">
              {data.meta.total} {data.meta.total === 1 ? 'invoice' : 'invoices'}
            </span>
          )}
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
        ) : !data?.items.length ? (
          <div className="p-6">
            <EmptyState
              icon={<Receipt className="h-6 w-6" />}
              title="No invoices found"
              description={
                debounced || tab !== 'all'
                  ? 'No invoice matches this tab or search.'
                  : 'Create your first invoice for a customer.'
              }
              action={
                debounced || tab !== 'all' ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setTab('all');
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/admin/billing/new">
                      <Plus className="h-4 w-4" /> Create Invoice
                    </Link>
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
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
                      onClick={() => navigate(`/admin/billing/${inv.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Receipt className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{inv.invoiceNumber}</p>
                            {inv.reference && (
                              <p className="truncate text-xs text-muted-foreground">
                                Ref {inv.reference}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="truncate text-sm">
                          {inv.customer?.companyName ||
                            inv.customer?.contactPerson ||
                            inv.customer?.clientId ||
                            '—'}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {inv.customer?.clientId}
                        </p>
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
                          <span className="font-medium text-destructive">{formatCurrency(balance)}</span>
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
