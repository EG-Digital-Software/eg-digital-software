import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import {
  productsApi,
  type BillingPeriod,
  type ContractTerm,
  type GstType,
  type PriceMode,
  type Product,
  type ProductInput,
  type ProductStatus,
} from '../../api/admin/products';
import { Btn, Card, ErrorBox, Loading, Muted, Screen, SectionHead, T } from '../../ui';
import { colors } from '../../theme';
import { CountryField, Field, Input, Segmented, SelectField } from '../customers/form/fields';
import { DEFAULT_COUNTRY } from '../customers/form/countries';
import { BILLING_PERIODS, CONTRACT_TERMS, invalidateProducts } from './common';
import { currencyOf, currencySymbolOf, formatCountryPrice } from './currency';

/** Form state — numbers stay strings while typing. */
interface Values {
  country: string;
  name: string;
  type: string;
  category: string;
  description: string;
  unit: string;
  pricePerQty: string;
  status: ProductStatus;
  priceMode: PriceMode;
  billingPeriod: BillingPeriod | '';
  contractTerm: ContractTerm | '';
  gstType: GstType;
  planInclusive: string;
}

type Errors = Partial<Record<keyof Values, string>>;

const isTerm = (v: unknown): v is ContractTerm => CONTRACT_TERMS.some((t) => t.value === v);

function initialValues(p?: Product): Values {
  if (!p) {
    return {
      country: DEFAULT_COUNTRY,
      name: '',
      type: '',
      category: '',
      description: '',
      unit: 'unit',
      pricePerQty: '0',
      status: 'ACTIVE',
      priceMode: 'AUTOMATIC',
      billingPeriod: '',
      contractTerm: '',
      gstType: 'EXCLUSIVE',
      planInclusive: '',
    };
  }
  return {
    country: p.country || DEFAULT_COUNTRY,
    name: p.name,
    type: p.type ?? '',
    category: p.category ?? '',
    description: p.description ?? '',
    unit: p.unit ?? 'unit',
    pricePerQty: String(Number(p.pricePerQty) || 0),
    status: p.status,
    priceMode: p.priceMode ?? 'AUTOMATIC',
    billingPeriod: p.billingPeriod ?? '',
    // A retired term (CONTRACTUAL / PERMANENT) starts blank so a current one gets picked.
    contractTerm: isTerm(p.contractTerm) ? p.contractTerm : '',
    gstType: p.gstType ?? 'EXCLUSIVE',
    planInclusive: p.planInclusive ?? '',
  };
}

/** Title-Case as typed, like the web's titleCaseField (length never changes). */
function toTitleCase(v: string): string {
  const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);
  return v.toLowerCase().replace(/[A-Za-zÀ-ɏ]+(?:'[A-Za-zÀ-ɏ]+)?/g, (word) => {
    const apos = word.indexOf("'");
    if (apos === -1) return cap(word);
    const before = word.slice(0, apos);
    const after = word.slice(apos + 1);
    return before.length === 1 ? `${cap(before)}'${cap(after)}` : `${cap(before)}'${after}`;
  });
}

/** Keep digits and one decimal point (max 2 decimals). */
const decimalOnly = (t: string) => {
  const clean = t.replace(/[^\d.]/g, '');
  const [int, ...rest] = clean.split('.');
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int;
};

function validate(v: Values): Errors {
  const e: Errors = {};
  if (!/^[A-Z]{2}$/.test(v.country)) e.country = 'Select a country';
  if (!v.name.trim()) e.name = 'Required';
  if (v.planInclusive.length > 5000) e.planInclusive = 'Keep it under 5000 characters';
  // A product with its own price (MANUAL) carries price, billing period and term.
  if (v.priceMode === 'MANUAL') {
    if (!(Number(v.pricePerQty) > 0)) e.pricePerQty = 'Enter a price';
    if (!v.billingPeriod) e.billingPeriod = 'Required';
    if (!v.contractTerm) e.contractTerm = 'Required';
  }
  return e;
}

/** Same payload the web form sends (unlimited inventory, AUTOMATIC fields cleared). */
function toPayload(v: Values): ProductInput {
  const manual = v.priceMode === 'MANUAL';
  return {
    country: v.country,
    name: v.name.trim(),
    type: v.type.trim(),
    category: v.category.trim(),
    description: v.description,
    status: v.status,
    priceMode: v.priceMode,
    pricePerQty: manual ? Number(v.pricePerQty) || 0 : 0,
    billingPeriod: manual ? v.billingPeriod || null : null,
    contractTerm: manual ? v.contractTerm || null : null,
    gstType: manual ? v.gstType : null,
    planInclusive: v.planInclusive.trim() || null,
    taxRate: manual ? 10 : 0,
    unit: v.unit.trim() || 'unit',
    totalStock: 1_000_000,
    lowStockThreshold: 0,
  };
}

