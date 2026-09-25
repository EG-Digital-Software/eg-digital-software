import { useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Receipt, Package, FileText, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { customerApi, invoiceApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import type { Invoice } from '@/types';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/states';
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
  licenceGroupNet,
  type LicenceGroup,
} from '@/lib/proration';
import { LineItemProduct } from '@/components/invoice/LineItemProduct';

const schema = z
  .object({
    clientId: z.string().min(1, 'Select a customer'),
    invoiceDate: z.string().optional(),
    // Not user-editable — auto-filled on submit from the invoice date + the
    // term's payment window.
    dueDate: z.string().optional(),
    // The payment window only (INVOICE_TERMS, or a legacy term already stored on
    // the selected product's assignment).
    term: z.string().optional(),
    // When the next invoice is raised. Auto-filled with the 1st of the month
    // after the invoice date, and editable — it drives the billing period and
    // the pro-rated line amounts.
    nextBillingDate: z.string().optional(),
    discount: z.coerce.number().min(0).default(0),
    notes: z.string().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().optional(),
          sku: z.string().optional(),
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

const FILLED_CONTROL = 'border-slate-200 bg-slate-50 shadow-none';

function Section({
  icon: Icon,
  title,
  description,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 rounded-t-2xl border-b border-border/60 bg-secondary/30">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InvoiceFormProps {
  /** Preselect this customer (by clientId). */
  clientId?: string;
  /** Hide the customer dropdown and lock to `clientId` — used from a customer page. */
  lockCustomer?: boolean;
  /** Called with the created invoice; caller handles navigation/closing. */
  onSuccess: (invoice: Invoice) => void;
  /** Optional cancel action (renders a Cancel button next to submit). */
  onCancel?: () => void;
  submitLabel?: string;
}

export function InvoiceForm({
  clientId: fixedClientId = '',
  lockCustomer = false,
  onSuccess,
  onCancel,
  submitLabel = 'Create Invoice',
}: InvoiceFormProps) {
  const qc = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => customerApi.list({ pageSize: 100, status: 'ACTIVE' }),
  });
  const { data: nextReference } = useQuery({
    queryKey: ['invoices', 'next-reference'],
    queryFn: () => invoiceApi.nextReference(),
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: fixedClientId,
      term: 'NET_7',
      discount: 0,
      items: [
        { description: '', quantity: 1, unitPrice: 0, taxRate: 10, contractType: 'LOCKED', gstType: 'EXCLUSIVE' },
      ],
    },
  });

  const { fields, append, remove, update } = useFieldArray({ control, name: 'items' });
  const items = watch('items');
  const discount = watch('discount');
  const term = watch('term');
  const invoiceDate = watch('invoiceDate');
  const nextBillingDate = watch('nextBillingDate');

  // The selected customer's full record — carries their product assignments
  // (price, tax, GST/contract type and the agreed invoicing term per product).
  const selectedClientId = watch('clientId');
  const { data: selectedCustomer } = useQuery({
    queryKey: ['customer', selectedClientId],
    queryFn: () => customerApi.get(selectedClientId),
    enabled: !!selectedClientId,
  });
  // Group this client's assigned products by licence key — each licence group is
  // one selectable "row" (all its products share one licence key), exactly like
  // the customer's Products & Licences table.
  const licenceGroups = useMemo<LicenceGroup[]>(
    () => buildLicenceGroups(selectedCustomer?.customerProducts),
    [selectedCustomer]
  );

  const lockedName =
    selectedCustomer?.companyName ||
    selectedCustomer?.contactPerson ||
    customers?.items.find((c) => c.clientId === fixedClientId)?.companyName ||
    fixedClientId;

  // Billing period + pro-ration, driven by the next billing date (NOT the term).
  // A product line bills its agreed net × this fraction, so an invoice issued
  // mid-month covers only the days up to the next billing date.
  const proration = useMemo(
    () => computeProration(invoiceDate, nextBillingDate),
    [invoiceDate, nextBillingDate]
  );
  const fraction = proration?.fraction ?? 1;
  const period = proration ? `${fmtDay(proration.start)} to ${fmtDay(proration.end)}` : '';

  // The due date is the term's payment window from the invoice date — the only
  // thing the term decides.
  const due = useMemo(() => computeDueDate(invoiceDate, term), [invoiceDate, term]);

  // Keep the next billing date auto-filled for the chosen invoice date. Only
  // fills a blank field, so an admin's own override is never overwritten.
  useEffect(() => {
    if (nextBillingDate) return;
    const next = defaultNextBillingDate(invoiceDate);
    if (next) setValue('nextBillingDate', toDateInput(next));
  }, [invoiceDate, nextBillingDate, setValue]);

  // Full agreed net for the licence group a product belongs to (before pro-rata).
  const groupBaseFor = (productId?: string): number | null => {
    const g = findLicenceGroup(licenceGroups, productId);
    return g ? licenceGroupNet(g) : null;
  };

  // Selecting a licence group fills the CURRENT line with the whole group as one
  // line — all its products share one licence key and the details are already
  // agreed at assignment time, so it becomes a single row (not one per product).
  const selectGroup = (index: number, groupKey: string) => {
    const g = licenceGroups.find((x) => x.key === groupKey);
    if (!g || !g.items.length) return;
    const rep = g.items[0];
    const grpTerm = g.items.find((cp) => cp.invoicingTerm)?.invoicingTerm;
    // Pro-rate the agreed net by the days this invoice covers. The fraction comes
    // from the billing period, so picking a product no longer depends on the term.
    const frac = fraction;
    const base = licenceGroupNet(g);
    update(index, {
      productId: rep.product.id,
      // Licence number rides along as the line's sku (shown on the invoice).
      sku: g.licenceKey || rep.product.sku || rep.product.productCode || '',
      description: g.items.map((cp) => cp.product.name).join('\n'),
      quantity: 1,
      unitPrice: round2(base * frac),
      taxRate: Number(rep.taxRate ?? 10) || 0,
      contractType: (rep.contractType === 'TRIAL' ? 'TRIAL' : 'LOCKED') as 'LOCKED' | 'TRIAL',
      gstType: (rep.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE') as 'INCLUSIVE' | 'EXCLUSIVE',
    });
    if (grpTerm) setValue('term', normalizeInvoiceTerm(grpTerm));
  };

  useEffect(() => {
    if (fixedClientId) setValue('clientId', fixedClientId);
  }, [fixedClientId, setValue]);

  // Keep product-backed line amounts in step with the invoice date/term: when
  // either changes, re-pro-rate each selected product's agreed net.
  useEffect(() => {
    const its = getValues('items') ?? [];
    its.forEach((it, i) => {
      if (!it.productId) return;
      const base = groupBaseFor(it.productId);
      if (base == null) return;
      const next = round2(base * fraction);
      if (Math.abs((Number(it.unitPrice) || 0) - next) > 0.005) {
        setValue(`items.${i}.unitPrice`, next, { shouldDirty: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fraction, licenceGroups]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const it of items ?? []) {
      const gross = (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0);
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
  }, [items, discount]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => invoiceApi.create(values),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Invoice created');
      onSuccess(invoice);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <form
      onSubmit={handleSubmit((v) =>
        mutation.mutate({
          ...v,
          // Auto-filled due date = invoice date + the term's payment window.
          // Local parts (not toISOString) so a UTC+ timezone can't shift the day.
          dueDate: due ? toDateInput(due) : undefined,
        })
      )}
      className="space-y-6"
    >
      <Section icon={Receipt} title="Invoice Details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Customer" error={errors.clientId?.message}>
            {lockCustomer ? (
              <div className="flex h-10 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm font-medium">
                {lockedName}
              </div>
            ) : (
              <Select className={FILLED_CONTROL} {...register('clientId')}>
                <option value="">Select customer…</option>
                {customers?.items.map((c) => (
                  <option key={c.id} value={c.clientId}>
                    {c.companyName || c.contactPerson || c.clientId} ({c.clientId})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Invoice Date">
            <Input className={FILLED_CONTROL} type="date" {...register('invoiceDate')} />
          </Field>
          <Field label="Term" hint="How long the client has to pay">
            <Select className={FILLED_CONTROL} {...register('term')}>
              {INVOICE_TERMS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              {/* A term already stored on the selected product's assignment that
                  is no longer offered — keep it selectable so picking that
                  product never silently rewrites its agreed term. */}
              {term && !INVOICE_TERMS.some((t) => t.value === term) && (
                <option value={term}>{invoiceTermLabel(term)}</option>
              )}
            </Select>
          </Field>
          <Field label="Due Date">
            {/* Auto-filled (read-only) = invoice date + the term's payment
                window. Moves with the invoice date and term. */}
            <div className="flex h-10 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm font-medium tabular-nums text-muted-foreground">
              {due ? fmtDay(due) : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              Pay within {termToDays(term)} day{termToDays(term) === 1 ? '' : 's'} of the invoice date
            </p>
          </Field>
          <Field label="Next Billing Date">
            {/* Drives the billing period and the pro-rated line amounts.
                Auto-filled with the 1st of the next month; editable. */}
            <Input className={FILLED_CONTROL} type="date" {...register('nextBillingDate')} />
            {proration && (
              <p className="text-xs text-muted-foreground">
                Billing period: {fmtDay(proration.start)} to {fmtDay(proration.end)} (
                {proration.billedDays}/{proration.periodDays} days)
              </p>
            )}
          </Field>
          <Field label="Reference" hint="Auto-generated — assigned when the invoice is created">
            <div className="flex h-10 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm font-medium tabular-nums text-muted-foreground">
              {nextReference ?? 'Auto-generated'}
            </div>
          </Field>
        </div>
      </Section>

      <Section
        icon={Package}
        title="Line Items"
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ description: period, quantity: 1, unitPrice: 0, taxRate: 10, contractType: 'LOCKED', gstType: 'EXCLUSIVE' })}
          >
            <Plus className="h-4 w-4" /> Add line
          </Button>
        }
      >
        <div className="space-y-3">
          {fields.map((field, index) => {
            const it = items?.[index];
            // Amount shown to the admin is GST-inclusive. When the line is marked
            // Inclusive the unit price already carries GST; otherwise we add it on.
            const gross = (Number(it?.unitPrice) || 0) * (Number(it?.quantity) || 0);
            const amount = it?.gstType === 'INCLUSIVE' ? gross : gross * (1 + (Number(it?.taxRate) || 0) / 100);
            return (
              <div
                key={field.id}
                className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-slate-50/50 p-4 sm:grid-cols-12"
              >
                <div className="sm:col-span-4">
                  <Field label="Product" error={errors.items?.[index]?.description?.message}>
                    {/* Product picked → read-only licence/SKU/agreed-price summary;
                        otherwise an editable description. The description still
                        rides along in form state (set by selectGroup), so the
                        invoice itself is unaffected either way. */}
                    <LineItemProduct
                      groups={licenceGroups}
                      productId={it?.productId}
                      sku={it?.sku}
                      fraction={fraction}
                      hasCustomer={!!selectedClientId}
                      controlClassName={FILLED_CONTROL}
                      onSelectGroup={(groupKey) => selectGroup(index, groupKey)}
                      fallback={
                        <Textarea
                          className={cn(FILLED_CONTROL, 'min-h-[60px] resize-y')}
                          rows={Math.max(2, it?.description?.split('\n').length ?? 1)}
                          placeholder="Description (one product per line)"
                          {...register(`items.${index}.description`)}
                        />
                      }
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Tax %">
                    <Input className={FILLED_CONTROL} {...numericField(register(`items.${index}.taxRate`), 'decimal')} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Contract">
                    <Select className={FILLED_CONTROL} {...register(`items.${index}.contractType`)}>
                      <option value="LOCKED">Locked</option>
                      <option value="TRIAL">Trial</option>
                    </Select>
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="GST">
                    <Select className={FILLED_CONTROL} {...register(`items.${index}.gstType`)}>
                      <option value="EXCLUSIVE">Exclusive</option>
                      <option value="INCLUSIVE">Inclusive</option>
                    </Select>
                  </Field>
                </div>
                <div className="flex items-end justify-between gap-2 sm:col-span-2">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Amount (incl. GST)</Label>
                    <p className="mt-1.5 text-sm font-semibold tabular-nums text-primary">{formatCurrency(amount)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      // With several lines, drop this row. On the only remaining
                      // line we keep the required minimum but clear it back to a
                      // blank line — so the picked product, SKU and price are
                      // removed and the dropdown resets.
                      if (fields.length > 1) remove(index);
                      else
                        update(index, {
                          productId: undefined,
                          sku: undefined,
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
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section icon={FileText} title="Notes">
            <Textarea className={cn(FILLED_CONTROL, 'min-h-[120px]')} placeholder="Notes visible on the invoice…" {...register('notes')} />
          </Section>
        </div>

        <Section icon={CheckCircle} title="Summary">
          <div className="space-y-4 text-sm">
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
              <Input className={cn(FILLED_CONTROL, 'h-8 w-28 text-right')} {...numericField(register('discount'), 'decimal')} />
            </div>
            <div className="flex justify-between border-t border-border pt-4 text-lg font-bold text-primary">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(totals.total)}</span>
            </div>
            <div className="flex gap-2">
              {onCancel && (
                <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={mutation.isPending}>
                  Cancel
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={mutation.isPending}>
                {mutation.isPending && <Spinner />} {submitLabel}
              </Button>
            </div>
          </div>
        </Section>
      </div>
    </form>
  );
}
