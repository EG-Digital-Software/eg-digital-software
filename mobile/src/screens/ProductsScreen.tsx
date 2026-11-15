import React, { useMemo, useState } from 'react';
import { View, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '../api/portal';
import { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { LICENCE_PILL, fmtDate, grossOf, money, moneyShort, netOf, termLeft, useProducts } from '../lib/portal';
import { Bar, Btn, Card, EmptyCard, ErrorBox, Loading, Muted, Pill, Screen, Sheet, SheetOption, T } from '../ui';
import { Stat } from './TasksScreen';
import type { AvailableProduct } from '../api/types';

const PERIOD: Record<string, string> = { DAILY: '/day', WEEKLY: '/week', MONTHLY: '/month', ANNUALLY: '/year', ONE_TIME: ' once' };

const priceLabel = (p: AvailableProduct) =>
  p.price && Number(p.price) > 0 ? `${money(Number(p.price))}${p.billingPeriod ? PERIOD[p.billingPeriod] ?? '' : ''}` : 'On request';

export default function ProductsScreen() {
  const qc = useQueryClient();
  const { scopeKey } = useScope();
  const { admin } = useAuth();
  const readOnly = !!admin && !admin.edit;
  const products = useProducts();
  const [reqOpen, setReqOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const all = products.data ?? [];
  const live = all.filter((p) => !p.pending);
  const pending = all.filter((p) => p.pending);
  const net = live.reduce((s, p) => s + netOf(p), 0);
  const gross = live.reduce((s, p) => s + grossOf(p), 0);
  const lefts = live.map((p) => termLeft(p)).filter((x): x is number => x !== null);
  const avgLeft = lefts.length ? Math.round(lefts.reduce((a, b) => a + b, 0) / lefts.length) : null;
  const issued = live.map((p) => p.issueDate).sort()[0];
  const expires = live.map((p) => p.expiryDate).filter(Boolean).sort().pop();
  const locked = live.some((p) => (p.contractType ?? 'LOCKED') === 'LOCKED');

  // Number each product's licences ("Licence 1 of 2").
  const numbered = useMemo(() => {
    const seen: Record<string, number> = {};
    const totals: Record<string, number> = {};
    live.forEach((p) => (totals[p.product] = (totals[p.product] ?? 0) + 1));
    return live.map((p) => {
      seen[p.product] = (seen[p.product] ?? 0) + 1;
      return { p, n: seen[p.product]!, of: totals[p.product]! };
    });
  }, [live]);

  const catalog = useQuery({ queryKey: ['available-products'], queryFn: portalApi.availableProducts, enabled: reqOpen });
  const request = useMutation({
    mutationFn: (id: string) => portalApi.addProduct(id),
    onSuccess: () => {
      setReqOpen(false);
      setSel(null);
      void qc.invalidateQueries({ queryKey: ['products', scopeKey] });
      Alert.alert('Request sent', 'Shown as Pending until EG Eloma approves it.');
    },
    onError: (e) => Alert.alert('Request not sent', errorMessage(e)),
  });

  return (
    <Screen title="Your plan" back refreshing={products.isRefetching} onRefresh={() => void products.refetch()}>
      {products.isLoading ? (
        <Loading />
      ) : products.isError ? (
        <ErrorBox message={errorMessage(products.error)} onRetry={() => void products.refetch()} />
      ) : (
        <>
          <Muted size={14} style={{ marginBottom: 14 }}>
            {live.length ? (locked ? 'Prices are locked for the contract term.' : 'Your plan is on a trial term.') : 'Request a product to get started.'}
          </Muted>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Licences" value={live.length} />
            <Stat label="Agreed total" value={moneyShort(Math.round(net * 100) / 100)} />
            <Stat label="Term left" value={avgLeft === null ? '—' : `${avgLeft}%`} />
          </View>
          {live.length ? (
            <Muted size={12.5} style={{ marginTop: 8, marginHorizontal: 2 }}>
              {money(gross)} incl. 10% GST · Issued {fmtDate(issued)}
              {expires ? ` · Expires ${fmtDate(expires)}` : ''}
            </Muted>
          ) : null}

          <View style={{ gap: 10, marginTop: 16 }}>
            {live.length === 0 && pending.length === 0 ? (
              <EmptyCard icon="cube-outline" title="No products yet" body="Products and licences on your account will appear here." />
            ) : null}
            {numbered.map(({ p, n, of }) => {
              const left = termLeft(p);
              const pill = LICENCE_PILL[p.status] ?? LICENCE_PILL.ACTIVE!;
              return (
                <Card key={p.id} style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <T w="s" size={15} style={{ flex: 1 }}>
                      {p.product}
                    </T>
                    <Pill kind={pill.kind} label={pill.label} />
                  </View>
                  <Muted size={13}>
                    Licence {n} of {of}
                  </Muted>
                  {p.licence ? (
                    <Row label="Licence key" value={p.licence} mono />
                  ) : null}
                  <Row label="Agreed price" value={`${money(netOf(p))} · ${p.contractType === 'TRIAL' ? 'Trial' : 'Locked'}`} />
                  {left !== null ? (
                    <>
                      <Bar pct={left} style={{ marginTop: 12 }} />
                      <Muted size={12} style={{ marginTop: 6 }}>
                        {p.daysRemaining} days remaining
                      </Muted>
                    </>
                  ) : null}
                </Card>
              );
            })}
            {pending.map((p) => (
              <Card key={p.id} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T w="s" size={15} style={{ flex: 1 }}>
                  {p.product}
                </T>
                <Pill kind="warn" label="Pending approval" />
              </Card>
            ))}
          </View>
          {!readOnly ? <Btn title="Request a product" onPress={() => setReqOpen(true)} style={{ marginTop: 16 }} /> : null}
        </>
      )}

      <Sheet open={reqOpen} onClose={() => setReqOpen(false)}>
        <T w="s" size={18}>
          Request a product
        </T>
        <Muted size={13} style={{ marginTop: 2 }}>
          Sent to the admin and shown as Pending until approved.
        </Muted>
        {catalog.isLoading ? <Loading /> : null}
        {catalog.isError ? <ErrorBox message={errorMessage(catalog.error)} onRetry={() => void catalog.refetch()} /> : null}
        {(catalog.data ?? []).map((p) => (
          <SheetOption key={p.id} title={p.name} right={priceLabel(p)} selected={sel === p.id} onPress={() => setSel(p.id)} />
        ))}
        <Btn
          title="Send for approval"
          onPress={() => sel && request.mutate(sel)}
          disabled={!sel}
          loading={request.isPending}
          style={{ marginTop: 14 }}
        />
      </Sheet>
    </Screen>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingTop: 10 }}>
      <Muted size={14}>{label}</Muted>
      <T w="s" size={mono ? 12 : 14} mono={mono} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </T>
    </View>
  );
}
