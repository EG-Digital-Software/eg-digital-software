import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { dashboardApi, type ProductRow } from '../../api/admin/dashboard';
import { money, prettyEnum } from '../../lib/portal';
import { Btn, Card, Chips, EmptyCard, ErrorBox, Loading, Muted, Pill, Screen, SearchField, T, type IconName } from '../../ui';
import { colors } from '../../theme';
import { useDebounced } from './common';

/** Icon picked from the product's name/category/type (web ProductGlyph, simplified). */
function glyphFor(text: string): IconName {
  const t = text.toLowerCase();
  if (/seo|search|keyword/.test(t)) return 'search-outline';
  if (/social|facebook|instagram|meta|linkedin/.test(t)) return 'share-social-outline';
  if (/web|site|domain|hosting|wordpress/.test(t)) return 'globe-outline';
  if (/mail|email|365|outlook/.test(t)) return 'mail-outline';
  if (/cloud|azure|server|backup/.test(t)) return 'cloud-outline';
  if (/security|antivirus|firewall/.test(t)) return 'shield-checkmark-outline';
  if (/support|help|it /.test(t)) return 'headset-outline';
  if (/design|logo|brand|graphic/.test(t)) return 'color-palette-outline';
  if (/app|software|licen[cs]e/.test(t)) return 'apps-outline';
  if (/listing|local|map|google business/.test(t)) return 'location-outline';
  return 'cube-outline';
}

export function ProductGlyph({ name, parts = [] }: { name: string; parts?: (string | null | undefined)[] }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={glyphFor([name, ...parts].filter(Boolean).join(' '))} size={18} color={colors.green} />
    </View>
  );
}

type StatusFilter = '' | 'ACTIVE' | 'INACTIVE';
const PAGE = 25;

/** Read-only product catalogue (DashProducts) — "View all" from the dashboard. */
export default function ProductsScreen() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const debounced = useDebounced(search.trim());

  const q = useInfiniteQuery({
    queryKey: ['admin-dashboard', 'product-list', { status, search: debounced }],
    queryFn: ({ pageParam }) => dashboardApi.productList({ page: pageParam, pageSize: PAGE, status, search: debounced }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.meta.total ?? 0;

  return (
    <Screen title="Products" back refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => q.refetch()}>
      <SearchField value={search} onChangeText={setSearch} placeholder="Search products…" />
      <Chips
        style={{ marginTop: 12 }}
        options={[
          { value: '' as StatusFilter, label: 'All' },
          { value: 'ACTIVE' as StatusFilter, label: 'Active' },
          { value: 'INACTIVE' as StatusFilter, label: 'Inactive' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <View style={{ marginTop: 14, gap: 10 }}>
        {q.isError ? (
          <ErrorBox message={errorMessage(q.error, 'Could not load products')} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Loading />
        ) : !items.length ? (
          <EmptyCard icon="cube-outline" title={debounced || status ? 'No matching products' : 'No products'} />
        ) : (
          <>
            {items.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
            <Muted size={12} style={{ textAlign: 'center' }}>
              Showing {items.length} of {total}
            </Muted>
            {q.hasNextPage ? <Btn title="Load more" variant="ghost" onPress={() => q.fetchNextPage()} loading={q.isFetchingNextPage} /> : null}
          </>
        )}
      </View>
    </Screen>
  );
}

function ProductCard({ p }: { p: ProductRow }) {
  const low = p.availableStock !== undefined && p.lowStockThreshold !== undefined && p.availableStock <= p.lowStockThreshold;
  const price = p.pricePerQty !== undefined ? Number(p.pricePerQty) : null;
  return (
    <Card style={{ padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ProductGlyph name={p.name} parts={[p.category, p.type]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w="s" size={14.5} numberOfLines={2}>
            {p.name}
          </T>
          <Muted size={12} numberOfLines={1}>
            {[p.category, p.productCode].filter(Boolean).join(' · ') || '—'}
          </Muted>
        </View>
        <Pill kind={p.status === 'ACTIVE' ? 'ok' : 'ns'} label={p.status === 'ACTIVE' ? 'Active' : 'Inactive'} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
        {price !== null && Number.isFinite(price) ? (
          <Muted size={12.5}>
            <T w="s" size={12.5}>
              {money(price)}
            </T>
            {p.unit ? ` / ${p.unit}` : ''}
            {p.billingPeriod ? ` · ${prettyEnum(p.billingPeriod)}` : ''}
          </Muted>
        ) : null}
        {p.availableStock !== undefined ? (
          <Muted size={12.5} color={low ? colors.warnFg : colors.muted}>
            {p.availableStock} in stock
          </Muted>
        ) : null}
        {p.sku ? (
          <T mono size={11.5} color={colors.faint}>
            {p.sku}
          </T>
        ) : null}
      </View>
    </Card>
  );
}