/** ProductsForm { id? } — no id = new product. */
export default function ProductFormScreen() {
  const id: string | undefined = useRoute<any>().params?.id;
  const existing = useQuery({ queryKey: ['admin-products', 'detail', id], queryFn: () => productsApi.get(id!), enabled: !!id });

  if (id && existing.isLoading) {
    return (
      <Screen title="Edit product" back>
        <Loading />
      </Screen>
    );
  }
  if (id && (existing.isError || !existing.data)) {
    return (
      <Screen title="Edit product" back>
        <ErrorBox message={errorMessage(existing.error, 'Product not found')} onRetry={() => void existing.refetch()} />
      </Screen>
    );
  }
  return <ProductFormBody product={existing.data} />;
}

function ProductFormBody({ product }: { product?: Product }) {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const isEdit = !!product;
  const [v, setV] = useState<Values>(() => initialValues(product));
  const [errors, setErrors] = useState<Errors>({});
  const [tried, setTried] = useState(false);

  const set = <K extends keyof Values>(k: K, val: Values[K]) => {
    const next = { ...v, [k]: val };
    setV(next);
    if (tried) setErrors(validate(next));
  };

  // SKU and product code are system-managed (auto-generated on create).
  const nextSku = useQuery({ queryKey: ['admin-products', 'next-sku'], queryFn: productsApi.nextSku, enabled: !isEdit });
  const nextCode = useQuery({ queryKey: ['admin-products', 'next-product-code'], queryFn: productsApi.nextProductCode, enabled: !isEdit });
  const skuDisplay = isEdit ? product!.sku || '—' : (nextSku.data ?? 'Generating…');
  const codeDisplay = isEdit ? product!.productCode || '—' : (nextCode.data ?? 'Generating…');

  const isManual = v.priceMode === 'MANUAL';
  const price = Number(v.pricePerQty) || 0;
  // Inclusive already holds the 10% GST; exclusive adds it on top.
  const netAmount = v.gstType === 'EXCLUSIVE' ? Math.round(price * 1.1 * 100) / 100 : price;

  const save = useMutation({
    mutationFn: (values: Values) => (isEdit ? productsApi.update(product!.id, toPayload(values)) : productsApi.create(toPayload(values))),
    onSuccess: () => {
      invalidateProducts(qc);
      qc.invalidateQueries({ queryKey: ['admin-products', 'next-sku'] });
      qc.invalidateQueries({ queryKey: ['admin-products', 'next-product-code'] });
      Alert.alert(isEdit ? 'Product updated' : 'Product created');
      nav.goBack();
    },
    onError: (e) => Alert.alert(isEdit ? 'Could not save' : 'Could not create', errorMessage(e)),
  });

  const submit = () => {
    setTried(true);
    const e = validate(v);
    setErrors(e);
    if (Object.keys(e).length) {
      Alert.alert('Check the form', 'Some fields need attention.');
      return;
    }
    save.mutate(v);
  };

  return (
    <Screen title={isEdit ? 'Edit product' : 'New product'} back padBottom={48}>
      <SectionHead title="Product information" />
      <Card style={{ padding: 16, paddingTop: 2 }}>
        <Field label="Country" error={errors.country}>
          <CountryField value={v.country} onChange={(c) => set('country', c)} />
        </Field>
        <Field label="Product Code" hint="Auto-generated">
          <ReadBox value={codeDisplay} />
        </Field>
        <Field label="Product Name" error={errors.name}>
          <Input value={v.name} onChangeText={(t) => set('name', toTitleCase(t))} placeholder="Product name" invalid={!!errors.name} />
        </Field>
        <Field label="Product Type">
          <Input value={v.type} onChangeText={(t) => set('type', toTitleCase(t))} placeholder="Software Licence" />
        </Field>
        <Field label="Plan Inclusive" error={errors.planInclusive} hint="Optional. Wrap text in **double asterisks** to make it bold.">
          <Input
            value={v.planInclusive}
            onChangeText={(t) => set('planInclusive', t)}
            placeholder="What's included in this plan…"
            multiline
            textAlignVertical="top"
            maxLength={5000}
            style={{ minHeight: 110, paddingTop: 12, paddingBottom: 12 }}
            invalid={!!errors.planInclusive}
          />
        </Field>
        <Field label="SKU" hint="Auto-generated">
          <ReadBox value={skuDisplay} />
        </Field>
        <Field label="Category">
          <Input value={v.category} onChangeText={(t) => set('category', toTitleCase(t))} placeholder="Category" />
        </Field>
        <Field label="Status">
          <Segmented
            options={[
              { value: 'ACTIVE' as ProductStatus, label: 'Active' },
              { value: 'INACTIVE' as ProductStatus, label: 'Inactive' },
            ]}
            value={v.status}
            onChange={(s) => set('status', s)}
          />
        </Field>
        {/* Labels intentionally swapped against stored values, as on the web:
            "Automatic" = product carries its own price (MANUAL),
            "Manual" = priced per customer on assignment (AUTOMATIC). */}
        <Field label="Product Price">
          <Segmented
            options={[
              { value: 'MANUAL' as PriceMode, label: 'Automatic' },
              { value: 'AUTOMATIC' as PriceMode, label: 'Manual' },
            ]}
            value={v.priceMode}
            onChange={(m) => set('priceMode', m)}
          />
        </Field>
      </Card>

      {isManual ? (
        <>
          <SectionHead title="Pricing" />
          <Card style={{ padding: 16, paddingTop: 2 }}>
            <Field
              label={`Price (${currencyOf(v.country)})`}
              error={errors.pricePerQty}
              hint={`${formatCountryPrice(price, v.country)} ${currencyOf(v.country)}`}
            >
              <View style={{ justifyContent: 'center' }}>
                <T w="m" size={15} color={colors.muted} style={{ position: 'absolute', left: 14, zIndex: 1 }}>
                  {currencySymbolOf(v.country)}
                </T>
                <Input
                  value={v.pricePerQty}
                  onChangeText={(t) => set('pricePerQty', decimalOnly(t))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  style={{ paddingLeft: 40 }}
                  invalid={!!errors.pricePerQty}
                />
              </View>
            </Field>
            <Field label="Charged" error={errors.billingPeriod}>
              <SelectField
                value={v.billingPeriod}
                options={BILLING_PERIODS}
                onChange={(x) => set('billingPeriod', x as BillingPeriod)}
                title="Charged"
                placeholder="Select…"
                invalid={!!errors.billingPeriod}
              />
            </Field>
            <Field label="Term" error={errors.contractTerm}>
              <SelectField
                value={v.contractTerm}
                options={CONTRACT_TERMS}
                onChange={(x) => set('contractTerm', x as ContractTerm)}
                title="Term"
                placeholder="Select…"
                invalid={!!errors.contractTerm}
              />
            </Field>
            <Field label="GST">
              <Segmented
                options={[
                  { value: 'INCLUSIVE' as GstType, label: 'Inclusive (10%)' },
                  { value: 'EXCLUSIVE' as GstType, label: 'Exclusive (10%)' },
                ]}
                value={v.gstType}
                onChange={(g) => set('gstType', g)}
              />
            </Field>
            <Field label="Net Amount" hint={v.gstType === 'EXCLUSIVE' ? 'Price + 10% GST' : 'Price already includes 10% GST'}>
              <ReadBox value={formatCountryPrice(netAmount, v.country)} />
            </Field>
          </Card>
        </>
      ) : null}

      <Muted size={12.5} style={{ marginTop: 14, lineHeight: 18 }}>
        {isManual ? 'This product carries its own price.' : 'Pricing is set per customer when the product is assigned.'} Inventory is
        unlimited — products never go out of stock.
      </Muted>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Btn title="Cancel" variant="ghost" onPress={() => nav.goBack()} style={{ flex: 1 }} disabled={save.isPending} />
        <Btn title={isEdit ? 'Save changes' : 'Create product'} onPress={submit} loading={save.isPending} style={{ flex: 1.4 }} />
      </View>
    </Screen>
  );
}

function ReadBox({ value }: { value: string }) {
  return (
    <View style={{ minHeight: 50, borderRadius: 6, backgroundColor: colors.soft2, paddingHorizontal: 14, justifyContent: 'center' }}>
      <T w="m" size={15} color={colors.muted}>
        {value}
      </T>
    </View>
  );
}
