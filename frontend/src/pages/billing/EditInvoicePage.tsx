import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Receipt, Package, FileText, CheckCircle, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { customerApi, invoiceApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { LineItemProduct } from '@/components/invoice/LineItemProduct';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingBlock, ErrorState, Spinner } from '@/components/shared/states';
import { formatCurrency, cn } from '@/lib/utils';
import { numericField } from '@/lib/input';
import { INVOICE_TERMS, invoiceTermLabel, normalizeInvoiceTerm } from '@/lib/customer';
import {
  computeProration,
  computeDueDate,
  defaultNextBillingDate,
  termToDays,
  round2,
  fmtDay,
  toDateInput,
  buildLicenceGroups,
  findLicenceGroup,
  licenceGroupBilled,
  type LicenceGroup,
} from '@/lib/proration';

const schema = z.object({
  invoiceDate: z.string().optional(),
  // Not user-editable — auto-filled on submit from the invoice date + the term's
  // payment window.
  dueDate: z.string().optional(),
  // The payment window only — how long the client has to pay.
  term: z.string().optional(),
  // When the next invoice is raised; drives the billing period and pro-rata.
  nextBillingDate: z.string().optional(),
  reference: z.string().optional(),
  discount: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().optional().nullable(),
        sku: z.string().optional().nullable(),
        description: z.string().min(1, 'Required'),
        quantity: z.coerce.number().int().positive(),
        unitPrice: z.coerce.number().min(0),
        taxRate: z.coerce.number().min(0).max(100),
        contractType: z.enum(['LOCKED', 'TRIAL']).default('LOCKED'),
        gstType: z.enum(['INCLUSIVE', 'EXCLUSIVE']).default('EXCLUSIVE'),
      })
    )
    .min(1),
});
type FormValues = z.infer<typeof schema>;

const FILLED = 'border-slate-200 bg-slate-50 shadow-none';

