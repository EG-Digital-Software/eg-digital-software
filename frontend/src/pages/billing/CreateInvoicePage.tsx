import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Receipt, Package, FileText, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { customerApi, invoiceApi, productApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/states';
import { formatCurrency, cn } from '@/lib/utils';
import { numericField } from '@/lib/input';

const schema = z.object({
  clientId: z.string().min(1, 'Select a customer'),
  invoiceDate: z.string().optional(),
  term: z.string().optional(),
  customDays: z.coerce.number().optional(),
  reference: z.string().optional(),
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
      })
    )
    .min(1),
});
type FormValues = z.infer<typeof schema>;

const TERMS = ['Due on Receipt', '7 Days', '15 Days', '30 Days', 'Custom'];

// ── Layout helpers ──

const FILLED_CONTROL = 'border-slate-200 bg-slate-50 shadow-none';

function Section({
  icon: Icon,
  title,
  description,
  children,
  action,
}: {
  icon: any;
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

function FormProgress({ percent }: { percent: number }) {
  const steps = [20, 40, 60, 80, 100];
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">Your progress</p>
      <p className="text-sm font-semibold text-primary">{percent}% to complete</p>
      <div className="relative mt-3 h-1.5 rounded-full bg-slate-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
        {steps.map((s) => (
          <span
            key={s}
            className={cn(
              'absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-500',
              percent >= s ? 'bg-primary' : 'bg-slate-300'
            )}
            style={{ left: `${s}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CreateInvoicePage() {
  const [params] = useSearchParams();
  const preClient = params.get('clientId') ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => customerApi.list({ pageSize: 100, status: 'ACTIVE' }),
  });
  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productApi.list({ pageSize: 100, status: 'ACTIVE' }),
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
      clientId: preClient,
      term: '30 Days',
      discount: 0,
      items: [{ description: '', quantity: 1, unitPrice: 0, taxRate: 10 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items');
  const discount = watch('discount');
  const term = watch('term');
  const productMap = useMemo(() => new Map((products?.items ?? []).map((p) => [p.id, p])), [products]);

  useEffect(() => {
    if (preClient) setValue('clientId', preClient);
  }, [preClient, setValue]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const it of items ?? []) {
      const net = (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0);
      subtotal += net;
      tax += net * ((Number(it.taxRate) || 0) / 100);
    }
    const disc = Number(discount) || 0;
    return {
      subtotal,
      tax,
      total: Math.max(0, subtotal + tax - disc),
    };
  }, [items, discount]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => invoiceApi.create(values),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Invoice created');
      navigate(`/admin/billing/${invoice.id}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const all = watch();
  const progressChecks = [
    !!all.clientId,
    !!all.term,
    all.items && all.items.length > 0 && !!all.items[0]?.description,
    all.items && all.items.length > 0 && (all.items[0]?.unitPrice ?? 0) > 0,
  ];
  const progress = Math.round(
    (progressChecks.filter(Boolean).length / progressChecks.length) * 100
  );

  return (
    <div className="w-full space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-secondary/30 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin/billing">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Create Invoice
              </h1>
              <p className="text-sm text-muted-foreground">
                Generate a new invoice for a customer
              </p>
            </div>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
            <Receipt className="h-4 w-4" />
          </span>
        </div>
        <div className="p-4 sm:p-5">
          <FormProgress percent={progress} />
        </div>
      </div>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
        <Section icon={Receipt} title="Invoice details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Customer" error={errors.clientId?.message}>
              <Select className={FILLED_CONTROL} {...register('clientId')}>
                <option value="">Select customer…</option>
                {customers?.items.map((c) => (
                  <option key={c.id} value={c.clientId}>
                    {c.companyName || c.contactPerson || c.clientId} ({c.clientId})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Invoice Date">
              <Input className={FILLED_CONTROL} type="date" {...register('invoiceDate')} />
            </Field>
            <Field label="Term">
              <Select className={FILLED_CONTROL} {...register('term')}>
                {TERMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            {term === 'Custom' ? (
              <Field label="Custom Days">
                <Input className={FILLED_CONTROL} placeholder="45" maxLength={4} {...numericField(register('customDays'))} />
              </Field>
            ) : (
              <Field label="Reference" hint="Auto-generated if left blank">
                <Input className={FILLED_CONTROL} placeholder="Auto-generated if left blank" {...register('reference')} />
              </Field>
            )}
          </div>
        </Section>

        <Section 
          icon={Package} 
          title="Line items" 
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ description: '', quantity: 1, unitPrice: 0, taxRate: 10 })}
            >
              <Plus className="h-4 w-4" /> Add line
            </Button>
          }
        >
          <div className="space-y-3">
            {fields.map((field, index) => {
              const it = items?.[index];
              const amount = (Number(it?.unitPrice) || 0) * (Number(it?.quantity) || 0);
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-slate-50/50 p-4 sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    <Field label="Product / Description" error={errors.items?.[index]?.description?.message}>
                      <Controller
                        control={control}
                        name={`items.${index}.productId`}
                        render={({ field: f }) => (
                          <Select
                            className={FILLED_CONTROL}
                            {...f}
                            onChange={(e) => {
                              f.onChange(e);
                              const p = productMap.get(e.target.value);
                              if (p) {
                                setValue(`items.${index}.description`, p.name);
                                setValue(`items.${index}.sku`, p.sku ?? p.productCode);
                                setValue(`items.${index}.unitPrice`, Number(p.pricePerQty));
                                setValue(`items.${index}.taxRate`, Number(p.taxRate));
                              }
                            }}
                          >
                            <option value="">Custom / select…</option>
                            {products?.items.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </Select>
                        )}
                      />
                      <Input className={FILLED_CONTROL} placeholder="Description" {...register(`items.${index}.description`)} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Qty">
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
                      onClick={() => fields.length > 1 && remove(index)}
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
              <Textarea className={cn(FILLED_CONTROL, "min-h-[120px]")} placeholder="Notes visible on the invoice…" {...register('notes')} />
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
                <Input className={cn(FILLED_CONTROL, "h-8 w-28 text-right")} {...numericField(register('discount'), 'decimal')} />
              </div>
              <div className="flex justify-between border-t border-border pt-4 text-lg font-bold text-primary">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(totals.total)}</span>
              </div>
              <Button type="submit" className="mt-2 w-full" disabled={mutation.isPending}>
                {mutation.isPending && <Spinner />} Create Invoice
              </Button>
            </div>
          </Section>
        </div>
      </form>
    </div>
  );
}
