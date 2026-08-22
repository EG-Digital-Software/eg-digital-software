import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Upload, MoreHorizontal, Pencil, Trash2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { productApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import type { Product } from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader, Pagination } from '@/components/shared/misc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { ProductFormDialog } from './ProductFormDialog';

export default function ProductsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [stock, setStock] = useState('');
  const [category, setCategory] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', { page, debounced, status, stock, category }],
    queryFn: () =>
      productApi.list({ page, pageSize: 10, search: debounced, status, stock, category }),
  });

  // Categories are free text, so the filter is built from what is actually in use.
  const { data: categories } = useQuery({
    queryKey: ['products', 'categories'],
    queryFn: productApi.categories,
  });

  const filtered = !!(debounced || status || stock || category);
  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setStock('');
    setCategory('');
    setPage(1);
  };

  const del = useMutation({
    mutationFn: (id: string) => productApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product removed');
      setDeleting(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Manage your product catalogue and inventory"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/admin/products/bulk-upload">
                <Upload className="h-4 w-4" /> Bulk Upload
              </Link>
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          </>
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
              placeholder="Search by name, code, SKU, type, category or description…"
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
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="sm:w-44"
          >
            <option value="">All categories</option>
            {categories?.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
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
              title="No products found"
              description={
                filtered
                  ? 'No product matches these filters. Try clearing the search, category or stock filter.'
                  : 'Add your first product or import a catalogue to get started.'
              }
              action={
                filtered ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => setFormOpen(true)}>
                    <Plus className="h-4 w-4" /> Add Product
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
                  <TableHead>Product</TableHead>
                  <TableHead>Code / SKU</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((p) => {
                  const low = p.availableStock <= p.lowStockThreshold;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0284c7] to-[#38bdf8] text-white">
                            <Package className="h-[18px] w-[18px]" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{p.name}</p>
                            {p.category && (
                              <Badge variant="muted" className="mt-1">
                                {p.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.productCode}
                          {p.sku ? ` · ${p.sku}` : ''}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{p.type ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <p className="font-semibold tabular-nums">{formatCurrency(p.pricePerQty)}</p>
                        {p.unit && <p className="text-xs text-muted-foreground">per {p.unit}</p>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {Number(p.taxRate)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="flex items-center justify-end gap-2">
                          <span
                            className={`tabular-nums ${low ? 'font-medium text-destructive' : 'font-medium'}`}
                          >
                            {formatNumber(p.availableStock)}
                          </span>
                          {low && (
                            <Badge variant={p.availableStock <= 0 ? 'destructive' : 'warning'}>
                              {p.availableStock <= 0 ? 'Out' : 'Low'}
                            </Badge>
                          )}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(p.reservedStock)} reserved · {formatNumber(p.totalStock)} total
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.status === 'ACTIVE' ? 'success' : 'muted'}>
                          {p.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(p);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onClick={() => setDeleting(p)}>
                              <Trash2 /> Remove
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

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Remove product?"
        description={`"${deleting?.name}" will be removed. Products assigned to customers are deactivated instead of deleted.`}
        confirmLabel="Remove"
        destructive
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}
