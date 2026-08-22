import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { customerApi, invoiceApi, productApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { PageHeader } from '@/components/shared/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/states';
import { formatCurrency } from '@/lib/utils';

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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/billing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader title="Create Invoice" description="Generate a new invoice for a customer" />
      </div>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select {...register('clientId')}>
                <option value="">Select customer…</option>
                {customers?.items.map((c) => (
                  <option key={c.id} value={c.clientId}>
                    {c.companyName || `${c.firstName} ${c.lastName}`} ({c.clientId})
                  </option>
                ))}
              </Select>
              {errors.clientId && <p className="text-xs text-destructive">{errors.clientId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Invoice Date</Label>
              <Input type="date" {...register('invoiceDate')} />
            </div>
            <div className="space-y-1.5">
              <Label>Term</Label>
              <Select {...register('term')}>
                {TERMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            {term === 'Custom' ? (
              <div className="space-y-1.5">
                <Label>Custom Days</Label>
                <Input type="number" placeholder="45" {...register('customDays')} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input {...register('reference')} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Line items</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ description: '', quantity: 1, unitPrice: 0, taxRate: 10 })}
            >
              <Plus className="h-4 w-4" /> Add line
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field, index) => {
              const it = items?.[index];
              const amount = (Number(it?.unitPrice) || 0) * (Number(it?.quantity) || 0);
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    <Label className="text-xs">Product / Description</Label>
                    <Controller
                      control={control}
                      name={`items.${index}.productId`}
                      render={({ field: f }) => (
                        <Select
                          className="mt-1"
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
                    <Input className="mt-2" placeholder="Description" {...register(`items.${index}.description`)} />
                    {errors.items?.[index]?.description && (
                      <p className="mt-1 text-xs text-destructive">Required</p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Qty</Label>
                    <Input className="mt-1" type="number" min={1} {...register(`items.${index}.quantity`)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Unit Price</Label>
                    <Input className="mt-1" type="number" step="0.01" {...register(`items.${index}.unitPrice`)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Tax %</Label>
                    <Input className="mt-1" type="number" step="0.01" {...register(`items.${index}.taxRate`)} />
                  </div>
                  <div className="flex items-end justify-between gap-2 sm:col-span-2">
                    <div>
                      <Label className="text-xs">Amount</Label>
                      <p className="mt-2 text-sm font-medium tabular-nums">{formatCurrency(amount)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => fields.length > 1 && remove(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea placeholder="Notes visible on the invoice…" {...register('notes')} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
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
                <Input type="number" step="0.01" className="h-8 w-28 text-right" {...register('discount')} />
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(totals.total)}</span>
              </div>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending && <Spinner />} Create Invoice
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
