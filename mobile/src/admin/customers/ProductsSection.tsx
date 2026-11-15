import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { adminCustomersApi, type AdminCustomer, type AdminCustomerProduct } from '../../api/admin/customers';
import { fmtDate, money, prettyEnum } from '../../lib/portal';
import { Btn, Card, EmptyCard, Muted, Pill, Sheet, T } from '../../ui';
import { colors } from '../../theme';
import {
  IconBtn,
  LIST_KEY,
  Segment,
  SheetTitle,
  cpBasisSuffix,
  cpDiscount,
  cpTotals,
  cpUnits,
  customerKey,
  daysLeft,
  licenceGroups,
  type LicenceGroup,
} from './common';

const groupTotal = (g: LicenceGroup) => g.items.reduce((s, it) => s + cpTotals(it).total, 0);

/** Products & licences (web Products tab): one card per licence group. */
export function ProductsSection({ c }: { c: AdminCustomer }) {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const clientId = c.clientId;
  const groups = licenceGroups(c);
  const [viewing, setViewing] = useState<LicenceGroup | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: customerKey(clientId) });
    void qc.invalidateQueries({ queryKey: LIST_KEY });
  };

  const setStatus = useMutation({
    mutationFn: (v: { items: AdminCustomerProduct[]; status: 'ACTIVE' | 'SUSPENDED' }) =>
      Promise.all(v.items.map((cp) => adminCustomersApi.updateProduct(clientId, cp.id, { status: v.status }))),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Could not update the status', errorMessage(e)),
  });

  const approve = useMutation({
    mutationFn: (items: AdminCustomerProduct[]) =>
      Promise.all(items.map((cp) => adminCustomersApi.updateProduct(clientId, cp.id, { approvalStatus: 'APPROVED', status: 'ACTIVE' }))),
    onSuccess: () => {
      refresh();
      Alert.alert('Products approved');
    },
    onError: (e) => Alert.alert('Could not approve', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (g: LicenceGroup) =>
      // A product without a licence key (synthetic "__id" group) is removed on its own.
      g.key.startsWith('__') ? adminCustomersApi.removeProduct(clientId, g.items[0]!.id) : adminCustomersApi.removeProductGroup(clientId, g.key),
    onSuccess: () => {
      refresh();
      Alert.alert('Products removed');
    },
    onError: (e) => Alert.alert('Could not remove', errorMessage(e)),
  });

  const confirmRemove = (g: LicenceGroup) =>
    Alert.alert(
      'Remove this licence?',
      'This removes the licence and every product assigned under it from the customer. Its line is also taken off any unpaid invoice (totals are recalculated); paid and part-paid invoices stay as issued.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(g) },
      ]
    );

  const changeStatus = (g: LicenceGroup, status: 'ACTIVE' | 'SUSPENDED') => {
    const current = g.items[0]?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
    if (status === current) return;
    if (status === 'SUSPENDED') {
      Alert.alert('Suspend this licence?', 'The client will see it as Suspended - Overdue.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Suspend', style: 'destructive', onPress: () => setStatus.mutate({ items: g.items, status }) },
      ]);
    } else setStatus.mutate({ items: g.items, status });
  };

  return (
    <View style={{ gap: 12 }}>
      <Btn title="Assign product" icon="add" onPress={() => nav.navigate('CustomerProductAssign', { clientId })} />
      {!groups.length ? (
        <EmptyCard icon="cube-outline" title="No products assigned" body="Use “Assign product” to add one." />
      ) : (
        groups.map((g) => {
          const rep = g.items[0]!;
          const pending = g.items.some((it) => it.approvalStatus === 'PENDING');
          const left = daysLeft(rep.expiryDate);
          const realKey = !g.key.startsWith('__');
          return (
            <Card key={g.key} style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  {g.items.map((it) => (
                    <View key={it.id}>
                      <T w="s" size={14.5} numberOfLines={2}>
                        {it.product.name}
                      </T>
                      <Muted size={12}>
                        {it.product.sku ?? it.product.productCode} · {money(Number(it.price) || 0)}
                        {cpBasisSuffix(it)}
                        {cpDiscount(it) ? ` · −${cpDiscount(it)}%` : ''}
                        {cpUnits(it) !== 1 ? ` · ×${cpUnits(it)}` : ''}
                      </Muted>
                    </View>
                  ))}
                </View>
                <IconBtn icon="eye-outline" label="View details" onPress={() => setViewing(g)} />
                <IconBtn
                  icon="create-outline"
                  label="Edit licence"
                  onPress={() => nav.navigate('CustomerProductAssign', { clientId, groupKey: g.key })}
                  disabled={!realKey}
                />
                <IconBtn icon="trash-outline" label="Remove licence" color={colors.redFg} onPress={() => confirmRemove(g)} />
              </View>

              {realKey ? (
                <T mono size={11.5} color={colors.muted} style={{ marginTop: 8 }} selectable>
                  {g.key}
                </T>
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
                <Mini label="Issued" value={fmtDate(rep.issueDate)} />
                <Mini label="Expiry" value={fmtDate(rep.expiryDate)} />
                <Mini label="Days left" value={left} warn={left === 'Expired'} />
                <Mini label="Contract" value={prettyEnum(rep.contractType ?? 'LOCKED')} />
                <Mini label="GST" value={prettyEnum(rep.gstType ?? 'EXCLUSIVE')} />
                <Mini label="Total" value={money(groupTotal(g))} strong />
              </View>

              <View style={{ marginTop: 12 }}>
                {pending ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Pill kind="warn" label="Pending approval" />
                    <View style={{ flex: 1 }} />
                    <Btn
                      title="Approve"
                      onPress={() => approve.mutate(g.items)}
                      loading={approve.isPending && approve.variables === g.items}
                      style={{ minHeight: 40, paddingHorizontal: 18 }}
                    />
                  </View>
                ) : (
                  <Segment<'ACTIVE' | 'SUSPENDED'>
                    options={[
                      { value: 'ACTIVE', label: 'Active' },
                      { value: 'SUSPENDED', label: 'Suspended - Overdue' },
                    ]}
                    value={rep.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'}
                    onChange={(v) => changeStatus(g, v)}
                  />
                )}
              </View>
            </Card>
          );
        })
      )}

      <LicenceDetailsSheet group={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

function Mini({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <View>
      <Muted size={11}>{label}</Muted>
      <T w={strong ? 'b' : 's'} size={13} color={warn ? colors.redFg : colors.fg}>
        {value}
      </T>
    </View>
  );
}

/** Read-only full details of a licence group (web LicenceGroupDetailsDialog). */
function LicenceDetailsSheet({ group, onClose }: { group: LicenceGroup | null; onClose: () => void }) {
  const rep = group?.items[0];
  const totals = (group?.items ?? []).reduce(
    (acc, cp) => {
      const t = cpTotals(cp);
      return { net: acc.net + t.net, gst: acc.gst + t.gst, total: acc.total + t.total };
    },
    { net: 0, gst: 0, total: 0 }
  );
  const row = (k: string, v: string) => (
    <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
      <Muted size={13}>{k}</Muted>
      <T w="s" size={13} style={{ flexShrink: 1, textAlign: 'right' }} selectable>
        {v}
      </T>
    </View>
  );
  return (
    <Sheet open={!!group} onClose={onClose}>
      {group && rep ? (
        <>
          <SheetTitle title="Licence details" body="Full details of this licence and its products." />
          {row('Licence key', rep.licence?.licenceKey ?? '—')}
          {row('Status', prettyEnum(rep.status ?? 'ACTIVE'))}
          {row('Contract', prettyEnum(rep.contractType ?? 'LOCKED'))}
          {row('GST', prettyEnum(rep.gstType ?? 'EXCLUSIVE'))}
          {row('Invoicing term', rep.invoicingTerm || '—')}
          {row('Advance billing', rep.advancePayment ? 'On (auto recurring)' : 'Off')}
          {row('Issued', fmtDate(rep.issueDate))}
          {row('Expiry', fmtDate(rep.expiryDate))}
          {row('Days left', daysLeft(rep.expiryDate))}

          {group.items.map((cp) => {
            const t = cpTotals(cp);
            return (
              <Card key={cp.id} style={{ padding: 12, marginTop: 12 }}>
                <T w="s" size={14}>
                  {cp.product.name}
                </T>
                <Muted size={12}>{cp.product.sku ?? cp.product.productCode}</Muted>
                <View style={{ marginTop: 6 }}>
                  {row('Agreed price', `${money(Number(cp.price) || 0)}${cpBasisSuffix(cp)}`)}
                  {row('Discount', cpDiscount(cp) ? `${cpDiscount(cp)}%` : '—')}
                  {row('Qty/Hours', String(cpUnits(cp)))}
                  {row('Net', money(t.net))}
                  {row('GST', money(t.gst))}
                  {row('Total', money(t.total))}
                </View>
              </Card>
            );
          })}

          <Card style={{ padding: 12, marginTop: 12, backgroundColor: colors.soft2 }}>
            <T w="s" size={14}>
              Totals
            </T>
            {row('Net', money(totals.net))}
            {row('GST', money(totals.gst))}
            {row('Total', money(totals.total))}
          </Card>
          <Btn title="Close" variant="ghost" onPress={onClose} style={{ marginTop: 14 }} />
        </>
      ) : null}
    </Sheet>
  );
}
