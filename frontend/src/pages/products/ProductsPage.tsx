import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, Pencil, Trash2, Package } from 'lucide-react';
import { ProductGlyph } from '@/lib/product-icon';
import { toast } from 'sonner';
import { productApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import type { Product } from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency } from '@/lib/utils';
import { Pagination } from '@/components/shared/misc';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useStaffAccess } from '@/lib/staffAccess';
import { ProductFormDialog } from './ProductFormDialog';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const PERIOD: Record<string, string> = {
  DAILY: ' / day',
  WEEKLY: ' / week',
  MONTHLY: ' / month',
  ANNUALLY: ' / year',
  ONE_TIME: ' one-time',
};

const statNum = { fontSize: 32, fontWeight: 700, marginTop: 10 } as const;

/**
 * Price cell: a product with its own price shows it; one priced per customer on
 * assignment reads "Manual", matching the Product Price choice in the form.
 */
function priceLabel(p: Product) {
  if (p.priceMode === 'MANUAL' && p.pricePerQty != null && p.pricePerQty !== '') {
    return `${formatCurrency(p.pricePerQty)}${p.billingPeriod ? (PERIOD[p.billingPeriod] ?? '') : ''}`;
  }
  return 'Manual';
}

export default function ProductsPage() {
  const qc = useQueryClient();
  // A view-only Products role sees the catalogue but can't change it.
  const canEdit = useStaffAccess().canEdit('products');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', { page, debounced, status, category }],
    queryFn: () =>
      productApi.list({ page, pageSize: 10, search: debounced, status, category }),
  });

  // Categories are free text, so the filter is built from what is actually in use.
  const { data: categories } = useQuery({
    queryKey: ['products', 'categories'],
    queryFn: productApi.categories,
  });

  const filtered = !!(debounced || status || category);
  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setCategory('');
    setPage(1);
  };

  const del = useMutation({
    mutationFn: (id: string) => productApi.remove(id),
    onSuccess: ({ unassigned, invoicesUpdated }) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      const parts = [
        unassigned && `unassigned from ${unassigned} customer ${unassigned === 1 ? 'product' : 'products'}`,
        invoicesUpdated && `removed from ${invoicesUpdated} unpaid ${invoicesUpdated === 1 ? 'invoice' : 'invoices'}`,
      ].filter(Boolean);
      toast.success(parts.length ? `Product deleted — ${parts.join(', ')}` : 'Product deleted');
      setDeleting(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="ec-page">
      <div
        className="up"
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}
      >
        <div>
          <div className="eyebrow">Catalogue</div>
          <h1 className="disp ec-h1">Products</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 520 }}>
            Manage your product catalogue and inventory.
          </p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/admin/products/bulk-upload" className="btn bg">
              <Upload /> Bulk upload
            </Link>
            <button type="button" className="btn bp" onClick={openNew}>
              <Plus /> New product
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="glass card up" style={{ animationDelay: '.1s', padding: 20 }}>
          <div className="eyebrow">{filtered ? 'Matching products' : 'Products in catalogue'}</div>
          <div className="disp stat" style={statNum}>
            {data?.meta ? data.meta.total : '—'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {filtered ? 'With the current filters' : 'All statuses'}
          </div>
        </div>
        <div className="glass card up" style={{ animationDelay: '.18s', padding: 20 }}>
          <div className="eyebrow">Categories</div>
          <div className="disp stat" style={statNum}>
            {categories ? categories.length : '—'}
          </div>
          <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {categories?.length ? categories.join(', ') : 'No categories yet'}
          </div>
        </div>
        <div className="glass card up" style={{ animationDelay: '.26s', padding: 20 }}>
          <div className="eyebrow">Page</div>
          <div className="disp stat" style={statNum}>
            {data?.meta ? `${data.meta.page} / ${Math.max(1, data.meta.totalPages)}` : '—'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {data?.meta ? `${data.meta.pageSize} per page` : ' '}
          </div>
        </div>
      </div>

      <section className="glass up" style={{ animationDelay: '.34s', overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            borderBottom: '1px solid rgba(var(--w),.06)',
          }}
        >
          <div className="segs" role="group" aria-label="Status">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`seg${status === t.value ? ' on' : ''}`}
                aria-pressed={status === t.value}
                onClick={() => {
                  setStatus(t.value);
                  setPage(1);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, flex: '1 1 420px', justifyContent: 'flex-end' }}>
            <label style={{ display: 'flex', flex: '0 1 200px' }}>
              <span className="sr">Category</span>
              <select
                className="inp"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All categories</option>
                {categories?.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flex: '0 1 360px' }}>
              <span className="sr">Search products</span>
              <input
                className="inp"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, code, SKU, type or category"
              />
            </label>
          </div>
        </div>

        {isError ? (
          <div className="p-6">
            <ErrorState onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skel" style={{ height: 48 }} />
            ))}
          </div>
        ) : !data?.items.length ? (
          <div className="p-6">
            <EmptyState
              icon={<Package className="h-6 w-6" />}
              title="No products found"
              description={
                filtered
                  ? 'No product matches these filters. Try clearing the search or category filter.'
                  : 'Add your first product or import a catalogue to get started.'
              }
              action={
                filtered ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  canEdit && (
                    <Button onClick={() => setFormOpen(true)}>
                      <Plus className="h-4 w-4" /> Add Product
                    </Button>
                  )
                )
              }
            />
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th>Status</th>
                    <th>
                      <span className="sr">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="stag">
                  {data.items.map((p) => (
                    <tr key={p.id} className="row">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 12,
                              background: 'rgba(45,185,138,.12)',
                              color: 'var(--brand)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <ProductGlyph parts={[p.name, p.category, p.type]} className="h-[18px] w-[18px]" />
                          </span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            <div className="muted mono" style={{ fontSize: 11 }}>
                              {p.sku ? `SKU ${p.sku}` : 'No SKU'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="mono muted" style={{ fontSize: 12 }}>
                        {p.productCode}
                      </td>
                      <td>{p.type ?? '—'}</td>
                      <td>{p.category ? <span className="chip c-ns">{p.category}</span> : <span className="muted">—</span>}</td>
                      <td className="mono nw" style={{ textAlign: 'right', fontSize: 12.5 }}>
                        {priceLabel(p)}
                      </td>
                      <td>
                        <span className={`chip ${p.status === 'ACTIVE' ? 'c-ok' : 'c-ns'}`}>
                          <span className="dot" />
                          {p.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canEdit && (
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn bg sm"
                            onClick={() => {
                              setEditing(p);
                              setFormOpen(true);
                            }}
                            title="Edit product"
                            aria-label={`Edit ${p.name}`}
                            style={{ width: 36, padding: 0 }}
                          >
                            <Pencil />
                          </button>
                          <button
                            type="button"
                            className="btn bg sm"
                            onClick={() => setDeleting(p)}
                            title="Delete product"
                            aria-label={`Delete ${p.name}`}
                            style={{ width: 36, padding: 0, color: 'var(--rT)' }}
                          >
                            <Trash2 />
                          </button>
                        </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </section>

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete Product?"
        description={`"${deleting?.name}" will be permanently deleted. It will also be removed from every customer it is assigned to, along with those licences, and taken off every unpaid invoice (totals are recalculated). Paid and part-paid invoices stay as issued. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}
