import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { productsApi, type Product, type ProductStatus } from '../../api/admin/products';
import { Btn, Card, Chips, EmptyCard, ErrorBox, Eyebrow, Loading, Muted, Pill, Screen, SearchField, Sheet, SheetOption, T } from '../../ui';
import { colors } from '../../theme';
import { ProductGlyph } from '../dashboard/ProductsScreen';
import { useDebounced } from '../dashboard/common';
import { priceLabel } from './common';

type StatusFilter = '' | ProductStatus;
const PAGE = 20;

/** Products tab entry (ProductsHome): searchable, filterable catalogue. */
export default function ProductsListScreen() {
  const nav = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [category, setCategory] = useState('');
  const [catSheet, setCatSheet] = useState(false);
  const debounced = useDebounced(search.trim());

  const q = useInfiniteQuery({
    queryKey: ['admin-products', 'list', { status, category, search: debounced }],
    queryFn: ({ pageParam }) => productsApi.list({ page: pageParam, pageSize: PAGE, search: debounced, status, category }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });
  // Categories are free text, so the filter is built from what is actually in use.
  const cats = useQuery({ queryKey: ['admin-products', 'categories'], queryFn: productsApi.categories });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.meta.total;
  const filtered = !!(debounced || status || category);
  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setCategory('');
  };

  return (
    <Screen
      title="Products"
      back
      refreshing={q.isRefetching && !q.isFetchingNextPage}
      onRefresh={() => {
        void q.refetch();
        void cats.refetch();
      }}
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn title="New product" icon="add" onPress={() => nav.navigate('ProductsForm', {})} style={{ flex: 1 }} />
        <Btn title="Bulk upload" icon="cloud-upload-outline" variant="ghost" onPress={() => nav.navigate('ProductsBulkUpload')} style={{ flex: 1 }} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Card style={{ flex: 1, padding: 14 }}>
          <Eyebrow>{filtered ? 'Matching' : 'Products'}</Eyebrow>
          <T w="b" size={24} style={{ marginTop: 6 }}>
            {total ?? '—'}
          </T>
          <Muted size={11.5}>{filtered ? 'With current filters' : 'All statuses'}</Muted>
        </Card>
        <Card style={{ flex: 1, padding: 14 }}>
          <Eyebrow>Categories</Eyebrow>
          <T w="b" size={24} style={{ marginTop: 6 }}>
            {cats.data ? cats.data.length : '—'}
          </T>
          <Muted size={11.5} numberOfLines={1}>
            {cats.data?.length ? cats.data.join(', ') : 'No categories yet'}
          </Muted>
        </Card>
      </View>

      <SearchField value={search} onChangeText={setSearch} placeholder="Search name, code, SKU, type…" style={{ marginTop: 14 }} />
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
      <Pressable
        onPress={() => setCatSheet(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 10,
          minHeight: 44,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: category ? colors.green2 : colors.line,
          backgroundColor: category ? colors.greenTint : '#fff',
        }}
        accessibilityRole="button"
        accessibilityLabel="Filter by category"
      >
        <Ionicons name="pricetag-outline" size={16} color={category ? colors.green : colors.muted} />
        <T w="s" size={14} color={category ? colors.greenChipText : colors.muted} style={{ flex: 1 }} numberOfLines={1}>
          {category || 'All categories'}
        </T>
        {category ? (
          <Pressable onPress={() => setCategory('')} hitSlop={10} accessibilityLabel="Clear category">
            <Ionicons name="close-circle" size={18} color={colors.faint} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={16} color={colors.muted} />
        )}
      </Pressable>

      <View style={{ marginTop: 14, gap: 10 }}>
        {q.isError ? (
          <ErrorBox message={errorMessage(q.error, 'Could not load products')} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Loading />
        ) : !items.length ? (
          <>
            <EmptyCard
              icon="cube-outline"
              title="No products found"
              body={
                filtered
                  ? 'No product matches these filters. Try clearing the search or category filter.'
                  : 'Add your first product or import a catalogue to get started.'
              }
            />
            {filtered ? <Btn title="Clear filters" variant="ghost" onPress={clearFilters} /> : null}
          </>
        ) : (
          <>
            {items.map((p) => (
              <ProductCard key={p.id} p={p} onPress={() => nav.navigate('ProductsDetail', { id: p.id })} />
            ))}
            <Muted size={12} style={{ textAlign: 'center' }}>
              Showing {items.length} of {total ?? items.length}
            </Muted>
            {q.hasNextPage ? <Btn title="Load more" variant="ghost" onPress={() => q.fetchNextPage()} loading={q.isFetchingNextPage} /> : null}
          </>
        )}
      </View>

      <Sheet open={catSheet} onClose={() => setCatSheet(false)}>
        <T w="s" size={17} style={{ marginBottom: 6 }}>
          Category
        </T>
        <SheetOption
          title="All categories"
          selected={!category}
          onPress={() => {
            setCategory('');
            setCatSheet(false);
          }}
        />
        {(cats.data ?? []).map((c) => (
          <SheetOption
            key={c}
            title={c}
            selected={category === c}
            onPress={() => {
              setCategory(c);
              setCatSheet(false);
            }}
          />
        ))}
        {cats.isLoading ? <Loading /> : null}
      </Sheet>
    </Screen>
  );
}

function ProductCard({ p, onPress }: { p: Product; onPress: () => void }) {
  const active = p.status === 'ACTIVE';
  return (
    <Card style={{ padding: 14 }} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ProductGlyph name={p.name} parts={[p.category, p.type]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w="s" size={14.5} numberOfLines={2}>
            {p.name}
          </T>
          <Muted size={12} numberOfLines={1}>
            {p.sku ? `SKU ${p.sku}` : 'No SKU'}
          </Muted>
        </View>
        <Pill kind={active ? 'ok' : 'ns'} label={active ? 'Active' : 'Inactive'} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <T w="s" size={12.5}>
          {priceLabel(p)}
        </T>
        {p.type ? <Muted size={12.5}>{p.type}</Muted> : null}
        {p.category ? <Pill kind="ns" label={p.category} style={{ height: 24 }} /> : null}
        <T mono size={11.5} color={colors.faint} style={{ marginLeft: 'auto' }}>
          {p.productCode}
        </T>
      </View>
    </Card>
  );
}
