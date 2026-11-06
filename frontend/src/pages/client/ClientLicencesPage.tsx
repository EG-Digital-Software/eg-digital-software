import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, KeyRound, Lock } from 'lucide-react';
import { clientApi, type AvailableProduct, type ClientProduct } from '@/api/client-portal';
import { apiErrorMessage } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Spinner } from '@/components/shared/states';
import { formatDate, formatCurrency } from '@/lib/utils';
import { ProductGlyph } from '@/lib/product-icon';
import { formatCountryPrice } from '@/lib/currencies';
import { discountedPrice } from '@/lib/proration';
import { Linkify } from '@/lib/linkify';
import { BoldText } from '@/components/shared/BoldTextarea';
import type { LicenceStatus } from '@/types';

const STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRING_SOON', label: 'Expiring soon' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const STATUS_CHIP: Record<LicenceStatus, { cls: string; label: string }> = {
  ACTIVE: { cls: 'c-ok', label: 'Active' },
  EXPIRING_SOON: { cls: 'c-warn', label: 'Expiring soon' },
  CRITICAL: { cls: 'c-red', label: 'Critical' },
  EXPIRED: { cls: 'c-red', label: 'Expired' },
  SUSPENDED: { cls: 'c-red', label: 'Suspended' },
};

const CONTRACT_TERM_LABEL: Record<string, string> = {
  ONE_TIME: 'One Time',
  TRIAL: 'Trial',
  CONTRACT_1_YEAR: 'Contract - 1 Year',
  CONTRACT_2_YEARS: 'Contract - 2 Years',
};

const BILLING_SUFFIX = { DAILY: ' / day', WEEKLY: ' / week', MONTHLY: ' / month', ANNUALLY: ' / year', ONE_TIME: ' one-time' } as const;

/** "Everything we offer" catalogue, grouped as in the design. */
const SERVICE_GROUPS: [string, string[]][] = [
  ['Microsoft & Licensing', ['Microsoft Products', 'Microsoft Licensing', 'Microsoft Product Development']],
  ['Marketing & Growth', ['Social Media Management', 'SEO', 'Local Listing', 'Google & Meta Ads', 'PPC', 'Designing']],
  ['Development', ['Website', 'Software', 'SaaS', 'App Development', 'API Integrations']],
  [
    'Business Communications',
    ['Toll-Free Number', 'Virtual Mobile Number', 'Landline Number', 'IVR System', 'Virtual Customer Care Support'],
  ],
  ['Cloud, Security & Support', ['Cybersecurity', 'Cloud Maintenance', 'Server Maintenance', 'Support Services']],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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

const statNum = { fontSize: 32, fontWeight: 700, marginTop: 10 } as const;
const grid = (min: number) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 10, marginTop: 18 }) as const;

