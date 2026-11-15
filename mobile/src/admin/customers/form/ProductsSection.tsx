import React from 'react';
import { View } from 'react-native';
import { Btn, Muted } from '../../../ui';
import { colors } from '../../../theme';
import { money } from '../../../lib/portal';
import type { ProductOption } from '../../../api/admin/customerForm';
import { DateField } from '../../pickers';
import { Field, Input, Section, SelectField, Tile } from './fields';
import { EMPTY_PRODUCT, clean, productRowTotal, type Errors, type ProductRowValues } from './model';

/**
 * Products — assign products and licences while creating the customer (managed
 * later from the customer's detail screen, like the web form).
 */
export function ProductsSection({
  rows,
  products,
  onChange,
  errors,
  open,
  onToggle,
}: {
  rows: ProductRowValues[];
  products: ProductOption[];
  onChange: (rows: ProductRowValues[]) => void;
  errors: Errors;
  open: boolean;
  onToggle: () => void;
}) {
  const setRow = (i: number, patch: Partial<ProductRowValues>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const errorCount = Object.keys(errors).filter((k) => k.startsWith('assignedProducts.')).length;
  const options = products.map((p) => ({ value: p.id, label: p.name }));

  return (
    <Section
      icon="cube-outline"
      title="Products"
      description="Assign products and licences to this customer"
      open={open}
      onToggle={onToggle}
      errorCount={errorCount}
    >
      {rows.length === 0 ? (
        <Muted size={13.5} style={{ marginTop: 14 }}>
          No products assigned yet.
        </Muted>
      ) : null}
      {rows.map((row, i) => {
        const product = products.find((p) => p.id === row.productId);
        const total = productRowTotal(row, product?.gstType === 'INCLUSIVE');
        const err = (k: keyof ProductRowValues) => errors[`assignedProducts.${i}.${k}`];
        return (
          <Tile key={i} title={`Product ${i + 1}`} onRemove={() => onChange(rows.filter((_, j) => j !== i))}>
            <Field label="Product" error={err('productId')}>
              <SelectField
                value={row.productId}
                options={options}
                title="Select product"
                placeholder="Select product…"
                searchable={options.length > 8}
                invalid={!!err('productId')}
                onChange={(id) => {
                  // Pre-fill the agreed price from the product's own price (editable).
                  const listPrice = Number(products.find((p) => p.id === id)?.pricePerQty) || 0;
                  setRow(i, listPrice > 0 ? { productId: id, price: String(listPrice) } : { productId: id });
                }}
              />
            </Field>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Agreed Price" style={{ flex: 1 }}>
                <Input value={row.price} onChangeText={(t) => setRow(i, { price: clean('decimal', t) })} keyboardType="decimal-pad" />
              </Field>
              <Field label="Discount (%)" error={err('discountPercent')} style={{ flex: 1 }}>
                <Input
                  value={row.discountPercent}
                  placeholder="0"
                  onChangeText={(t) => setRow(i, { discountPercent: clean('decimal', t) })}
                  keyboardType="decimal-pad"
                  invalid={!!err('discountPercent')}
                />
              </Field>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Unit" style={{ flex: 1 }}>
                <Input value={row.unit} placeholder="unit / seat / licence" onChangeText={(t) => setRow(i, { unit: t })} maxLength={30} />
              </Field>
              <Field label="Tax Rate (%)" error={err('taxRate')} style={{ flex: 1 }}>
                <Input
                  value={row.taxRate}
                  onChangeText={(t) => setRow(i, { taxRate: clean('decimal', t) })}
                  keyboardType="decimal-pad"
                  invalid={!!err('taxRate')}
                />
              </Field>
            </View>
            <Field label="Total Amount" hint={product?.gstType === 'INCLUSIVE' ? 'Price already includes GST' : undefined}>
              <Input value={money(total)} editable={false} style={{ backgroundColor: colors.track }} />
            </Field>
            <Field label="Licence Key">
              <Input value={row.licence} placeholder="Auto-generated" onChangeText={(t) => setRow(i, { licence: t })} autoCapitalize="characters" />
            </Field>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Issue Date" error={err('issueDate')} style={{ flex: 1 }}>
                <DateField
                  value={row.issueDate}
                  onChange={(d) => setRow(i, { issueDate: d })}
                  placeholder="Pick a date"
                  clearable
                  max={row.expiryDate || undefined}
                />
              </Field>
              <Field label="Expiry Date" error={err('expiryDate')} style={{ flex: 1 }}>
                <DateField
                  value={row.expiryDate}
                  onChange={(d) => setRow(i, { expiryDate: d })}
                  placeholder="Pick a date"
                  clearable
                  min={row.issueDate || undefined}
                />
              </Field>
            </View>
          </Tile>
        );
      })}
      <Btn title="Add Product" icon="add" variant="dashed" onPress={() => onChange([...rows, { ...EMPTY_PRODUCT }])} style={{ marginTop: 14 }} />
    </Section>
  );
}
