import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { employeeApi } from '@/api/staff-portal';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader, Pagination } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
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
    <div className="space-y-6">
      <PageHeader title="Customers" description="Customer directory (read-only)" />

      <Card>
        <div className="border-b border-border p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, business, email, ABN, city or Client ID…"
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
              title={filtered ? 'No matching customers' : 'No customers'}
              description={
                filtered
                  ? 'No customer matches this search or business type.'
                  : 'Customers will appear here once the admin team adds them.'
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
                  <TableHead>Client ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs font-medium text-primary">{c.clientId}</TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
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
                      {c.contactPerson || c.contactMobile || c.phoneNumber ? (
                        <div className="min-w-0">
                          {c.contactPerson && <p className="truncate">{c.contactPerson}</p>}
                          <p className="truncate text-xs text-muted-foreground">
                            {formatPhone(c.contactMobile, c.contactMobileCountry) ||
                              formatPhone(c.phoneNumber, c.phoneNumberCountry)}
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
      </Card>
    </div>
  );
}
