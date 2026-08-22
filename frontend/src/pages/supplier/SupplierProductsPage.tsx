import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Package } from 'lucide-react';
import { supplierApi } from '@/api/staff-portal';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader, Pagination } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { formatCurrency } from '@/lib/utils';

export default function SupplierProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [stock, setStock] = useState('');
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['supplier', 'products', { page, debounced, status, stock }],
    queryFn: () => supplierApi.products({ page, pageSize: 10, search: debounced, status, stock }),
  });

  const filtered = !!(debounced || status || stock);
  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setStock('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="My Products" description="Products you supply and their stock levels" />

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
              placeholder="Search by name, code, SKU or category…"
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
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
          <Select
            value={stock}
            onChange={(e) => {
              setStock(e.target.value);
              setPage(1);
            }}
            className="sm:w-40"
          >
            <option value="">All stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
          {data?.meta && (
            <span className="hidden shrink-0 text-xs font-medium text-muted-foreground lg:block">
              {data.meta.total} {data.meta.total === 1 ? 'product' : 'products'}
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
              icon={<Package className="h-6 w-6" />}
              title={filtered ? 'No matching products' : 'No products'}
              description={
                filtered
                  ? 'No product matches this search or filter.'
                  : 'Products you supply will appear here.'
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
                  <TableHead>Product</TableHead>
                  <TableHead>Code / SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((p) => {
                  const low = p.availableStock <= p.lowStockThreshold;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium">{p.name}</p>
                        {p.category && (
                          <Badge variant="muted" className="mt-1">
                            {p.category}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.productCode}
                        {p.sku ? ` · ${p.sku}` : ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(p.pricePerQty)}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`tabular-nums font-medium ${low ? 'text-destructive' : ''}`}
                        >
                          {p.availableStock}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {p.reservedStock} reserved · {p.totalStock} total · alert at{' '}
                          {p.lowStockThreshold}
                        </p>
                      </TableCell>
                      <TableCell>
                        {p.availableStock <= 0 ? (
                          <Badge variant="destructive">Out of stock</Badge>
                        ) : low ? (
                          <Badge variant="warning">Restock</Badge>
                        ) : (
                          <Badge variant="success">OK</Badge>
                        )}
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
