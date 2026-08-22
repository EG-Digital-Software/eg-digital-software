import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { productApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import type { Product } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/states';

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
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Groups the form the same way the customer form is grouped. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </section>
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
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Product' : 'Add Product'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
          <Section title="Basic Information">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Product Code" error={errors.productCode?.message}>
                <Input {...register('productCode')} placeholder="EGD-P-016" />
              </Field>
              <Field label="Product Name" error={errors.name?.message}>
                <Input {...register('name')} placeholder="Product name" />
              </Field>
              <Field label="Product Type">
                <Input {...register('type')} placeholder="Software Licence" />
              </Field>
              <Field label="SKU">
                <Input {...register('sku')} placeholder="SKU-016" />
              </Field>
              <Field label="Category">
                <Input {...register('category')} placeholder="Category" />
              </Field>
              <Field label="Status">
                <Select {...register('status')}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Textarea {...register('description')} placeholder="Optional description" />
            </Field>
          </Section>

          <Section title="Pricing">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Price Per Quantity" error={errors.pricePerQty?.message}>
                <Input type="number" step="0.01" min={0} {...register('pricePerQty')} />
              </Field>
              <Field label="Unit" hint="Shown as “per unit” on the catalogue">
                <Input {...register('unit')} placeholder="unit / seat / licence" />
              </Field>
              <Field label="Tax Rate (%)" error={errors.taxRate?.message} hint="0 – 100">
                <Input type="number" step="0.01" min={0} max={100} {...register('taxRate')} />
              </Field>
            </div>
          </Section>

          <Section title="Inventory">
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
                <Input type="number" min={0} {...register('totalStock')} />
              </Field>
              <Field
                label="Low Stock Threshold"
                error={errors.lowStockThreshold?.message}
                hint="Flagged as low once availability drops to this"
              >
                <Input type="number" min={0} {...register('lowStockThreshold')} />
              </Field>
            </div>
          </Section>
          <DialogFooter>
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
