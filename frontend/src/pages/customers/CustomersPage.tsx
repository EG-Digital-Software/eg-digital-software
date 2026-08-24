import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, MoreHorizontal, Eye, Pencil, Archive, Users } from 'lucide-react';
import { toast } from 'sonner';
import { customerApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import type { Customer } from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader, Pagination } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BUSINESS_TYPES, businessTypeLabel } from '@/lib/customer';
import { Flag } from '@/components/shared/PhoneInput';
import { countryCodeByName } from '@/lib/countries';

function invoiceSummary(c: Customer): { label: string; variant: 'success' | 'warning' | 'muted' } {
  const invs = c.invoices ?? [];
  if (!invs.length) return { label: 'No invoices', variant: 'muted' };
  const outstanding = invs.filter((i) => Number(i.total) > Number(i.amountPaid)).length;
  return outstanding
    ? { label: `${outstanding} outstanding`, variant: 'warning' }
    : { label: 'Paid', variant: 'success' };
}

/** Principal address is the customer's real-world location; fall back to billing. */
function location(c: Customer) {
  const a =
    c.addresses?.find((x) => x.type === 'PRINCIPAL') ??
    c.addresses?.find((x) => x.type === 'BILLING');
  if (!a?.city && !a?.country) return null;
  return { city: a?.city ?? '', country: a?.country ?? '', code: countryCodeByName(a?.country) };
}

export default function CustomersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [businessType, setBusinessType] = useState('');
  const [archiving, setArchiving] = useState<Customer | null>(null);
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', { page, debounced, status, businessType }],
    queryFn: () =>
      customerApi.list({
        page,
        pageSize: 10,
        search: debounced,
        status,
        ...(businessType ? { businessType } : {}),
      }),
  });

  const archive = useMutation({
    mutationFn: (clientId: string) => customerApi.archive(clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer archived');
      setArchiving(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Manage your clients, products and licences"
        actions={
          <Button asChild>
            <Link to="/admin/customers/new">
              <Plus className="h-4 w-4" /> Add Customer
            </Link>
          </Button>
        }
      />

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
              placeholder="Search by name, business, email, ABN, contact or Client ID…"
              className="pl-9"
            />
          </div>
          <Select
            value={businessType}
            onChange={(e) => {
              setBusinessType(e.target.value);
              setPage(1);
            }}
            className="sm:w-52"
          >
            <option value="">All business types</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="sm:w-36"
          >
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
          {data?.meta && (
            <span className="hidden shrink-0 text-xs font-medium text-muted-foreground lg:block">
              {data.meta.total} {data.meta.total === 1 ? 'customer' : 'customers'}
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
              icon={<Users className="h-6 w-6" />}
              title="No customers found"
              description={
                debounced || businessType
                  ? 'No customer matches these filters. Try clearing the search or business type.'
                  : 'Add your first customer to start managing clients.'
              }
              action={
                debounced || businessType ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setBusinessType('');
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/admin/customers/new">
                      <Plus className="h-4 w-4" /> Add Customer
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
                  <TableHead>Client ID</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Invoices</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((c) => {
                  const inv = invoiceSummary(c);
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/admin/customers/${c.clientId}`)}
                    >
                      <TableCell>
                        <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                          {c.clientId}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.companyName ? (
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.companyName}</p>
                            {c.tradingAs && c.tradingAs !== c.companyName && (
                              <p className="truncate text-xs text-muted-foreground">
                                t/a {c.tradingAs}
                              </p>
                            )}
                            {c.businessType && (
                              <Badge variant="muted" className="mt-1">
                                {businessTypeLabel(c.businessType)}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(() => {
                          const loc = location(c);
                          if (!loc) return '—';
                          return (
                            <span className="flex items-center gap-1.5">
                              <Flag code={loc.code} />
                              <span className="truncate">{loc.city || loc.country}</span>
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={inv.variant}>{inv.label}</Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/admin/customers/${c.clientId}`)}>
                              <Eye /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => navigate(`/admin/customers/${c.clientId}/edit`)}
                            >
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onClick={() => setArchiving(c)}>
                              <Archive /> Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(v) => !v && setArchiving(null)}
        title="Archive customer?"
        description={`${archiving?.companyName || archiving?.firstName} will be archived. Their invoices and records are preserved.`}
        confirmLabel="Archive"
        destructive
        loading={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving.clientId)}
      />
    </div>
  );
}
