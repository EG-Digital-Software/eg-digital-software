import { useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Receipt, Package, FileText, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { customerApi, invoiceApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import type { CustomerProduct, Invoice } from '@/types';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/states';
import { formatCurrency, cn } from '@/lib/utils';
import { numericField } from '@/lib/input';
import { INVOICE_TERMS } from '@/lib/customer';

const schema = z
  .object({
    clientId: z.string().min(1, 'Select a customer'),
    invoiceDate: z.string().optional(),
    // A preset code (INVOICE_TERMS), a customer's saved term, or the sentinel
    // 'MANUAL' — in which case the typed term lives in termManual until submit.
    term: z.string().optional(),
    termManual: z.string().optional(),
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
  })
  .refine((v) => v.term !== 'MANUAL' || !!v.termManual?.trim(), {
    message: 'Enter the payment term',
    path: ['termManual'],
  });
type FormValues = z.infer<typeof schema>;

/** A licence group = all products that share one licence key (one "row" in the
 *  customer's Products & Licences table). */
interface LicenceGroup {
  key: string;
  licenceKey: string;
  items: CustomerProduct[];
}

/** Days a term adds to the invoice date (mirrors backend resolveDueDate). */
function termToDays(term?: string, termManual?: string): number {
  const parse = (s?: string) => {
    const m = /(\d+)/.exec(s ?? '');
    return m ? parseInt(m[1], 10) : 30;
  };
  switch (term) {
    case 'DUE_ON_RECEIPT':
    case 'Due on Receipt':
      return 0;
    case 'NET_7':
    case '7 Days':
      return 7;
    case 'NET_14':
      return 14;
    case '15 Days':
      return 15;
    case 'NET_30':
    case '30 Days':
      return 30;
    case 'NET_45':
      return 45;
    case 'NET_60':
      return 60;
    case 'NET_90':
      return 90;
    case 'MANUAL':
      return parse(termManual);
    default:
      return parse(term);
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 08-Sep-2026 */
function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** Billing period "08-Sep-2026 to 22-Sep-2026" from the invoice date + term. */
function billingPeriod(invoiceDate?: string, term?: string, termManual?: string): string {
  const start = invoiceDate ? new Date(invoiceDate) : new Date();
  if (isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + termToDays(term, termManual) * 86_400_000);
  return `${fmtDay(start)} to ${fmtDay(end)}`;
}

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
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: fixedClientId,
      term: 'NET_30',
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
  const termManual = watch('termManual');
  const invoiceDate = watch('invoiceDate');

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
  const licenceGroups = useMemo<LicenceGroup[]>(() => {
    const map = new Map<string, LicenceGroup>();
    for (const cp of selectedCustomer?.customerProducts ?? []) {
      const licenceKey = cp.licence?.licenceKey ?? '';
      const key = licenceKey || cp.id; // products without a licence stand alone
      if (!map.has(key)) map.set(key, { key, licenceKey, items: [] });
      map.get(key)!.items.push(cp);
    }
    return [...map.values()];
  }, [selectedCustomer]);
  // Which licence group a line currently belongs to (by its productId).
  const groupKeyForProduct = (productId?: string) =>
    licenceGroups.find((g) => g.items.some((cp) => cp.product.id === productId))?.key ?? '';

  const lockedName =
    selectedCustomer?.companyName ||
    selectedCustomer?.contactPerson ||
    customers?.items.find((c) => c.clientId === fixedClientId)?.companyName ||
    fixedClientId;

  // Billing period (invoice date → due date) — default text for any custom line
  // the admin adds by hand.
  const period = useMemo(() => billingPeriod(invoiceDate, term, termManual), [invoiceDate, term, termManual]);

  // Selecting a licence group fills the CURRENT line with the whole group as one
  // line — all its products share one licence key and the details are already
  // agreed at assignment time, so it becomes a single row (not one per product).
  const selectGroup = (index: number, groupKey: string) => {
    const g = licenceGroups.find((x) => x.key === groupKey);
    if (!g || !g.items.length) return;
    const rep = g.items[0];
    // Unit/Hours multiplier is shared across the group; agreed prices sum up.
    const gu = rep.unitHoursEnabled ? Number(rep.unitHours) || 0 : 1;
    const base = g.items.reduce((s, cp) => s + (Number(cp.price) || 0) * gu, 0);
    update(index, {
      productId: rep.product.id,
      // Licence number rides along as the line's sku (shown on the invoice).
      sku: g.licenceKey || rep.product.sku || rep.product.productCode || '',
      description: g.items.map((cp) => cp.product.name).join('\n'),
      quantity: 1,
      unitPrice: base,
      taxRate: Number(rep.taxRate ?? 10) || 0,
      contractType: (rep.contractType === 'TRIAL' ? 'TRIAL' : 'LOCKED') as 'LOCKED' | 'TRIAL',
      gstType: (rep.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE') as 'INCLUSIVE' | 'EXCLUSIVE',
    });
    const grpTerm = g.items.find((cp) => cp.invoicingTerm)?.invoicingTerm;
    if (grpTerm) setValue('term', grpTerm);
  };

  useEffect(() => {
    if (fixedClientId) setValue('clientId', fixedClientId);
  }, [fixedClientId, setValue]);

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
      onSubmit={handleSubmit(({ termManual: tm, ...v }) =>
        mutation.mutate({ ...v, term: v.term === 'MANUAL' ? tm?.trim() || undefined : v.term })
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
          <Field label="Term" hint="Auto-set from the selected product's agreed invoicing term">
            <Select className={FILLED_CONTROL} {...register('term')}>
              {INVOICE_TERMS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              {term && term !== 'MANUAL' && !INVOICE_TERMS.some((t) => t.value === term) && (
                <option value={term}>{term}</option>
              )}
              <option value="MANUAL">Enter manually…</option>
            </Select>
          </Field>
          {term === 'MANUAL' && (
            <Field label="Term (manual)" error={errors.termManual?.message} hint="e.g. Net 21 days or 50% upfront">
              <Input className={FILLED_CONTROL} placeholder="e.g. Net 21 days" maxLength={60} {...register('termManual')} />
            </Field>
          )}
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
            const amount = (Number(it?.unitPrice) || 0) * (Number(it?.quantity) || 0);
            // The licence group backing this line (if a product was picked). When
            // set, we hide the editable description and show a read-only SKU +
            // agreed-price summary instead; the description still rides along in
            // the form state (set by selectGroup), so the invoice is unaffected.
            const selectedGroup = licenceGroups.find((g) =>
              g.items.some((cp) => cp.product.id === it?.productId)
            );
            return (
              <div
                key={field.id}
                className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-slate-50/50 p-4 sm:grid-cols-12"
              >
                <div className="sm:col-span-4">
                  <Field label="Product" error={errors.items?.[index]?.description?.message}>
                    <Select
                      className={FILLED_CONTROL}
                      value={groupKeyForProduct(it?.productId)}
                      onChange={(e) => selectGroup(index, e.target.value)}
                    >
                      <option value="">
                        {selectedClientId
                          ? licenceGroups.length
                            ? 'Select licence / products…'
                            : 'No products assigned to this client'
                          : 'Select a customer first…'}
                      </option>
                      {licenceGroups.map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.items.map((cp) => cp.product.name).join(' + ')}
                          {g.licenceKey ? ` · ${g.licenceKey}` : ''}
                        </option>
                      ))}
                    </Select>
                    {selectedGroup ? (
                      // Product picked — read-only SKU + agreed-price summary.
                      <div className="mt-1.5 space-y-1 rounded-md border border-border bg-slate-50/60 p-2.5 text-xs text-muted-foreground">
                        {selectedGroup.items.map((cp) => (
                          <div key={cp.id} className="flex items-center justify-between gap-2">
                            <span className="truncate">
                              {cp.product.name}
                              <span className="ml-1 text-muted-foreground/70">
                                · SKU: {cp.product.sku || cp.product.productCode || '—'}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums font-medium text-foreground">
                              {formatCurrency(Number(cp.price) || 0)}
                            </span>
                          </div>
                        ))}
                        {it?.sku && <div>Licence: {it.sku}</div>}
                      </div>
                    ) : (
                      // No product picked (blank or manually-added line) — let the
                      // admin type a description by hand.
                      <Textarea
                        className={cn(FILLED_CONTROL, 'min-h-[60px] resize-y')}
                        rows={Math.max(2, it?.description?.split('\n').length ?? 1)}
                        placeholder="Description (one product per line)"
                        {...register(`items.${index}.description`)}
                      />
                    )}
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="QTY/Days">
                    <Input className={FILLED_CONTROL} {...numericField(register(`items.${index}.quantity`))} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Unit Price">
                    <Input className={FILLED_CONTROL} {...numericField(register(`items.${index}.unitPrice`), 'decimal')} />
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
                    <Label className="text-xs font-medium text-muted-foreground">Amount</Label>
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
