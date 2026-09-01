import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Archive, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { productApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import type { Product } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/states';
import { numericField, titleCaseField } from '@/lib/input';
import { cn } from '@/lib/utils';

const schema = z.object({
  productCode: z.string().min(1, 'Required'),
  name: z.string().min(1, 'Required'),
  type: z.string().optional(),
  sku: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().optional(),
  pricePerQty: z.coerce.number().min(0, 'Cannot be negative'),
  taxRate: z.coerce.number().min(0).max(100, 'Must be between 0 and 100'),
  totalStock: z.coerce.number().int().min(0, 'Cannot be negative'),
  lowStockThreshold: z.coerce.number().int().min(0, 'Cannot be negative'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
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
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: 'ACTIVE',
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
              productCode: product.productCode,
              name: product.name,
              type: product.type ?? '',
              sku: product.sku ?? '',
              category: product.category ?? '',
              description: product.description ?? '',
              unit: product.unit ?? 'unit',
              pricePerQty: Number(product.pricePerQty),
              taxRate: Number(product.taxRate),
              totalStock: product.totalStock,
              lowStockThreshold: product.lowStockThreshold,
              status: product.status,
            }
          : {
              productCode: '',
              name: '',
              type: '',
              sku: '',
              category: '',
              description: '',
              unit: 'unit',
              pricePerQty: 0,
              taxRate: 10,
              totalStock: 0,
              lowStockThreshold: 10,
              status: 'ACTIVE',
            }
      );
    }
  }, [open, product, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      isEdit ? productApi.update(product!.id, values) : productApi.create(values),
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
          <Section icon={LayoutGrid} title="Basic Information">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Product Code" error={errors.productCode?.message}>
                <Input className={FILLED_CONTROL} {...register('productCode')} placeholder="EGD-P-016" />
              </Field>
              <Field label="Product Name" error={errors.name?.message}>
                <Input className={FILLED_CONTROL} {...titleCaseField(register('name'))} placeholder="Product name" />
              </Field>
              <Field label="Product Type">
                <Input className={FILLED_CONTROL} {...titleCaseField(register('type'))} placeholder="Software Licence" />
              </Field>
              <Field label="SKU">
                <Input className={FILLED_CONTROL} {...register('sku')} placeholder="SKU-016" />
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
            </div>
            <div className="mt-4">
              <Field label="Description">
                <Textarea className={cn(FILLED_CONTROL, "min-h-[80px]")} {...register('description')} placeholder="Optional description" />
              </Field>
            </div>
          </Section>

          <Section icon={DollarSign} title="Pricing">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Price Per Quantity" error={errors.pricePerQty?.message}>
                <Input className={FILLED_CONTROL} {...numericField(register('pricePerQty'), 'decimal')} />
              </Field>
              <Field label="Unit" hint="Shown as “per unit” on the catalogue">
                <Input className={FILLED_CONTROL} {...register('unit')} placeholder="unit / seat / licence" />
              </Field>
              <Field label="Tax Rate (%)" error={errors.taxRate?.message} hint="0 – 100">
                <Input className={FILLED_CONTROL} {...numericField(register('taxRate'), 'decimal')} />
              </Field>
            </div>
          </Section>

          <Section icon={Archive} title="Inventory">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Number of Stock"
                error={errors.totalStock?.message}
                hint={
                  isEdit
                    ? `${product!.availableStock} available · ${product!.reservedStock} reserved`
                    : undefined
                }
              >
                <Input className={FILLED_CONTROL} {...numericField(register('totalStock'))} />
              </Field>
              <Field
                label="Low Stock Threshold"
                error={errors.lowStockThreshold?.message}
                hint="Flagged as low once availability drops to this"
              >
                <Input className={FILLED_CONTROL} {...numericField(register('lowStockThreshold'))} />
              </Field>
            </div>
          </Section>
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
