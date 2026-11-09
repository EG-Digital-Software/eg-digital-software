import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { employeeApi } from '@/api/staff-portal';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader, Pagination } from '@/components/shared/misc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { formatPhone, Flag } from '@/components/shared/PhoneInput';
import { countryCodeByName } from '@/lib/countries';
import { BUSINESS_TYPES, businessTypeLabel } from '@/lib/customer';

export default function EmployeeCustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [businessType, setBusinessType] = useState('');
  const debounced = useDebounce(search);
  const filtered = !!(debounced || businessType);
  const clearFilters = () => {
    setSearch('');
    setBusinessType('');
    setPage(1);
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['employee', 'customers', { page, debounced, businessType }],
    queryFn: () =>
      employeeApi.customers({ page, pageSize: 10, search: debounced, businessType }),
  });

  return (
    <div className="ec-page">
      <PageHeader eyebrow="Directory" title="Assigned Customers" description="Customers you are the account manager for. Read-only for the team." />

      <div className="stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div className="glass card" style={{ padding: 16 }}>
          <div className="eyebrow">{filtered ? 'Matching customers' : 'Assigned customers'}</div>
          <div className="disp stat" style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{data?.meta.total ?? '–'}</div>
        </div>
        <div className="glass card" style={{ padding: 16 }}>
          <div className="eyebrow">Page</div>
          <div className="disp stat" style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
            {data ? `${data.meta.page} / ${Math.max(1, data.meta.totalPages)}` : '–'}
          </div>
        </div>
      </div>

      <section className="glass up" style={{ animationDelay: '.12s', overflow: 'hidden' }}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" style={{ borderBottom: '1px solid rgba(var(--w),.06)' }}>
          <div className="relative w-full sm:max-w-md sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, business, email, ABN, city or Customer ID…"
              className="pl-9"
            />
          </div>
          <Select
            value={businessType}
            onChange={(e) => {
              setBusinessType(e.target.value);
              setPage(1);
            }}
            className="w-full sm:ml-auto sm:w-52"
          >
            <option value="">All business types</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
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
              title={filtered ? 'No matching customers' : 'No assigned customers'}
              description={
                filtered
                  ? 'No customer matches this search or business type.'
                  : 'Customers appear here once the admin makes you their account manager.'
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
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="mono text-xs font-medium" style={{ color: 'var(--brand)' }}>{c.clientId}</TableCell>
                    <TableCell>
                      <p className="font-medium">{c.contactPerson || '—'}</p>
                      {c.contactEmail && (
                        <p className="text-xs text-muted-foreground">{c.contactEmail}</p>
                      )}
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
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.contactPerson || c.contactMobile ? (
                        <div className="min-w-0">
                          {c.contactPerson && <p className="truncate">{c.contactPerson}</p>}
                          <p className="truncate text-xs text-muted-foreground">
                            {formatPhone(c.contactMobile, c.contactMobileCountry)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        const a =
                          c.addresses?.find((x) => x.type === 'PRINCIPAL') ??
                          c.addresses?.find((x) => x.type === 'BILLING');
                        if (!a?.city && !a?.country) {
                          return <span className="text-muted-foreground">—</span>;
                        }
                        return (
                          <span className="flex items-center gap-1.5">
                            <Flag code={countryCodeByName(a?.country)} />
                            <span className="truncate">{a?.city || a?.country}</span>
                          </span>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}
