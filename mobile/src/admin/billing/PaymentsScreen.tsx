import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { paymentsApi, type PaymentRow, type PaymentStatus } from '../../api/admin/billing';
import { errorMessage } from '../../api/client';
import { fmtDate, money } from '../../lib/portal';
import { colors } from '../../theme';
import { Btn, Card, Chips, EmptyCard, ErrorBox, Eyebrow, Loading, Muted, Pill, Screen, SearchField, SectionHead, T } from '../../ui';
import { PAYMENT_STATUS, cap, useDebounced } from './shared';

const STATUSES: ('' | PaymentStatus)[] = ['', 'SUCCESS', 'PENDING', 'FAILED', 'REFUNDED', 'CANCELLED'];

const customerName = (p: PaymentRow) => {
  const c = p.invoice?.customer;
  return c ? c.companyName || c.contactPerson || c.clientId : '—';
};

/** Payments: every payment across every invoice, plus the way into Payment settings. */
export default function PaymentsScreen() {
  const nav = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | PaymentStatus>('');
  const [method, setMethod] = useState('');
  const debounced = useDebounced(search.trim());

  const list = useInfiniteQuery({
    queryKey: ['admin-payments', 'list', { debounced, status, method }],
    queryFn: ({ pageParam }) => paymentsApi.list({ page: pageParam, search: debounced, status, method }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });
  const methods = useQuery({ queryKey: ['admin-payments', 'methods'], queryFn: paymentsApi.methods });

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const meta = list.data?.pages[0]?.meta;
  const filtered = !!(debounced || status || method);

  return (
    <Screen
      title="Payments"
      back
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => {
        void list.refetch();
        void methods.refetch();
      }}
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card style={{ flex: 1, padding: 14 }}>
          <Eyebrow style={{ fontSize: 10, letterSpacing: 1.2 }}>Collected</Eyebrow>
          <T w="b" size={20} color={colors.okFg} style={{ marginTop: 6 }} numberOfLines={1} adjustsFontSizeToFit>
            {meta ? money(meta.collected ?? 0) : '—'}
          </T>
          <Muted size={12}>{filtered ? 'Matching filters' : 'All payments'}</Muted>
        </Card>
        <Card style={{ flex: 1, padding: 14 }}>
          <Eyebrow style={{ fontSize: 10, letterSpacing: 1.2 }}>Payments</Eyebrow>
          <T w="b" size={20} style={{ marginTop: 6 }}>
            {meta ? meta.total : '—'}
          </T>
          <Muted size={12}>{filtered ? 'Matching filters' : 'In total'}</Muted>
        </Card>
      </View>

      <Card onPress={() => nav.navigate('PaymentSettings')} style={{ marginTop: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="settings-outline" size={19} color={colors.green} />
        </View>
        <View style={{ flex: 1 }}>
          <T w="s" size={15}>
            Payment settings
          </T>
          <Muted size={12.5}>Gateway (ANZ Worldline), cards, UPI, bank transfer</Muted>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </Card>

      <SectionHead title="Transactions" />
      <SearchField value={search} onChangeText={setSearch} placeholder="Invoice, customer, ID or transaction" />
      <Chips<'' | PaymentStatus>
        style={{ marginTop: 10 }}
        value={status}
        onChange={setStatus}
        options={STATUSES.map((s) => ({ value: s, label: s ? cap(s) : 'All statuses' }))}
      />
      {(methods.data ?? []).length ? (
        <Chips<string>
          style={{ marginTop: 8 }}
          value={method}
          onChange={setMethod}
          options={[{ value: '', label: 'All methods' }, ...(methods.data ?? []).map((m) => ({ value: m, label: m }))]}
        />
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
            icon="wallet-outline"
            title="No payments found"
            body={filtered ? 'No payment matches these filters.' : 'Payments appear here as soon as invoices are paid — online or recorded manually.'}
          />
          {filtered ? (
            <Btn
              title="Clear filters"
              variant="ghost"
              style={{ marginTop: 10 }}
              onPress={() => {
                setSearch('');
                setStatus('');
                setMethod('');
              }}
            />
          ) : null}
        </View>
      ) : (
        <>
          <Card style={{ marginTop: 14, overflow: 'hidden' }}>
            {items.map((p, i) => (
              <PaymentItem key={p.id} p={p} first={i === 0} onPress={p.invoice ? () => nav.navigate('InvoiceDetail', { id: p.invoice!.id }) : undefined} />
            ))}
          </Card>
          {list.hasNextPage ? (
            <Btn title="Load more" variant="ghost" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} style={{ marginTop: 14 }} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

function PaymentItem({ p, first, onPress }: { p: PaymentRow; first: boolean; onPress?: () => void }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        { flexDirection: 'row', gap: 12, padding: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line },
        pressed && { backgroundColor: colors.soft2 },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w="s" size={14} numberOfLines={1}>
          {customerName(p)}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Ionicons name="receipt-outline" size={12} color={colors.muted} />
          <T mono size={12}>
            {p.invoice?.invoiceNumber ?? '—'}
          </T>
          {p.invoice?.customer?.clientId ? (
            <Muted mono size={11} numberOfLines={1} style={{ flexShrink: 1 }}>
              · {p.invoice.customer.clientId}
            </Muted>
          ) : null}
        </View>
        <Muted size={12} style={{ marginTop: 2 }}>
          {fmtDate(p.paidAt ?? p.createdAt)}
          {!p.paidAt ? ' · not settled' : ''} · {p.paymentMethod ?? '—'}
        </Muted>
        <Muted mono size={11} numberOfLines={1} style={{ marginTop: 2 }}>
          {p.transactionId ?? '—'} · via {p.provider}
        </Muted>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <T w="s" size={14}>
          {money(Number(p.amount), p.currency)}
        </T>
        <Pill kind={PAYMENT_STATUS[p.status] ?? 'ns'} label={cap(p.status)} style={{ height: 24 }} />
      </View>
    </Pressable>
  );
}
