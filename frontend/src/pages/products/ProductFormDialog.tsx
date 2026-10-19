import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { productApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import type { Product } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/states';
import { titleCaseField } from '@/lib/input';
import { cn } from '@/lib/utils';
import { CountrySelect, DEFAULT_COUNTRY } from '@/components/shared/PhoneInput';
import { BoldTextarea } from '@/components/shared/BoldTextarea';
import { currencyOf, currencySymbolOf, formatCountryPrice } from '@/lib/currencies';

const CONTRACT_TERMS = ['ONE_TIME', 'TRIAL', 'CONTRACT_1_YEAR', 'CONTRACT_2_YEARS'] as const;

const schema = z
  .object({
    country: z.string().length(2, 'Select a country'),
    name: z.string().min(1, 'Required'),
    type: z.string().optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    unit: z.string().optional(),
    pricePerQty: z.coerce.number().min(0, 'Cannot be negative'),
    taxRate: z.coerce.number().min(0).max(100, 'Must be between 0 and 100'),
    totalStock: z.coerce.number().int().min(0, 'Cannot be negative'),
    lowStockThreshold: z.coerce.number().int().min(0, 'Cannot be negative'),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    priceMode: z.enum(['AUTOMATIC', 'MANUAL']),
    billingPeriod: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'ANNUALLY', 'ONE_TIME']).or(z.literal('')),
    contractTerm: z.enum(CONTRACT_TERMS).or(z.literal('')),
    gstType: z.enum(['INCLUSIVE', 'EXCLUSIVE']),
    planInclusive: z.string().max(5000, 'Keep it under 5000 characters').optional(),
  })
  // A MANUAL product carries its own price, billing period and contract term.
  .superRefine((v, ctx) => {
    if (v.priceMode !== 'MANUAL') return;
    if (!(v.pricePerQty > 0)) ctx.addIssue({ code: 'custom', path: ['pricePerQty'], message: 'Enter a price' });
    if (!v.billingPeriod) ctx.addIssue({ code: 'custom', path: ['billingPeriod'], message: 'Required' });
    if (!v.contractTerm) ctx.addIssue({ code: 'custom', path: ['contractTerm'], message: 'Required' });
  });
type FormValues = z.infer<typeof schema>;