export default function ClientLicencesPage() {
  const qc = useQueryClient();
  const [now] = useState(() => Date.now());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [requested, setRequested] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ClientProduct | null>(null);
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['client', 'products', { debounced, status }],
    queryFn: () => clientApi.products({ search: debounced, status }),
  });
  // Unfiltered list for the plan summary (shared with the overview's cache).
  const { data: all } = useQuery({ queryKey: ['client', 'products'], queryFn: () => clientApi.products() });
  const { data: profile } = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });

  const { data: available, isLoading: availableLoading } = useQuery({
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
      setRequested(selectedProduct?.name ?? 'Product');
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
  const enquireTo = profile?.accountManager?.email || 'connect@egeloma.com.au';

  // "Licence 1 of 2" per product name.
  const indexOf = new Map<string, string>();
  for (const name of new Set((data ?? []).map((p) => p.product))) {
    const group = (data ?? []).filter((p) => p.product === name);
    group.forEach((p, i) => indexOf.set(p.id, group.length > 1 ? `Licence ${i + 1} of ${group.length}` : p.sku));
  }

  // Services catalogue — "In your plan" when one of the client's products matches.
  const mine = active.map((p) => norm(p.product));
  const services = SERVICE_GROUPS.map(([group, items]) => ({
    group,
    items: items.map((name) => {
      const n = norm(name);
      return { name, mine: mine.some((m) => m.includes(n) || n.includes(m)) };
    }),
  }));

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success('Licence key copied');
    } catch {
      toast.error('Could not copy the licence key');
    }
  };

  const toggleReq = () => {
    setAddOpen((o) => !o);
    setRequested(null);
  };

  return (
    <div className="ec-page">
      <div
        className="up"
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}
      >
        <div>
          <div className="eyebrow">Products and licences</div>
          <h1 className="disp ec-h1">Your plan</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 520 }}>
            Licences assigned to {company || 'your account'}. Prices are locked for the contract term.
          </p>
        </div>
        <button type="button" className="btn bp" onClick={toggleReq} aria-expanded={addOpen}>
          + Request a product
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="glass card up" style={{ animationDelay: '.1s', padding: 20 }}>
          <div className="eyebrow">Active licences</div>
          <div className="disp stat" style={statNum}>
            {all ? active.length : '—'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {pendingCount > 0
              ? `${pendingCount} pending approval`
              : productNames.length
                ? productNames.join(', ')
                : 'No active licences'}
          </div>
        </div>
        <div className="glass card up" style={{ animationDelay: '.18s', padding: 20 }}>
          <div className="eyebrow">Agreed total</div>
          <div className="disp stat" style={statNum}>
            {all ? formatCurrency(agreedNet) : '—'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {all ? `${formatCurrency(agreedGross)} incl. 10% GST` : ' '}
          </div>
        </div>
        <div className="glass card up" style={{ animationDelay: '.26s', padding: 20 }}>
          <div className="eyebrow">Term remaining</div>
          <div className="disp stat" style={statNum}>
            {remainingPct == null ? '—' : `${remainingPct}%`}
          </div>
          {remainingPct == null ? (
            <div className="muted" style={{ fontSize: 12 }}>
              No fixed term
            </div>
          ) : (
            <div className="bar6" style={{ marginTop: 10 }}>
              <span style={{ width: `${remainingPct}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Request a product — goes to the admin as a pending request. */}
      {addOpen && (
        <div className="aib up">
          <div className="aib-in" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div className="orb" aria-hidden="true" style={{ width: 26, height: 26 }} />
              <h2 className="disp" style={{ margin: 0, fontSize: 20, flex: 1 }}>
                Request a product
              </h2>
              <span className="muted" style={{ fontSize: 13 }}>
                Sent to the admin for approval and shown as <b style={{ color: 'var(--wT)' }}>Pending</b> until
                approved.
              </span>
            </div>
            {availableLoading ? (
              <div style={grid(190)}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skel" style={{ height: 72 }} />
                ))}
              </div>
            ) : !available?.length ? (
              <p className="muted" style={{ margin: '18px 0 0', fontSize: 13 }}>
                No products are available to request right now.
              </p>
            ) : (
              <div role="radiogroup" aria-label="Product" style={grid(190)}>
                {available.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={selected === p.id}
                    className={`prod${selected === p.id ? ' sel' : ''}`}
                    onClick={() => setSelected(p.id)}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--iT)', marginTop: 6 }}>
                      {p.priceMode === 'MANUAL' && p.price != null ? manualPriceLabel(p) : 'On request'}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedProduct?.priceMode === 'MANUAL' && selectedProduct.contractTerm && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
                Term: {CONTRACT_TERM_LABEL[selectedProduct.contractTerm] ?? selectedProduct.contractTerm.toLowerCase()}
              </div>
            )}
            {selectedProduct?.planInclusive && (
              <div style={{ marginTop: 12 }}>
                <PlanInclusive text={selectedProduct.planInclusive} />
              </div>
            )}
            <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              Prices in AUD, excluding GST unless marked. “On request” products are priced by the admin on approval.
            </div>
            <div
              style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}
            >
              {requested && (
                <span className="chip c-warn">
                  <span className="dot" />
                  {requested} · Pending approval
                </span>
              )}
              <button type="button" className="btn bg" onClick={toggleReq}>
                Close
              </button>
              <button
                type="button"
                className="btn bp"
                disabled={!selected || addMut.isPending}
                onClick={() => addMut.mutate()}
              >
                {addMut.isPending && <Spinner />} Send for approval
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="glass up" style={{ animationDelay: '.34s', overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 18px',
            borderBottom: '1px solid rgba(var(--w),.06)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, flex: '1 1 420px' }}>
            <label style={{ display: 'flex', flex: '0 1 360px' }}>
              <span className="sr">Search product, SKU or licence key</span>
              <input
                className="inp"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product, SKU or licence key"
              />
            </label>
            <label style={{ display: 'flex', flex: '0 1 200px' }}>
              <span className="sr">Status</span>
              <select className="inp" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {start != null && end != null && (
            <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
              Issued {formatDate(new Date(start))} · Expires {formatDate(new Date(end))}
            </span>
          )}
        </div>

        {!filtered && needsAttention > 0 && (
          <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(var(--w),.06)' }}>
            <span className="chip c-warn">
              <span className="dot" />
              {needsAttention} {needsAttention === 1 ? 'licence needs' : 'licences need'} attention — expiring soon or
              already expired
            </span>
          </div>
        )}

        {isError ? (
          <div className="p-6">
            <ErrorState onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skel" style={{ height: 48 }} />
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
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ minWidth: 1040 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Licence key</th>
                  <th>Term</th>
                  <th style={{ textAlign: 'right' }}>Agreed price</th>
                  {showUnit && <th style={{ textAlign: 'right' }}>Units</th>}
                  <th style={{ textAlign: 'right' }}>Net</th>
                  <th>Contract</th>
                  <th>Status</th>
                  <th>
                    <span className="sr">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="stag">
                {data.map((p) => {
                  const pct = termLeft(p, now);
                  const chip = p.pending ? { cls: 'c-warn', label: 'Pending approval' } : STATUS_CHIP[p.status];
                  const trial = (p.contractType ?? 'LOCKED') === 'TRIAL';
                  const discount = Number(p.discountPercent) || 0;
                  return (
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
                            <ProductGlyph parts={[p.product]} className="h-[18px] w-[18px]" />
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{p.product}</div>
                            <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                              {indexOf.get(p.id)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {p.licence}
                          <button
                            type="button"
                            onClick={() => copyKey(p.licence)}
                            aria-label="Copy licence key"
                            title="Copy"
                            className="muted"
                            style={{ background: 'none', border: 0, padding: 4, cursor: 'pointer', display: 'inline-flex' }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </td>
                      <td>
                        {pct == null ? (
                          <span className="muted" style={{ fontSize: 13 }}>
                            Ongoing
                          </span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="bar6" style={{ width: 110 }}>
                              <span
                                style={{
                                  width: `${pct}%`,
                                  background:
                                    (p.daysRemaining ?? 0) < 0 ? 'var(--rT)' : pct < 15 ? '#E39B2E' : undefined,
                                }}
                              />
                            </div>
                            <span className="muted mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                              {p.daysRemaining == null
                                ? ''
                                : p.daysRemaining < 0
                                  ? `${Math.abs(p.daysRemaining)}d overdue`
                                  : `${p.daysRemaining}d`}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="stat" style={{ textAlign: 'right' }}>
                        {formatCurrency(p.price)}
                        {discount > 0 && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            −{discount}% discount
                          </div>
                        )}
                      </td>
                      {showUnit && (
                        <td className="stat" style={{ textAlign: 'right' }}>
                          {p.unitHoursEnabled ? Number(p.unitHours) || 0 : '—'}
                        </td>
                      )}
                      <td className="stat" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(netOf(p))}
                      </td>
                      <td>
                        <span className="chip c-ns">
                          {!trial && <Lock className="h-3 w-3" />}
                          {trial ? 'Trial' : 'Locked'}
                        </span>
                      </td>
                      <td>
                        <span className={`chip ${chip.cls}`}>
                          <span className="dot" />
                          {chip.label}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn bg"
                          style={{ minHeight: 34, padding: '0 12px', fontSize: 12 }}
                          onClick={() => setViewing(p)}
                        >
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

      {/* Services catalogue */}
      <section className="glass up" style={{ animationDelay: '.42s', padding: 22 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div>
            <div className="eyebrow">Everything we offer</div>
            <h2 className="disp" style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 600 }}>
              Services
            </h2>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              What’s in your plan, and what we can add when you’re ready.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="chip c-ok">In your plan</span>
            <span className="chip c-ns">Available</span>
          </div>
        </div>
        <div
          className="stag"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 18 }}
        >
          {services.map((g) => (
            <div key={g.group} className="tile">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>{g.group}</div>
                <span className="muted mono" style={{ fontSize: 11 }}>
                  {g.items.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
                {g.items.map((it) => (
                  <a
                    key={it.name}
                    className={`svc${it.mine ? ' mine' : ''}`}
                    href={`mailto:${enquireTo}?subject=${encodeURIComponent(`Enquiry: ${it.name}${company ? ` - ${company}` : ''}`)}`}
                  >
                    <span>{it.name}</span>
                    {it.mine ? (
                      <span className="chip c-ok" style={{ fontSize: 11 }}>
                        In your plan
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>
                        Enquire →
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <LicenceDetailsDialog product={viewing} onOpenChange={(v) => !v && setViewing(null)} />
    </div>
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
