import React, { useMemo, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingApi, type AdminInvoice, type BillingCustomer, type InvoiceTab } from '../../api/admin/billing';
import { errorMessage } from '../../api/client';
import { fmtDate, money } from '../../lib/portal';
import { colors } from '../../theme';
import { Btn, Card, Chips, EmptyCard, ErrorBox, Eyebrow, Loading, Muted, Pill, Screen, SearchField, T } from '../../ui';
import { CustomerPickerSheet, INVOICE_STATUS, SelectBox, customerLabel, useDebounced } from './shared';
import { daysOverdue } from './proration';

const TABS: { value: InvoiceTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
];

/** Billing tab: invoices grouped by client, with the web's stat tiles, tabs, search and client filter. */
export default function BillingHome() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<InvoiceTab>('all');
  const [search, setSearch] = useState('');
  const [client, setClient] = useState<BillingCustomer | null>(null);
  const [picker, setPicker] = useState(false);
  const debounced = useDebounced(search.trim());

  const summary = useQuery({ queryKey: ['admin-billing', 'summary'], queryFn: billingApi.summary });

  const list = useInfiniteQuery({
    queryKey: ['admin-billing', 'list', { tab, debounced, clientId: client?.clientId ?? '' }],
    queryFn: ({ pageParam }) =>
      billingApi.list({ page: pageParam, search: debounced, filter: tab, clientId: client?.clientId }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    staleTime: 0,
  });

  const remove = useMutation({
    mutationFn: (id: string) => billingApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-billing'] });
      void qc.invalidateQueries({ queryKey: ['admin-payments'] });
      Alert.alert('Invoice deleted');
    },
    onError: (e) => Alert.alert('Could not delete', errorMessage(e)),
  });

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.meta.total;

  // Group invoices by client (the API already orders them client-wise).
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; clientId: string; invoices: AdminInvoice[]; outstanding: number }>();
    for (const inv of items) {
      const key = inv.customer?.clientId || inv.customer?.contactPerson || 'unknown';
      if (!map.has(key)) {
        map.set(key, { key, name: customerLabel(inv.customer), clientId: inv.customer?.clientId || '', invoices: [], outstanding: 0 });
      }
      const g = map.get(key)!;
      g.invoices.push(inv);
      if (inv.status !== 'CANCELLED' && inv.status !== 'DRAFT') g.outstanding += Math.max(Number(inv.total) - Number(inv.amountPaid), 0);
    }
    return [...map.values()];
  }, [items]);

  const confirmDelete = (inv: AdminInvoice) =>
    Alert.alert(
      'Delete this invoice?',
      `Permanently deletes ${inv.invoiceNumber} and its line items and any recorded payments. If it is the customer's latest invoice, no automatic invoice follows from it — billing resumes when you create their next invoice. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete invoice', style: 'destructive', onPress: () => remove.mutate(inv.id) },
      ]
    );

  const s = summary.data;
  const tiles: { label: string; value: string; sub: string; color?: string; tab: InvoiceTab }[] = [
    {
      label: 'Outstanding',
      value: s ? money(s.outstanding.amount) : '—',
      sub: s ? `${s.outstanding.count} unpaid ${s.outstanding.count === 1 ? 'invoice' : 'invoices'}` : ' ',
      color: colors.warnFg,
      tab: 'outstanding',
    },
    {
      label: 'Overdue',
      value: s ? money(s.overdue.amount) : '—',
      sub: s ? `${s.overdue.count} past due` : ' ',
      color: s && s.overdue.count > 0 ? colors.redFg : undefined,
      tab: 'overdue',
    },
    { label: 'Collected (month)', value: s ? money(s.revenue.current) : '—', sub: 'Payments this month', color: colors.okFg, tab: 'paid' },
    { label: 'Invoiced (month)', value: s ? money(s.totalSales.current) : '—', sub: 'Raised this month', tab: 'all' },
  ];

  const filtered = !!(debounced || tab !== 'all' || client);
  const refresh = () => {
    void summary.refetch();
    void list.refetch();
  };

  return (
    <Screen title="Billing" refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={refresh}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn title="New invoice" icon="add" onPress={() => nav.navigate('InvoiceForm', {})} style={{ flex: 1 }} />
        <Btn title="Payments" icon="wallet-outline" variant="ghost" onPress={() => nav.navigate('Payments')} style={{ flex: 1 }} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
        {tiles.map((t) => (
          <Card key={t.label} onPress={() => setTab(t.tab)} style={{ width: '48%', flexGrow: 1, padding: 14 }}>
            <Eyebrow style={{ fontSize: 10, letterSpacing: 1.2 }}>{t.label}</Eyebrow>
            <T w="b" size={20} color={t.color} style={{ marginTop: 6 }} numberOfLines={1} adjustsFontSizeToFit>
              {t.value}
            </T>
            <Muted size={12} numberOfLines={1}>
              {t.sub}
            </Muted>
          </Card>
        ))}
      </View>

      <Chips<InvoiceTab> options={TABS} value={tab} onChange={setTab} style={{ marginTop: 16 }} />
      <SearchField value={search} onChangeText={setSearch} placeholder="Invoice, reference, customer or ID" style={{ marginTop: 12 }} />
      <View style={{ marginTop: 10 }}>
        <SelectBox value={client ? customerLabel(client) : 'All clients'} placeholder="All clients" onPress={() => setPicker(true)} />
      </View>
      {total !== undefined ? (
        <Muted size={12.5} style={{ marginTop: 10, marginLeft: 2 }}>
          {total} {total === 1 ? 'invoice' : 'invoices'}
          {items.length < total ? ` · showing ${items.length}` : ''}
        </Muted>
      ) : null}

      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <View style={{ marginTop: 14 }}>
          <ErrorBox message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ marginTop: 14 }}>
          <EmptyCard
            icon="receipt-outline"
            title="No invoices found"
            body={filtered ? 'No invoice matches this client, tab or search.' : 'Invoices raised for customers will appear here, grouped by client.'}
          />
          {filtered ? (
            <Btn
              title="Clear filters"
              variant="ghost"
              style={{ marginTop: 10 }}
              onPress={() => {
                setSearch('');
                setTab('all');
                setClient(null);
              }}
            />
          ) : null}
        </View>
      ) : (
        <>
          {groups.map((g) => (
            <Card key={g.key} style={{ marginTop: 14, overflow: 'hidden' }}>
              <Pressable
                disabled={!g.clientId}
                onPress={() => nav.navigate('CustomerDetail', { clientId: g.clientId })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: colors.soft2 }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="business-outline" size={17} color={colors.navy} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w="s" size={14.5} numberOfLines={1}>
                    {g.name}
                  </T>
                  <Muted mono size={11} numberOfLines={1}>
                    {g.clientId ? `${g.clientId} · ` : ''}
                    {g.invoices.length} {g.invoices.length === 1 ? 'invoice' : 'invoices'}
                  </Muted>
                </View>
                {g.outstanding > 0 ? (
                  <Pill kind="red" label={`${money(g.outstanding)} due`} style={{ height: 26 }} />
                ) : (
                  <Pill kind="ok" label="Settled" style={{ height: 26 }} />
                )}
              </Pressable>
              {g.invoices.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  inv={inv}
                  onPress={() => nav.navigate('InvoiceDetail', { id: inv.id })}
                  onLongPress={() => confirmDelete(inv)}
                />
              ))}
            </Card>
          ))}
          {list.hasNextPage ? (
            <Btn
              title="Load more"
              variant="ghost"
              loading={list.isFetchingNextPage}
              onPress={() => void list.fetchNextPage()}
              style={{ marginTop: 14 }}
            />
          ) : null}
          <Muted size={12} style={{ textAlign: 'center', marginTop: 14 }}>
            Long-press an invoice to delete it.
          </Muted>
        </>
      )}

      <CustomerPickerSheet
        open={picker}
        onClose={() => setPicker(false)}
        allOption
        selected={client?.clientId}
        onPick={(c) => {
          setClient(c);
          setPicker(false);
        }}
      />
    </Screen>
  );
}

function InvoiceRow({ inv, onPress, onLongPress }: { inv: AdminInvoice; onPress: () => void; onLongPress: () => void }) {
  // Cancelled / draft invoices owe nothing (matches the Outstanding tab).
  const balance = inv.status === 'CANCELLED' || inv.status === 'DRAFT' ? 0 : Number(inv.total) - Number(inv.amountPaid);
  const overdue = daysOverdue(inv);
  const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.DRAFT;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
        pressed && { backgroundColor: colors.soft2 },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <T mono size={12.5}>
          {inv.invoiceNumber}
        </T>
        {inv.reference ? (
          <Muted size={12} numberOfLines={1}>
            {inv.reference}
          </Muted>
        ) : null}
        <Muted size={12} style={{ marginTop: 2 }}>
          {fmtDate(inv.invoiceDate)} · due {fmtDate(inv.dueDate)}
        </Muted>
        {overdue > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Ionicons name="warning-outline" size={12} color={colors.redFg} />
            <T w="s" size={12} color={colors.redFg}>
              {overdue} {overdue === 1 ? 'day' : 'days'} overdue
            </T>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <T w="s" size={14}>
          {money(Number(inv.total), inv.currency)}
        </T>
        {balance > 0 ? (
          <T w="s" size={12} color={colors.redFg}>
            {money(balance, inv.currency)} due
          </T>
        ) : (
          <T size={12} color={colors.okFg}>
            Settled
          </T>
        )}
        <Pill kind={st.kind} label={st.label} style={{ height: 24 }} />
      </View>
    </Pressable>
  );
}
