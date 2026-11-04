import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, KeyRound, Lock, Plus, Search } from 'lucide-react';
import { clientApi, type AvailableProduct, type ClientProduct } from '@/api/client-portal';
import { apiErrorMessage } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Spinner } from '@/components/shared/states';
import { formatDate, formatCurrency } from '@/lib/utils';
import { ProductGlyph } from '@/lib/product-icon';
import { formatCountryPrice } from '@/lib/currencies';
import { discountedPrice } from '@/lib/proration';
import { Linkify } from '@/lib/linkify';
import { BoldText } from '@/components/shared/BoldTextarea';
import { ElPageHead, ElPill, ElSkel, type PillTone } from '@/components/client/eloma';
import type { LicenceStatus } from '@/types';

const STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRING_SOON', label: 'Expiring soon' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const STATUS_PILL: Record<LicenceStatus, { tone: PillTone; label: string }> = {
  ACTIVE: { tone: 'ok', label: 'Active' },
  EXPIRING_SOON: { tone: 'warn', label: 'Expiring soon' },
  CRITICAL: { tone: 'bad', label: 'Critical' },
  EXPIRED: { tone: 'bad', label: 'Expired' },
  SUSPENDED: { tone: 'bad', label: 'Suspended' },
};

const CONTRACT_TERM_LABEL: Record<string, string> = {
  ONE_TIME: 'One Time',
  TRIAL: 'Trial',
  CONTRACT_1_YEAR: 'Contract - 1 Year',
  CONTRACT_2_YEARS: 'Contract - 2 Years',
};

const BILLING_SUFFIX ={ DAILY: ' / day', WEEKLY: ' / week', MONTHLY: ' / month', ANNUALLY: ' / year', ONE_TIME: ' one-time' } as const;

/** "$120.00 / month" for a MANUAL product's own price, in its country's currency. */
function manualPriceLabel(p: AvailableProduct) {
  const per = p.billingPeriod ? BILLING_SUFFIX[p.billingPeriod] : '';
  const gst = p.gstType === 'INCLUSIVE' ? ' (incl. GST)' : p.gstType === 'EXCLUSIVE' ? ' + GST' : '';
  return `${formatCountryPrice(p.price, p.country)}${per}${gst}`;
}

const unitsOf = (p: ClientProduct) => (p.unitHoursEnabled ? Number(p.unitHours) || 0 : 1);
const netOf = (p: ClientProduct) => discountedPrice(p) * unitsOf(p);
/** GST is fixed at 10%; INCLUSIVE means it is already in the agreed price. */
const grossOf = (p: ClientProduct) => (p.gstType === 'INCLUSIVE' ? netOf(p) : netOf(p) * 1.1);

/** Share of the licence term still left, 0–100 (null when open-ended). */
function termLeft(p: ClientProduct, now: number): number | null {
  if (!p.expiryDate) return null;
  const start = new Date(p.issueDate).getTime();
  const end = new Date(p.expiryDate).getTime();
  if (!(end > start)) return 0;
  return Math.max(0, Math.min(100, Math.round(((end - now) / (end - start)) * 100)));
}

