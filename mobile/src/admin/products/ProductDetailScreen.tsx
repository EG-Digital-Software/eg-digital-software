import React from 'react';
import { View, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { productsApi, type Product, type ProductStatus } from '../../api/admin/products';
import { Btn, Card, ErrorBox, KV, Loading, Muted, Pill, Screen, SectionHead, T } from '../../ui';
import { colors } from '../../theme';
import { ProductGlyph } from '../dashboard/ProductsScreen';
import { countryByCode } from '../customers/form/countries';
import { BILLING_PERIODS, CONTRACT_TERMS, hasOwnPrice, invalidateProducts, labelOf, priceLabel } from './common';
import { currencyOf, formatCountryPrice } from './currency';

/** ProductsDetail { id } — one product, with edit / activate / delete. */
export default function ProductDetailScreen() {
  const nav = useNavigation<any>();
  const id: string = useRoute<any>().params?.id;
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ['admin-products', 'detail', id], queryFn: () => productsApi.get(id), enabled: !!id });
  const p = q.data;

  const setStatus = useMutation({
    mutationFn: (status: ProductStatus) => productsApi.update(id, { status }),
    onSuccess: (_r, status) => {
      invalidateProducts(qc);
      Alert.alert(status === 'ACTIVE' ? 'Product activated' : 'Product deactivated');
    },
    onError: (e) => Alert.alert('Could not change status', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => productsApi.remove(id),
    onSuccess: ({ unassigned, invoicesUpdated }) => {
      invalidateProducts(qc, true);
      const parts = [
        unassigned ? `unassigned from ${unassigned} customer ${unassigned === 1 ? 'product' : 'products'}` : null,
        invoicesUpdated ? `removed from ${invoicesUpdated} unpaid ${invoicesUpdated === 1 ? 'invoice' : 'invoices'}` : null,
      ].filter(Boolean);
      Alert.alert('Product deleted', parts.length ? `Also ${parts.join(', ')}.` : undefined);
      nav.goBack();
    },
    onError: (e) => Alert.alert('Could not delete', errorMessage(e)),
  });

  if (q.isLoading) {
    return (
      <Screen title="Product" back>
        <Loading />
      </Screen>
    );
  }
  if (q.isError || !p) {
    return (
      <Screen title="Product" back>
        <ErrorBox message={errorMessage(q.error, 'Product not found')} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }

  const active = p.status === 'ACTIVE';
  const own = hasOwnPrice(p);

  const confirmStatus = () => {
    const next: ProductStatus = active ? 'INACTIVE' : 'ACTIVE';
    Alert.alert(
      active ? 'Deactivate product?' : 'Activate product?',
      active ? `"${p.name}" will be marked inactive.` : `"${p.name}" will be marked active.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: active ? 'Deactivate' : 'Activate', onPress: () => setStatus.mutate(next) },
      ]
    );
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete product?',
      `"${p.name}" will be permanently deleted. It will also be removed from every customer it is assigned to, along with those licences, and taken off every unpaid invoice (totals are recalculated). Paid and part-paid invoices stay as issued. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
      ]
    );

  return (
    <Screen title="Product" back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Card style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ProductGlyph name={p.name} parts={[p.category, p.type]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w="s" size={17}>
              {p.name}
            </T>
            <T mono size={12} color={colors.muted}>
              {p.productCode}
            </T>
          </View>
          <Pill kind={active ? 'ok' : 'ns'} label={active ? 'Active' : 'Inactive'} />
        </View>
        <T w="b" size={22} style={{ marginTop: 14 }}>
          {priceLabel(p)}
        </T>
        <Muted size={12.5}>{own ? 'This product carries its own price.' : 'Pricing is set per customer when the product is assigned.'}</Muted>
      </Card>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Btn title="Edit" icon="create-outline" onPress={() => nav.navigate('ProductsForm', { id: p.id })} style={{ flex: 1 }} />
        <Btn
          title={active ? 'Deactivate' : 'Activate'}
          icon={active ? 'pause-circle-outline' : 'play-circle-outline'}
          variant={active ? 'ghost' : 'green'}
          loading={setStatus.isPending}
          onPress={confirmStatus}
          style={{ flex: 1 }}
        />
      </View>

      <SectionHead title="Product information" />
      <KV rows={infoRows(p)} />

      {own ? (
        <>
          <SectionHead title="Pricing" />
          <KV rows={pricingRows(p)} />
        </>
      ) : null}

      {p.planInclusive?.trim() ? (
        <>
          <SectionHead title="Plan inclusive" />
          <Card style={{ padding: 16 }}>
            <BoldText text={p.planInclusive} />
          </Card>
        </>
      ) : null}

      {p.description?.trim() ? (
        <>
          <SectionHead title="Description" />
          <Card style={{ padding: 16 }}>
            <T size={14} style={{ lineHeight: 21 }}>
              {p.description}
            </T>
          </Card>
        </>
      ) : null}

      <Btn
        title="Delete product"
        icon="trash-outline"
        variant="ghost"
        loading={remove.isPending}
        onPress={confirmDelete}
        style={{ marginTop: 22, borderColor: colors.redBg }}
      />
      <Muted size={12} style={{ textAlign: 'center', marginTop: 8 }}>
        Inventory is unlimited — products never go out of stock.
      </Muted>
    </Screen>
  );
}

function infoRows(p: Product): [string, string | null | undefined][] {
  return [
    ['Product code', p.productCode],
    ['SKU', p.sku || '—'],
    ['Type', p.type || '—'],
    ['Category', p.category || '—'],
    ['Country', p.country ? (countryByCode(p.country)?.name ?? p.country) : '—'],
    ['Product price', hasOwnPrice(p) ? 'Automatic' : 'Manual'],
    ['Unit', p.unit || null],
    ['Created', p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : null],
  ];
}

function pricingRows(p: Product): [string, string | null | undefined][] {
  const price = Number(p.pricePerQty) || 0;
  const net = p.gstType === 'EXCLUSIVE' ? Math.round(price * 1.1 * 100) / 100 : price;
  return [
    [`Price (${currencyOf(p.country)})`, formatCountryPrice(price, p.country)],
    ['Charged', labelOf(BILLING_PERIODS, p.billingPeriod) ?? '—'],
    ['Term', labelOf(CONTRACT_TERMS, p.contractTerm) ?? '—'],
    ['GST', p.gstType === 'INCLUSIVE' ? 'Inclusive (10%)' : p.gstType === 'EXCLUSIVE' ? 'Exclusive (10%)' : '—'],
    ['Net amount', formatCountryPrice(net, p.country)],
  ];
}

/** Renders **double-asterisk** runs bold (the web's BoldTextarea format). */
export function BoldText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <T size={14} style={{ lineHeight: 21 }}>
      {parts.map((part, i) =>
        /^\*\*[^*]+\*\*$/.test(part) ? (
          <T key={i} w="b" size={14}>
            {part.slice(2, -2)}
          </T>
        ) : (
          part
        )
      )}
    </T>
  );
}
