import React, { useEffect, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import {
  BUSINESS_TYPES,
  adminCustomersApi,
  businessTypesLabel,
  customerName,
  type AdminCustomer,
  type CustomerStatusFilter,
} from '../../api/admin/customers';
import { Avatar, Btn, Card, Chips, EmptyCard, ErrorBox, Eyebrow, Loading, Muted, Pill, Screen, SearchField, Sheet, SheetOption, T } from '../../ui';
import { colors } from '../../theme';
import { LIST_KEY, SheetTitle, customerKey, invoiceSummary, primaryAddress, statusOf } from './common';

const STATUS_FILTERS: { value: CustomerStatusFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ACTIVE_TRIAL', label: 'Active-Trial' },
  { value: 'DORMANT', label: 'Dormant' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'ARCHIVED', label: 'Archived' },
];

type SortKey = 'clientId' | 'companyName' | 'createdAt' | 'creditScore';
const SORTS: { value: SortKey; label: string; dir: 'asc' | 'desc' }[] = [
  { value: 'clientId', label: 'Customer ID', dir: 'asc' },
  { value: 'companyName', label: 'Business name (A–Z)', dir: 'asc' },
  { value: 'createdAt', label: 'Newest first', dir: 'desc' },
  { value: 'creditScore', label: 'Credit score (high–low)', dir: 'desc' },
];

const PAGE = 20;

/** Admin Customers tab: search, filter and open customers (web CustomersPage). */
export default function CustomersListScreen() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<CustomerStatusFilter>('ACTIVE');
  const [businessType, setBusinessType] = useState('');
  const [sort, setSort] = useState<SortKey>('clientId');
  const [filterOpen, setFilterOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<AdminCustomer | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const sortDir = SORTS.find((s) => s.value === sort)?.dir ?? 'asc';
  const list = useInfiniteQuery({
    queryKey: [...LIST_KEY, { debounced, status, businessType, sort }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      adminCustomersApi.list({
        page: pageParam,
        pageSize: PAGE,
        search: debounced || undefined,
        status,
        businessType: businessType || undefined,
        sortBy: sort,
        sortDir,
      }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.meta.total ?? 0;
  const withOutstanding = items.filter((c) => invoiceSummary(c).kind === 'warn').length;
  const filtered = !!(debounced || businessType || status !== 'ACTIVE');
  const statusLabel = STATUS_FILTERS.find((f) => f.value === status)?.label ?? 'Active';
  const typeLabel = BUSINESS_TYPES.find((t) => t.value === businessType)?.label;

  const done = (clientId: string, msg: string) => {
    void qc.invalidateQueries({ queryKey: LIST_KEY });
    void qc.invalidateQueries({ queryKey: customerKey(clientId) });
    Alert.alert(msg);
  };
  const archive = useMutation({
    mutationFn: (c: AdminCustomer) => adminCustomersApi.archive(c.clientId),
    onSuccess: (_d, c) => done(c.clientId, 'Customer archived'),
    onError: (e) => Alert.alert('Could not archive', errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (c: AdminCustomer) => adminCustomersApi.remove(c.clientId),
    onSuccess: (_d, c) => done(c.clientId, 'Customer permanently deleted'),
    onError: (e) => Alert.alert('Could not delete', errorMessage(e)),
  });

  const confirmArchive = (c: AdminCustomer) =>
    Alert.alert('Archive customer?', `${customerName(c)} will be archived. Their invoices and records are preserved.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => archive.mutate(c) },
    ]);
  const confirmDelete = (c: AdminCustomer) =>
    Alert.alert(
      'Delete customer permanently?',
      `${customerName(c)} and all its data — addresses, directors and assigned products — will be permanently deleted. This cannot be undone. A customer with invoices can't be deleted; archive it instead.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete permanently', style: 'destructive', onPress: () => remove.mutate(c) },
      ]
    );

  const clearFilters = () => {
    setSearch('');
    setBusinessType('');
    setStatus('ACTIVE');
  };

  return (
    <Screen
      title="Customers"
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => void list.refetch()}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <Muted size={14}>Manage your clients, products and licences.</Muted>
        </View>
        <Btn title="Add" icon="add" onPress={() => nav.navigate('CustomerForm')} style={{ minHeight: 42, paddingHorizontal: 16 }} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <Card style={{ flex: 1, padding: 14 }}>
          <Eyebrow>{statusLabel}</Eyebrow>
          <T w="b" size={24} style={{ marginTop: 4 }}>
            {list.isLoading ? '–' : total}
          </T>
          <Muted size={11.5}>{filtered ? 'Matching filters' : 'All active accounts'}</Muted>
        </Card>
        <Card style={{ flex: 1, padding: 14 }}>
          <Eyebrow>Outstanding</Eyebrow>
          <T w="b" size={24} color={withOutstanding ? colors.warnFg : colors.fg} style={{ marginTop: 4 }}>
            {list.isLoading ? '–' : withOutstanding}
          </T>
          <Muted size={11.5}>Loaded customers with unpaid invoices</Muted>
        </Card>
      </View>

      <SearchField value={search} onChangeText={setSearch} placeholder="Name, business, email, ABN, contact or ID" />
      <Chips<CustomerStatusFilter> options={STATUS_FILTERS} value={status} onChange={setStatus} style={{ marginTop: 12 }} />
      <Pressable
        onPress={() => setFilterOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' }}
        hitSlop={6}
      >
        <Ionicons name="options-outline" size={16} color={colors.green} />
        <T w="s" size={13} color={colors.green}>
          {typeLabel ?? 'All business types'} · {SORTS.find((s) => s.value === sort)?.label}
        </T>
      </Pressable>

      <View style={{ gap: 10, marginTop: 14 }}>
        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrorBox message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : !items.length ? (
          <>
            <EmptyCard
              icon="people-outline"
              title="No customers found"
              body={
                filtered
                  ? 'No customer matches these filters. Try clearing the search, business type or status.'
                  : 'Add your first customer to start managing clients.'
              }
            />
            {filtered ? (
              <Btn title="Clear filters" variant="ghost" onPress={clearFilters} />
            ) : (
              <Btn title="New customer" icon="add" onPress={() => nav.navigate('CustomerForm')} />
            )}
          </>
        ) : (
          <>
            <Muted size={12.5}>
              {items.length} of {total} {total === 1 ? 'customer' : 'customers'}
            </Muted>
            {items.map((c) => (
              <CustomerRow
                key={c.id}
                c={c}
                onPress={() => nav.navigate('CustomerDetail', { clientId: c.clientId })}
                onMore={() => setActionsFor(c)}
              />
            ))}
            {list.hasNextPage ? (
              <Btn
                title="Load more"
                variant="ghost"
                loading={list.isFetchingNextPage}
                onPress={() => void list.fetchNextPage()}
              />
            ) : null}
          </>
        )}
      </View>

      {/* Business type + sort */}
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)}>
        <SheetTitle title="Sort" />
        {SORTS.map((s) => (
          <SheetOption key={s.value} title={s.label} selected={sort === s.value} onPress={() => setSort(s.value)} />
        ))}
        <View style={{ height: 16 }} />
        <SheetTitle title="Business type" />
        <SheetOption title="All business types" selected={!businessType} onPress={() => setBusinessType('')} />
        {BUSINESS_TYPES.map((t) => (
          <SheetOption key={t.value} title={t.label} selected={businessType === t.value} onPress={() => setBusinessType(t.value)} />
        ))}
        <Btn title="Done" onPress={() => setFilterOpen(false)} style={{ marginTop: 16 }} />
      </Sheet>

      {/* Row actions */}
      <Sheet open={!!actionsFor} onClose={() => setActionsFor(null)}>
        {actionsFor ? (
          <>
            <SheetTitle title={customerName(actionsFor)} body={actionsFor.clientId} />
            <SheetOption
              title="View"
              chevron
              onPress={() => {
                const id = actionsFor.clientId;
                setActionsFor(null);
                nav.navigate('CustomerDetail', { clientId: id });
              }}
            />
            <SheetOption
              title="Edit"
              chevron
              onPress={() => {
                const id = actionsFor.clientId;
                setActionsFor(null);
                nav.navigate('CustomerForm', { clientId: id });
              }}
            />
            {actionsFor.status !== 'ARCHIVED' ? (
              <SheetOption
                title="Archive"
                onPress={() => {
                  const c = actionsFor;
                  setActionsFor(null);
                  confirmArchive(c);
                }}
              />
            ) : null}
            <SheetOption
              title="Delete permanently"
              onPress={() => {
                const c = actionsFor;
                setActionsFor(null);
                confirmDelete(c);
              }}
            />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function CustomerRow({ c, onPress, onMore }: { c: AdminCustomer; onPress: () => void; onMore: () => void }) {
  const st = statusOf(c);
  const inv = invoiceSummary(c);
  const loc = primaryAddress(c);
  const place = [loc?.city, loc?.country].filter(Boolean).join(', ');
  return (
    <Card onPress={onPress} style={{ padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Avatar name={c.companyName || customerName(c)} size={42} radius={12} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w="s" size={15.5} numberOfLines={1}>
            {c.companyName || customerName(c)}
          </T>
          {c.tradingAs && c.tradingAs !== c.companyName ? (
            <Muted size={12.5} numberOfLines={1}>
              T/A {c.tradingAs}
            </Muted>
          ) : null}
          <T mono size={11.5} color={colors.muted} style={{ marginTop: 2 }}>
            {c.clientId}
          </T>
          {place || c.businessType ? (
            <Muted size={12.5} numberOfLines={1} style={{ marginTop: 2 }}>
              {[place, businessTypesLabel(c.businessType)].filter(Boolean).join(' · ')}
            </Muted>
          ) : null}
        </View>
        <Pressable onPress={onMore} hitSlop={10} accessibilityLabel="Customer actions" style={{ paddingLeft: 4 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Pill kind={st.kind} label={st.label} />
        <Pill kind={inv.kind} label={inv.label} />
        {c.status === 'ARCHIVED' ? <Pill kind="ns" label="Archived" /> : null}
      </View>
    </Card>
  );
}