const FILLED_CONTROL = 'border-slate-200 bg-slate-50 shadow-none';

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 rounded-t-2xl border-b border-border/60 bg-secondary/30">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
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

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: Product | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!product;
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      country: DEFAULT_COUNTRY,
      status: 'ACTIVE',
      priceMode: 'AUTOMATIC',
      billingPeriod: '',
      contractTerm: '',
      gstType: 'EXCLUSIVE',
      planInclusive: '',
      taxRate: 10,
      pricePerQty: 0,
      totalStock: 0,
      lowStockThreshold: 10,
      unit: 'unit',
    },
  });

  useEffect(() => {
    if (open) {
      reset(
        product
          ? {
              country: product.country || DEFAULT_COUNTRY,
              name: product.name,
              type: product.type ?? '',
              category: product.category ?? '',
              description: product.description ?? '',
              unit: product.unit ?? 'unit',
              pricePerQty: Number(product.pricePerQty),
              taxRate: Number(product.taxRate),
              totalStock: product.totalStock,
              lowStockThreshold: product.lowStockThreshold,
              status: product.status,
              priceMode: product.priceMode ?? 'AUTOMATIC',
              billingPeriod: product.billingPeriod ?? '',
              // Products saved with a retired term (CONTRACTUAL / PERMANENT) start blank so one of the current terms gets picked.
              contractTerm: CONTRACT_TERMS.includes(product.contractTerm as never) ? product.contractTerm! : '',
              gstType: product.gstType ?? 'EXCLUSIVE',
              planInclusive: product.planInclusive ?? '',
            }
          : {
              country: DEFAULT_COUNTRY,
              name: '',
              type: '',
              category: '',
              description: '',
              unit: 'unit',
              pricePerQty: 0,
              taxRate: 10,
              totalStock: 0,
              lowStockThreshold: 10,
              status: 'ACTIVE',
              priceMode: 'AUTOMATIC',
              billingPeriod: '',
              contractTerm: '',
              gstType: 'EXCLUSIVE',
              planInclusive: '',
            }
      );
    }
  }, [open, product, reset]);

  // SKU is system-managed (auto-generated on create), so it's display-only.
  const { data: nextSku } = useQuery({
    queryKey: ['products', 'next-sku'],
    queryFn: productApi.nextSku,
    enabled: open && !isEdit,
  });
  const skuDisplay = isEdit ? product?.sku ?? '—' : nextSku ?? 'Generating…';

  // Product code is system-managed too (auto-generated EG-101, EG-102, …).
  const { data: nextCode } = useQuery({
    queryKey: ['products', 'next-product-code'],
    queryFn: productApi.nextProductCode,
    enabled: open && !isEdit,
  });
  const codeDisplay = isEdit ? product?.productCode ?? '—' : nextCode ?? 'Generating…';

  const isManual = watch('priceMode') === 'MANUAL';
  // The price is entered and shown in the selected country's currency.
  const country = watch('country');
  const priceValue = watch('pricePerQty');
  // Net amount: an inclusive price already holds the 10% GST; exclusive adds it on top.
  const gstType = watch('gstType');
  const price = Number(priceValue) || 0;
  const netAmount = gstType === 'EXCLUSIVE' ? Math.round(price * 1.1 * 100) / 100 : price;

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      // AUTOMATIC products are priced on each customer assignment; MANUAL ones
      // carry their own price, billing period and contract term. Inventory is
      // unlimited so products never go out of stock. Force those on every save.
      const manual = values.priceMode === 'MANUAL';
      const payload = {
        ...values,
        pricePerQty: manual ? values.pricePerQty : 0,
        billingPeriod: manual ? values.billingPeriod || null : null,
        contractTerm: manual ? values.contractTerm || null : null,
        gstType: manual ? values.gstType : null,
        planInclusive: values.planInclusive?.trim() || null,
        taxRate: manual ? 10 : 0,
        unit: values.unit?.trim() || 'unit',
        totalStock: 1_000_000,
        lowStockThreshold: 0,
      };
      return isEdit ? productApi.update(product!.id, payload) : productApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEdit ? 'Product updated' : 'Product created');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Product' : 'Add Product'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-2 space-y-6">
          <Section icon={LayoutGrid} title="Product Information">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Country" error={errors.country?.message}>
                <Controller
                  control={control}
                  name="country"
                  render={({ field }) => (
                    <CountrySelect value={field.value} onChange={field.onChange} className={FILLED_CONTROL} />
                  )}
                />
              </Field>
              <Field label="Product Code" hint="Auto-generated">
                <div className="flex h-10 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm font-medium tabular-nums text-foreground">
                  {codeDisplay}
                </div>
              </Field>
              <Field label="Product Name" error={errors.name?.message}>
                <Input className={FILLED_CONTROL} {...titleCaseField(register('name'))} placeholder="Product name" />
              </Field>
              <Field label="Product Type">
                <Input className={FILLED_CONTROL} {...titleCaseField(register('type'))} placeholder="Software Licence" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Plan Inclusive" error={errors.planInclusive?.message} hint="Optional. Select text and click B (or press Ctrl+B) to make it bold.">
                  <Controller
                    control={control}
                    name="planInclusive"
                    render={({ field }) => (
                      <BoldTextarea
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        className="bg-slate-50"
                        placeholder="What's included in this plan…"
                      />
                    )}
                  />
                </Field>
              </div>
              <Field label="SKU" hint="Auto-generated">
                <div className="flex h-10 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm font-medium tabular-nums text-foreground">
                  {skuDisplay}
                </div>
              </Field>
              <Field label="Category">
                <Input className={FILLED_CONTROL} {...titleCaseField(register('category'))} placeholder="Category" />
              </Field>
              <Field label="Status">
                <Select className={FILLED_CONTROL} {...register('status')}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              </Field>
              <Field label="Product Price">
                {/* Labels are intentionally swapped against the stored values:
                    "Automatic" = the product carries its own price (MANUAL),
                    "Manual" = priced per customer on assignment (AUTOMATIC).
                    Stored values stay as-is so existing products keep their behaviour. */}
                <Select className={FILLED_CONTROL} {...register('priceMode')}>
                  <option value="MANUAL">Automatic</option>
                  <option value="AUTOMATIC">Manual</option>
                </Select>
              </Field>
              {isManual && (
                <>
                  <Field
                    label={`Price (${currencyOf(country)})`}
                    error={errors.pricePerQty?.message}
                    hint={`${formatCountryPrice(priceValue, country)} ${currencyOf(country)}`}
                  >
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {currencySymbolOf(country)}
                      </span>
                      <Input
                        className={cn(
                          FILLED_CONTROL,
                          'pl-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                        )}
                        type="number"
                        step="0.01"
                        min="0"
                        // Without the arrows, a mouse-wheel scroll shouldn't silently change the price either.
                        onWheel={(e) => e.currentTarget.blur()}
                        {...register('pricePerQty')}
                        placeholder="0.00"
                      />
                    </div>
                  </Field>
                  <Field label="Charged" error={errors.billingPeriod?.message}>
                    <Select className={FILLED_CONTROL} {...register('billingPeriod')}>
                      <option value="">Select…</option>
                      <option value="ONE_TIME">One Time</option>
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                      <option value="ANNUALLY">Annually</option>
                    </Select>
                  </Field>
                  <Field label="Term" error={errors.contractTerm?.message}>
                    <Select className={FILLED_CONTROL} {...register('contractTerm')}>
                      <option value="">Select…</option>
                      <option value="ONE_TIME">One Time</option>
                      <option value="TRIAL">Trial</option>
                      <option value="CONTRACT_1_YEAR">Contract - 1 Year</option>
                      <option value="CONTRACT_2_YEARS">Contract - 2 Years</option>
                    </Select>
                  </Field>
                  <Field label="GST" error={errors.gstType?.message}>
                    <Select className={FILLED_CONTROL} {...register('gstType')}>
                      <option value="INCLUSIVE">Inclusive (10%)</option>
                      <option value="EXCLUSIVE">Exclusive (10%)</option>
                    </Select>
                  </Field>
                  <Field
                    label="Net Amount"
                    hint={gstType === 'EXCLUSIVE' ? 'Price + 10% GST' : 'Price already includes 10% GST'}
                  >
                    <div className="flex h-10 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm font-medium tabular-nums text-foreground">
                      {formatCountryPrice(netAmount, country)}
                    </div>
                  </Field>
                </>
              )}
            </div>
          </Section>

          <p className="text-xs text-muted-foreground">
            {isManual
              ? 'This product carries its own price.'
              : 'Pricing is set per customer when the product is assigned.'}{' '}
            Inventory is unlimited — products never go out of stock.
          </p>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Spinner />} {isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