export default function ClientLicencesPage() {
  const qc = useQueryClient();
  const [now] = useState(() => Date.now());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [viewing, setViewing] = useState<ClientProduct | null>(null);
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['client', 'products', { debounced, status }],
    queryFn: () => clientApi.products({ search: debounced, status }),
  });
  // Unfiltered list for the plan summary (shared with the overview's cache).
  const { data: all } = useQuery({ queryKey: ['client', 'products'], queryFn: () => clientApi.products() });
  const { data: profile } = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });

  const { data: available } = useQuery({
    queryKey: ['client', 'available-products'],
    queryFn: clientApi.availableProducts,
    enabled: addOpen,
  });
  const selectedProduct = available?.find((p) => p.id === selected);
  const addMut = useMutation({
    mutationFn: () => clientApi.addProduct(selected),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', 'products'] });
      toast.success('Product added — pending admin approval');
      setAddOpen(false);
      setSelected('');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const filtered = !!(debounced || status);
  const clearFilters = () => {
    setSearch('');
    setStatus('');
  };

  // Renewal-attention count, so an expiring licence is not buried in the table.
  const needsAttention =
    data?.filter((p) => p.status === 'EXPIRING_SOON' || p.status === 'CRITICAL' || p.status === 'EXPIRED')
      .length ?? 0;

  // Only show the Unit/Hours column when at least one product has it enabled.
  const showUnit = data?.some((p) => p.unitHoursEnabled) ?? false;

  // Plan summary.
  const approved = (all ?? []).filter((p) => !p.pending);
  const active = approved.filter((p) => p.status === 'ACTIVE' || p.status === 'EXPIRING_SOON');
  const pendingCount = (all ?? []).length - approved.length;
  const productNames = [...new Set(active.map((p) => p.product))];
  const agreedNet = approved.reduce((s, p) => s + netOf(p), 0);
  const agreedGross = approved.reduce((s, p) => s + grossOf(p), 0);
  const dated = approved.filter((p) => p.expiryDate);
  const start = dated.length ? Math.min(...dated.map((p) => new Date(p.issueDate).getTime())) : null;
  const end = dated.length ? Math.max(...dated.map((p) => new Date(p.expiryDate!).getTime())) : null;
  const remainingPct =
    start != null && end != null && end > start
      ? Math.max(0, Math.min(100, Math.round(((end - now) / (end - start)) * 100)))
      : null;
  const company = profile?.companyName?.trim();

  // "Licence 1 of 2" per product name.
  const indexOf = new Map<string, string>();
  for (const name of new Set((data ?? []).map((p) => p.product))) {
    const group = (data ?? []).filter((p) => p.product === name);
    group.forEach((p, i) => indexOf.set(p.id, group.length > 1 ? `Licence ${i + 1} of ${group.length}` : p.sku));
  }

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success('Licence key copied');
    } catch {
      toast.error('Could not copy the licence key');
    }
  };

  return (
    <>
      <ElPageHead
        eyebrow="Products and licences"
        title="Your plan"
        description={`Licences assigned to ${company || 'your account'}. Prices are locked for the contract term.`}
        actions={
          <button type="button" className="el-btn primary" onClick={() => setAddOpen(true)}>
            <Plus /> Request a product
          </button>
        }
      />

      <div className="el-summary-row">
        <div className="el-card el-mini">
          <span className="el-eyebrow">Active licences</span>
          <span className="v">{all ? active.length : '—'}</span>
          <span className="s">
            {pendingCount > 0
              ? `${pendingCount} pending approval`
              : productNames.length
                ? productNames.join(', ')
                : 'No active licences'}
          </span>
        </div>
        <div className="el-card el-mini">
          <span className="el-eyebrow">Agreed total</span>
          <span className="v">{all ? formatCurrency(agreedNet) : '—'}</span>
          <span className="s">{all ? `${formatCurrency(agreedGross)} incl. 10% GST` : ' '}</span>
        </div>
        <div className="el-card el-mini">
          <span className="el-eyebrow">Term remaining</span>
          <span className="v">{remainingPct == null ? '—' : `${remainingPct}%`}</span>
          {remainingPct == null ? (
            <span className="s">No fixed term</span>
          ) : (
            <div className="el-bar mt-2">
              <span style={{ width: `${remainingPct}%` }} />
            </div>
          )}
        </div>
      </div>

      <section className="el-card">
        <div className="el-toolbar">
          <label className="el-search">
            <Search />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, SKU or licence key"
              aria-label="Search product, SKU or licence key"
            />
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="el-select"
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="grow" />
          {start != null && end != null && (
            <span className="el-muted text-[13px]">
              Issued {formatDate(new Date(start))} · Expires {formatDate(new Date(end))}
            </span>
          )}
        </div>

        {!filtered && needsAttention > 0 && (
          <div className="el-banner">
            {needsAttention} {needsAttention === 1 ? 'licence needs' : 'licences need'} attention — expiring soon or
            already expired.
          </div>
        )}

        {isError ? (
          <div className="p-6">
            <ErrorState onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ElSkel key={i} className="h-12" />
            ))}
          </div>
        ) : !data?.length ? (
          <div className="p-6">
            <EmptyState
              icon={<KeyRound className="h-6 w-6" />}
              title={filtered ? 'No matching licences' : 'No products'}
              description={
                filtered ? 'No licence matches this search or status filter.' : 'You have no assigned products yet.'
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
          <div className="el-table-wrap">
            <table className="el-table" style={{ minWidth: 1040 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Licence key</th>
                  <th>Term</th>
                  <th className="r">Agreed price</th>
                  {showUnit && <th className="r">Units</th>}
                  <th className="r">Net</th>
                  <th>Contract</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((p) => {
                  const pct = termLeft(p, now);
                  const pill = p.pending ? { tone: 'warn' as const, label: 'Pending approval' } : STATUS_PILL[p.status];
                  const trial = (p.contractType ?? 'LOCKED') === 'TRIAL';
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="el-prod">
                          <span className="glyph">
                            <ProductGlyph parts={[p.product]} className="h-[18px] w-[18px]" />
                          </span>
                          <div className="min-w-0">
                            <b>{p.product}</b>
                            <small>{indexOf.get(p.id)}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="el-key">
                          <span className="el-mono">{p.licence}</span>
                          <button type="button" onClick={() => copyKey(p.licence)} aria-label="Copy licence key" title="Copy">
                            <Copy />
                          </button>
                        </span>
                      </td>
                      <td>
                        {pct == null ? (
                          <span className="el-muted text-[13px]">Ongoing</span>
                        ) : (
                          <div className="el-termcell">
                            <div className="el-bar">
                              <span
                                style={{
                                  width: `${pct}%`,
                                  background: (p.daysRemaining ?? 0) < 0 ? 'var(--bad)' : pct < 15 ? 'var(--warn)' : undefined,
                                }}
                              />
                            </div>
                            <span className="el-muted el-num text-[12.5px]">
                              {p.daysRemaining == null
                                ? ''
                                : p.daysRemaining < 0
                                  ? `${Math.abs(p.daysRemaining)}d overdue`
                                  : `${p.daysRemaining}d`}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="r el-num">{formatCurrency(p.price)}</td>
                      {showUnit && <td className="r el-num">{p.unitHoursEnabled ? Number(p.unitHours) || 0 : '—'}</td>}
                      <td className="r el-num font-semibold">{formatCurrency(netOf(p))}</td>
                      <td>
                        <ElPill tone="idle" dot={false}>
                          {!trial && <Lock />}
                          {trial ? 'Trial' : 'Locked'}
                        </ElPill>
                      </td>
                      <td>
                        <ElPill tone={pill.tone}>{pill.label}</ElPill>
                      </td>
                      <td className="r">
                        <button type="button" className="el-btn sm ghost" onClick={() => setViewing(p)}>
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add a product — goes to the admin as a pending request. */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a product</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose a product to add. It will be sent to the admin for approval and shown as
              <span className="font-medium"> Pending</span> until approved.
            </p>
            <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select a product…</option>
              {available?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.priceMode === 'MANUAL' ? `${p.name} — ${manualPriceLabel(p)}` : p.name}
                </option>
              ))}
            </Select>
            {selectedProduct?.priceMode === 'MANUAL' && (
              <div className="space-y-1 rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium tabular-nums">{manualPriceLabel(selectedProduct)}</span>
                </div>
                {selectedProduct.contractTerm && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Term</span>
                    <span className="capitalize">
                      {CONTRACT_TERM_LABEL[selectedProduct.contractTerm] ?? selectedProduct.contractTerm.toLowerCase()}
                    </span>
                  </div>
                )}
              </div>
            )}
            {selectedProduct?.planInclusive && <PlanInclusive text={selectedProduct.planInclusive} />}
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={!selected || addMut.isPending} onClick={() => addMut.mutate()}>
              {addMut.isPending && <Spinner />} Add for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LicenceDetailsDialog product={viewing} onOpenChange={(v) => !v && setViewing(null)} />
    </>
  );
}

/** Read-only full details of one assigned product/licence for the client. */
function LicenceDetailsDialog({
  product,
  onOpenChange,
}: {
  product: ClientProduct | null;
  onOpenChange: (v: boolean) => void;
}) {
  const unitOn = !!product?.unitHoursEnabled;
  const unitVal = unitOn ? Number(product?.unitHours) || 0 : 1;
  const discount = Number(product?.discountPercent) || 0;
  const net = (product ? discountedPrice(product) : 0) * unitVal;
  // GST is fixed at 10%; INCLUSIVE means it is already in the agreed price.
  const gst = product?.gstType === 'INCLUSIVE' ? 0 : net * 0.1;
  const total = net + gst;

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Licence details</DialogTitle>
          <DialogDescription>Full details of this product and its licence.</DialogDescription>
        </DialogHeader>
        {product && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card">
                <ProductGlyph parts={[product.product]} className="h-[24px] w-[24px]" />
              </span>
              <div>
                <p className="text-lg font-semibold">{product.product}</p>
                <p className="text-sm text-muted-foreground">{product.sku}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Detail label="Licence Key" value={product.licence} mono />
              <Detail
                label="Status"
                value={product.pending ? 'Pending approval' : (product.status ?? '').replace(/_/g, ' ')}
                className="capitalize"
              />
              <Detail label="Contract" value={(product.contractType ?? 'LOCKED').toLowerCase()} className="capitalize" />
              <Detail label="GST" value={(product.gstType ?? 'EXCLUSIVE').toLowerCase()} className="capitalize" />
              <Detail label="Unit/Hours" value={unitOn ? String(unitVal) : 'Off'} />
              <Detail label="Agreed Price" value={formatCurrency(product.price)} />
              {discount > 0 && <Detail label="Discount" value={`${discount}%`} />}
              <Detail label="Issued" value={formatDate(product.issueDate)} />
              <Detail label="Expiry" value={formatDate(product.expiryDate)} />
              <Detail
                label="Days Left"
                value={
                  product.daysRemaining == null
                    ? '—'
                    : product.daysRemaining < 0
                      ? `${Math.abs(product.daysRemaining)} overdue`
                      : String(product.daysRemaining)
                }
              />
            </div>
            {product.planInclusive && <PlanInclusive text={product.planInclusive} />}
            <div className="space-y-1 rounded-lg border border-border bg-secondary/30 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Net amount</span><span className="tabular-nums">{formatCurrency(net)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GST (10%)</span><span className="tabular-nums">{formatCurrency(gst)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-medium"><span>Total</span><span className="tabular-nums">{formatCurrency(total)}</span></div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Read-only "Plan Inclusive" block for a product. */
function PlanInclusive({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan Inclusive</p>
      <BoldText text={text} className="mt-1 text-sm" />
    </div>
  );
}

/** One label/value pair used in the details dialog. */
function Detail({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-medium ${mono ? 'font-mono tracking-wide' : ''} ${className ?? ''}`}><Linkify text={value} /></p>
    </div>
  );
}