/** Header row of a glass form section (icon tile + title + optional action). */
function SectionHead({ icon: Icon, title, action }: { icon: LucideIcon; title: string; action?: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '16px 22px',
        borderBottom: '1px solid rgba(var(--w),.06)',
      }}
    >
      <span className="ico">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <h2 className="disp" style={{ margin: 0, fontSize: 18, flex: 1 }}>
        {title}
      </h2>
      {action}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function EditInvoicePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: invoice, isLoading, isError, refetch } = useQuery({
    // Open on what the invoice bills now (it re-prices live when products
    // change), but don't refetch on tab focus — that would reset unsaved edits.
    staleTime: 0,
    queryKey: ['invoice', id],
    queryFn: () => invoiceApi.get(id!),
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { discount: 0, items: [] },
  });
  const { fields, append, remove, update } = useFieldArray({ control, name: 'items' });

  // Prefill once the invoice loads.
  useEffect(() => {
    if (!invoice) return;
    reset({
      invoiceDate: invoice.invoiceDate ? invoice.invoiceDate.slice(0, 10) : '',
      term: normalizeInvoiceTerm(invoice.term),
      // Invoices raised before the billing cycle was split out of the term have
      // no stored next billing date — fall back to the monthly default so the
      // period and pro-rata still compute.
      nextBillingDate: (invoice.nextBillingDate ?? '').slice(0, 10) ||
        (() => {
          const d = defaultNextBillingDate(
            invoice.invoiceDate ? invoice.invoiceDate.slice(0, 10) : undefined
          );
          return d ? toDateInput(d) : '';
        })(),
      reference: invoice.reference ?? '',
      discount: Number(invoice.discount) || 0,
      notes: invoice.notes ?? '',
      items: (invoice.items ?? []).map((it) => ({
        productId: it.productId ?? null,
        sku: it.sku ?? null,
        description: it.description,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice) || 0,
        taxRate: Number(it.taxRate) || 0,
        contractType: (it.contractType === 'TRIAL' ? 'TRIAL' : 'LOCKED') as 'LOCKED' | 'TRIAL',
        gstType: (it.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE') as 'INCLUSIVE' | 'EXCLUSIVE',
      })),
    });
  }, [invoice, reset]);

  const items = watch('items');
  const discount = watch('discount');
  const term = watch('term');
  const invoiceDate = watch('invoiceDate');
  const nextBillingDate = watch('nextBillingDate');

  // The invoice's customer — carries their product assignments (agreed price,
  // tax, GST/contract type and unit multipliers) so product-backed lines can be
  // re-pro-rated when the billing period (invoice date/term) changes, exactly
  // like the create form.
  const clientId = invoice?.customer?.clientId;
  const { data: selectedCustomer } = useQuery({
    queryKey: ['customer', clientId],
    queryFn: () => customerApi.get(clientId!),
    enabled: !!clientId,
  });

  // Group the customer's assigned products by licence key — each group is one
  // billable "row" (all its products share one licence key).
  const licenceGroups = useMemo<LicenceGroup[]>(
    () => buildLicenceGroups(selectedCustomer?.customerProducts),
    [selectedCustomer]
  );

  // What the licence group a product belongs to bills for this period.
  const groupBilledFor = (productId?: string | null, sku?: string | null): number | null => {
    const g = findLicenceGroup(licenceGroups, productId, sku);
    return g ? licenceGroupBilled(g, proration) : null;
  };

  // Picking a licence group fills this line with the whole group as one row —
  // all its products share one licence key and their price/tax/GST were agreed
  // at assignment time. Same behaviour as the create form.
  const selectGroup = (index: number, groupKey: string) => {
    const g = licenceGroups.find((x) => x.key === groupKey);
    if (!g || !g.items.length) return;
    const rep = g.items[0];
    const grpTerm = g.items.find((cp) => cp.invoicingTerm)?.invoicingTerm;
    // The amount comes from the billing period, so picking a product no longer
    // depends on the term.
    const billed = licenceGroupBilled(g, proration);
    update(index, {
      productId: rep.product.id,
      // Licence number rides along as the line's sku (shown on the invoice).
      sku: g.licenceKey || rep.product.sku || rep.product.productCode || '',
      description: g.items.map((cp) => cp.product.name).join('\n'),
      quantity: 1,
      unitPrice: round2(billed),
      taxRate: Number(rep.taxRate ?? 10) || 0,
      contractType: (rep.contractType === 'TRIAL' ? 'TRIAL' : 'LOCKED') as 'LOCKED' | 'TRIAL',
      gstType: (rep.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE') as 'INCLUSIVE' | 'EXCLUSIVE',
    });
    if (grpTerm) setValue('term', normalizeInvoiceTerm(grpTerm));
  };

  // Billing period + pro-ration, driven by the next billing date (NOT the term).
  // Each product-backed line bills its agreed net pro-rated to these days, per
  // each product's charge period (daily/weekly/annual/monthly).
  const proration = useMemo(
    () => computeProration(invoiceDate, nextBillingDate),
    [invoiceDate, nextBillingDate]
  );

  // The due date is the term's payment window from the invoice date — the only
  // thing the term decides (mirrors the backend + create form).
  const due = useMemo(() => computeDueDate(invoiceDate, term), [invoiceDate, term]);

  // The unit price a line actually bills. For a product-backed line it's the
  // group's agreed net pro-rated to the current period — derived live from the
  // invoice date/term, so the amount reflects instantly (no effect/setValue lag).
  // Manual lines keep their typed price.
  const effectiveUnitPrice = (it?: FormValues['items'][number]): number => {
    if (it?.productId) {
      const billed = groupBilledFor(it.productId, it.sku);
      if (billed != null) return round2(billed);
    }
    return Number(it?.unitPrice) || 0;
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const it of items ?? []) {
      const gross = effectiveUnitPrice(it) * (Number(it.quantity) || 0);
      const rate = (Number(it.taxRate) || 0) / 100;
      if (it.gstType === 'INCLUSIVE') {
        const net = gross / (1 + rate);
        subtotal += net;
        tax += gross - net;
      } else {
        subtotal += gross;
        tax += gross * rate;
      }
    }
    const disc = Number(discount) || 0;
    return { subtotal, tax, total: Math.max(0, subtotal + tax - disc) };
    // effectiveUnitPrice closes over proration + licenceGroups (both listed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, discount, proration, licenceGroups]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => invoiceApi.update(id!, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Invoice updated');
      navigate(`/admin/billing/${id}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (isLoading) return <LoadingBlock label="Loading invoice…" />;
  if (isError || !invoice) return <ErrorState onRetry={refetch} />;

  return (
    <form
      onSubmit={handleSubmit((v) =>
        mutation.mutate({
          ...v,
          // Auto-filled due date = invoice date + the term's payment window.
          // Local parts (not toISOString) so a UTC+ timezone can't shift the day.
          dueDate: due ? toDateInput(due) : undefined,
          // Persist the same pro-rated price the summary shows for product lines.
          // productId/sku are null on a manual line, which the API's line-item
          // schema (optional, not nullable) rejects — send them omitted instead.
          items: v.items.map((it) => ({
            ...it,
            productId: it.productId ?? undefined,
            sku: it.sku ?? undefined,
            unitPrice: effectiveUnitPrice(it),
          })),
        })
      )}
      className="ec-page"
    >
      <div
        className="up"
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}
      >
        <div>
          <div className="eyebrow">Billing · Edit invoice</div>
          <h1 className="disp ec-h1">{invoice.invoiceNumber}</h1>
          <p className="muted" style={{ margin: 0 }}>
            Update dates, line items and notes. Saving re-prices the invoice.
          </p>
        </div>
        <Link to={`/admin/billing/${id}`} className="btn bg">
          <ArrowLeft /> Back to invoice
        </Link>
      </div>

      <section className="glass up" style={{ animationDelay: '.06s' }}>
        <SectionHead icon={Receipt} title="Invoice details" />
        <div className="grid grid-cols-1 gap-4 p-[22px] sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Invoice Date">
            <Input className={FILLED} type="date" {...register('invoiceDate')} />
          </Field>
          <Field label="Term">
            <Select className={FILLED} {...register('term')}>
              <option value="">—</option>
              {INVOICE_TERMS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              {/* A term this invoice already carries that is no longer offered —
                  keep it selectable so editing never silently rewrites it. */}
              {term && !INVOICE_TERMS.some((t) => t.value === term) && (
                <option value={term}>{invoiceTermLabel(term)}</option>
              )}
            </Select>
          </Field>
          <Field label="Due Date">
            {/* Auto-filled (read-only) = invoice date + the term's payment
                window. Change the invoice date or term and it moves on its own. */}
            <div className="flex h-10 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm font-medium tabular-nums text-muted-foreground">
              {due ? fmtDay(due) : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              Pay within {termToDays(term)} day{termToDays(term) === 1 ? '' : 's'} of the invoice date
            </p>
          </Field>
          <Field label="Next Billing Date">
            {/* Drives the billing period and the pro-rated line amounts. */}
            <Input className={FILLED} type="date" {...register('nextBillingDate')} />
            {proration && (
              <p className="text-xs text-muted-foreground">
                Billing period: {fmtDay(proration.start)} to {fmtDay(proration.end)} (
                {proration.billedDays}/{proration.periodDays} days)
              </p>
            )}
          </Field>
          <Field label="Reference">
            <Input className={FILLED} {...register('reference')} />
          </Field>
        </div>
      </section>

      <section className="glass up" style={{ animationDelay: '.1s' }}>
        <SectionHead
          icon={Package}
          title="Line items"
          action={
            <button
              type="button"
              className="btn bg sm"
              onClick={() =>
                append({ description: '', quantity: 1, unitPrice: 0, taxRate: 10, contractType: 'LOCKED', gstType: 'EXCLUSIVE' })
              }
            >
              <Plus /> Add line
            </button>
          }
        />
        <div className="space-y-3 p-[22px]">
          {fields.map((field, index) => {
            const it = items?.[index];
            // Product-backed lines bill a pro-rated price derived from the
            // invoice date/term — shown read-only so it always matches the
            // summary; manual lines stay editable.
            const isProduct = !!it?.productId && groupBilledFor(it.productId, it.sku) != null;
            const unitPrice = effectiveUnitPrice(it);
            const gross = unitPrice * (Number(it?.quantity) || 0);
            const amount = it?.gstType === 'INCLUSIVE' ? gross : gross * (1 + (Number(it?.taxRate) || 0) / 100);
            return (
              <div key={field.id} className="tile grid grid-cols-2 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <Field label="Product" error={errors.items?.[index]?.description?.message}>
                    {/* Product-backed line → read-only licence/SKU/agreed-price
                        summary, exactly as on the create form. A manual line
                        keeps its editable description. */}
                    <LineItemProduct
                      groups={licenceGroups}
                      productId={it?.productId}
                      sku={it?.sku}
                      proration={proration}
                      hasCustomer={!!clientId}
                      controlClassName={FILLED}
                      onSelectGroup={(groupKey) => selectGroup(index, groupKey)}
                      fallback={
                        <Textarea
                          className={cn(FILLED, 'min-h-[60px] resize-y')}
                          rows={Math.max(2, it?.description?.split('\n').length ?? 1)}
                          placeholder="Description (one product per line)"
                          {...register(`items.${index}.description`)}
                        />
                      }
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Qty">
                    <Input className={FILLED} {...numericField(register(`items.${index}.quantity`))} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Unit Price">
                    {isProduct ? (
                      <div className="flex h-10 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm font-medium tabular-nums text-muted-foreground">
                        {formatCurrency(unitPrice)}
                      </div>
                    ) : (
                      <Input className={FILLED} {...numericField(register(`items.${index}.unitPrice`), 'decimal')} />
                    )}
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Tax %">
                    <Input className={FILLED} {...numericField(register(`items.${index}.taxRate`), 'decimal')} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="GST">
                    <Select className={FILLED} {...register(`items.${index}.gstType`)}>
                      <option value="EXCLUSIVE">Exclusive</option>
                      <option value="INCLUSIVE">Inclusive</option>
                    </Select>
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Contract">
                    <Select className={FILLED} {...register(`items.${index}.contractType`)}>
                      <option value="LOCKED">Locked</option>
                      <option value="TRIAL">Trial</option>
                    </Select>
                  </Field>
                </div>
                <div className="flex items-end justify-between gap-2 sm:col-span-10">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Amount (incl. GST)</Label>
                    <p className="mt-1.5 text-sm font-semibold tabular-nums" style={{ color: 'var(--brand)' }}>{formatCurrency(amount)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      // With several lines, drop this row. On the only remaining
                      // line keep the required minimum but clear it back to a
                      // blank line, so a picked product/licence can be removed.
                      if (fields.length > 1) remove(index);
                      else
                        update(index, {
                          productId: null,
                          sku: null,
                          description: '',
                          quantity: 1,
                          unitPrice: 0,
                          taxRate: 10,
                          contractType: 'LOCKED',
                          gstType: 'EXCLUSIVE',
                        });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section className="glass up" style={{ animationDelay: '.14s' }}>
            <SectionHead icon={FileText} title="Notes" />
            <div className="p-[22px]">
              <Textarea className={cn(FILLED, 'min-h-[120px]')} placeholder="Notes visible on the invoice…" {...register('notes')} />
            </div>
          </section>
        </div>

        <section className="glass up" style={{ animationDelay: '.18s' }}>
          <SectionHead icon={CheckCircle} title="Summary" />
          <div className="space-y-4 p-[22px] text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums text-foreground">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span className="tabular-nums text-foreground">{formatCurrency(totals.tax)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Discount</span>
              <Input className={cn(FILLED, 'h-8 w-28 text-right')} {...numericField(register('discount'), 'decimal')} />
            </div>
            <div className="disp flex justify-between border-t border-border pt-4 text-lg font-bold" style={{ color: 'var(--brand)' }}>
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(totals.total)}</span>
            </div>
            {Number(invoice.amountPaid) > 0 && (
              <p className="chip c-warn" style={{ whiteSpace: 'normal', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
                {formatCurrency(invoice.amountPaid)} already paid on this invoice — editing the total changes the outstanding balance.
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(`/admin/billing/${id}`)} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={mutation.isPending}>
                {mutation.isPending && <Spinner />} Save changes
              </Button>
            </div>
          </div>
        </section>
      </div>
    </form>
  );
}
