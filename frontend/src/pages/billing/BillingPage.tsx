import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Receipt, AlertTriangle, Building2 } from 'lucide-react';
import { customerApi, invoiceApi } from '@/api/resources';
import type { Invoice } from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader, Pagination } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
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
  const [clientId, setClientId] = useState('');
  const debounced = useDebounce(search);

  // Customer list that powers the client-wise filter dropdown.
  const { data: customers } = useQuery({
    queryKey: ['customers', 'billing-filter'],
    queryFn: () => customerApi.list({ page: 1, pageSize: 500 }),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoices', { page, debounced, tab, clientId }],
    queryFn: () =>
      invoiceApi.list({ page, pageSize: 25, search: debounced, filter: tab, clientId, sort: 'client' }),
  });

  // Group the page's invoices by client so each customer's invoices sit together
  // under one header (the backend already orders them client-wise).
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; name: string; clientId: string; invoices: Invoice[]; outstanding: number }
    >();
    for (const inv of data?.items ?? []) {
      const key = inv.customer?.clientId || inv.customer?.contactPerson || 'unknown';
      const name =
        inv.customer?.companyName ||
        inv.customer?.contactPerson ||
        inv.customer?.clientId ||
        'Unknown customer';
      if (!map.has(key)) {
        map.set(key, {
          key,
          name,
          clientId: inv.customer?.clientId || '',
          invoices: [],
          outstanding: 0,
        });
      }
      const g = map.get(key)!;
      g.invoices.push(inv);
      g.outstanding += Math.max(Number(inv.total) - Number(inv.amountPaid), 0);
    }
    return [...map.values()];
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Billing"
        description="Invoices grouped by client — review, track and manage balances"
        icon={Receipt}
        iconTone="primary"
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
              placeholder="Search invoice number, reference, customer, email or Customer ID…"
              className="pl-9"
            />
          </div>
          <Select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-64"
          >
            <option value="">All clients</option>
            {customers?.items.map((c) => (
              <option key={c.id} value={c.clientId}>
                {c.companyName || c.tradingAs || c.contactPerson || c.clientId}
              </option>
            ))}
          </Select>
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
                debounced || tab !== 'all' || clientId
                  ? 'No invoice matches this client, tab or search.'
                  : 'Invoices raised for customers will appear here, grouped by client.'
              }
              action={
                debounced || tab !== 'all' || clientId ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setTab('all');
                      setClientId('');
                      setPage(1);
                    }}
                  >
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
                {groups.map((group) => (
                  <Fragment key={group.key}>
                    {/* Client header — groups this customer's invoices together. */}
                    <TableRow className="bg-secondary/40 hover:bg-secondary/40">
                      <TableCell colSpan={7} className="py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Building2 className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{group.name}</p>
                              {group.clientId && (
                                <p className="truncate font-mono text-xs text-muted-foreground">
                                  {group.clientId}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-4 text-xs">
                            <span className="text-muted-foreground">
                              {group.invoices.length}{' '}
                              {group.invoices.length === 1 ? 'invoice' : 'invoices'}
                            </span>
                            {group.outstanding > 0 ? (
                              <span className="font-semibold text-destructive">
                                {formatCurrency(group.outstanding)} outstanding
                              </span>
                            ) : (
                              <span className="font-medium text-success">Settled</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>

                    {group.invoices.map((inv) => {
                      const balance = Number(inv.total) - Number(inv.amountPaid);
                      const overdue = daysOverdue(inv);
                      return (
                        <TableRow
                          key={inv.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/admin/billing/${inv.id}`)}
                        >
                          <TableCell className="pl-6">
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
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
