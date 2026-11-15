import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import {
  adminCustomersApi,
  customerName,
  type AssignLine,
  type GroupUpdate,
  type PriceBasis,
} from '../../api/admin/customers';
import { money } from '../../lib/portal';
import { Btn, Card, ErrorBox, Loading, Muted, Screen, SectionHead, T, Toggle } from '../../ui';
import { colors } from '../../theme';
import { DateField } from '../pickers';
import { Field, LIST_KEY, Segment, cpDiscount, cpUnits, customerKey, licenceGroups } from './common';

type Contract = 'LOCKED' | 'TRIAL';
type Gst = 'INCLUSIVE' | 'EXCLUSIVE';

const TAX_RATE = 10; // GST is fixed at 10%

/**
 * Assign products to a customer, or edit a licence group (web ProductsTab form).
 * Route `CustomerProductAssign { clientId, groupKey? }` — with a key it edits that
 * group: ticked products are the desired set, all sharing the one licence key.
 */
export default function ProductAssignScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const clientId: string = route.params?.clientId;
  const groupKey: string | undefined = route.params?.groupKey;
  const editing = !!groupKey;

  const customer = useQuery({ queryKey: customerKey(clientId), queryFn: () => adminCustomersApi.get(clientId) });
  const products = useQuery({ queryKey: ['admin-customers', 'active-products'], queryFn: adminCustomersApi.activeProducts });

  // productId → agreed price / qty / discount / basis (strings while typing).
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, string>>({});
  const [discounts, setDiscounts] = useState<Record<string, string>>({});
  const [bases, setBases] = useState<Record<string, PriceBasis>>({});
  const [contractType, setContractType] = useState<Contract>('LOCKED');
  const [gstType, setGstType] = useState<Gst>('EXCLUSIVE');
  const [invoicingTerm, setInvoicingTerm] = useState('');
  const [licence, setLicence] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [advancePay, setAdvancePay] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Editing: start from the group as saved.
  const group = useMemo(
    () => (editing && customer.data ? licenceGroups(customer.data).find((g) => g.key === groupKey) : undefined),
    [editing, customer.data, groupKey]
  );
  useEffect(() => {
    if (!group || prefilled) return;
    const rep = group.items[0]!;
    setSelected(Object.fromEntries(group.items.map((cp) => [cp.product.id, cp.price != null ? String(cp.price) : ''])));
    setUnits(Object.fromEntries(group.items.map((cp) => [cp.product.id, String(cpUnits(cp) || 1)])));
    setDiscounts(Object.fromEntries(group.items.map((cp) => [cp.product.id, cpDiscount(cp) ? String(cpDiscount(cp)) : ''])));
    setBases(Object.fromEntries(group.items.filter((cp) => cp.priceBasis).map((cp) => [cp.product.id, cp.priceBasis as PriceBasis])));
    setContractType(rep.contractType === 'TRIAL' ? 'TRIAL' : 'LOCKED');
    setGstType(rep.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE');
    setInvoicingTerm(rep.invoicingTerm ?? '');
    setLicence(rep.licence?.licenceKey ?? '');
    setIssueDate(rep.issueDate ? rep.issueDate.slice(0, 10) : '');
    setExpiryDate(rep.expiryDate ? rep.expiryDate.slice(0, 10) : '');
    setAdvancePay(rep.advancePayment ?? false);
    setPrefilled(true);
  }, [group, prefilled]);

  // Products already in the group stay listed even if no longer ACTIVE.
  const list = useMemo(() => {
    const items = [...(products.data ?? [])];
    for (const cp of group?.items ?? []) if (!items.some((p) => p.id === cp.product.id)) items.push(cp.product);
    return items;
  }, [products.data, group]);

  const selectedIds = Object.keys(selected);
  const productOf = (id: string) => list.find((p) => p.id === id);
  const listPriceOf = (id: string) => Number(productOf(id)?.pricePerQty) || 0;
  const discountOf = (id: string) => Math.min(100, Math.max(0, Number(discounts[id]) || 0));
  // Ask what a hand-set price is per only when it differs from the list price.
  const showBasis = (id: string) =>
    !!bases[id] || (selected[id] !== '' && selected[id] !== undefined && Number(selected[id]) !== listPriceOf(id));
  const basisOf = (id: string): PriceBasis => bases[id] || (productOf(id)?.billingPeriod === 'DAILY' ? 'DAILY' : 'MONTHLY');
  const priceBasisFor = (id: string): PriceBasis | null => (showBasis(id) ? basisOf(id) : null);
  const withGst = (net: number) => (gstType === 'INCLUSIVE' ? net : net + net * (TAX_RATE / 100));
  const total = selectedIds.reduce(
    (sum, id) => sum + withGst((Number(selected[id]) || 0) * (1 - discountOf(id) / 100) * (Number(units[id]) || 1)),
    0
  );

  const omit = <V,>(rec: Record<string, V>, id: string) => {
    const { [id]: _drop, ...rest } = rec;
    void _drop;
    return rest;
  };

  const toggle = (id: string) => {
    const picked = id in selected;
    if (picked) {
      setSelected((s) => omit(s, id));
      setUnits((u) => omit(u, id));
      setDiscounts((d) => omit(d, id));
      setBases((b) => omit(b, id));
      return;
    }
    const p = productOf(id);
    const lp = Number(p?.pricePerQty) || 0;
    // GST type is shared — ticking a product with its own takes it over.
    if (p?.gstType) setGstType(p.gstType);
    setSelected((s) => ({ ...s, [id]: lp > 0 ? String(lp) : '' }));
    setUnits((u) => ({ ...u, [id]: u[id] ?? '1' }));
  };

  const datesOk = !issueDate || !expiryDate || expiryDate >= issueDate;

  const done = (msg: string) => {
    void qc.invalidateQueries({ queryKey: customerKey(clientId) });
    void qc.invalidateQueries({ queryKey: LIST_KEY });
    Alert.alert(msg);
    nav.goBack();
  };

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        // Always send the price (0 when cleared) so clearing it actually saves.
        const body: GroupUpdate = {
          products: selectedIds.map((id) => ({
            productId: id,
            price: Number(selected[id]) || 0,
            discountPercent: discountOf(id),
            priceBasis: priceBasisFor(id),
            unitHoursEnabled: true,
            unitHours: Number(units[id]) || 1,
          })),
          contractType,
          gstType,
          invoicingTerm,
          advancePayment: advancePay,
        };
        if (licence.trim()) body.licenceKey = licence.trim();
        if (issueDate) body.issueDate = issueDate;
        if (expiryDate) body.expiryDate = expiryDate;
        await adminCustomersApi.updateProductGroup(clientId, groupKey!, body);
        return 'Products updated';
      }
      const lines: AssignLine[] = selectedIds.map((id) => ({
        productId: id,
        contractType,
        gstType,
        invoicingTerm,
        advancePayment: advancePay,
        taxRate: TAX_RATE,
        ...(issueDate ? { issueDate } : {}),
        ...(expiryDate ? { expiryDate } : {}),
        unitHoursEnabled: true,
        unitHours: Number(units[id]) || 1,
        discountPercent: discountOf(id),
        priceBasis: priceBasisFor(id),
        ...(selected[id] !== '' ? { price: Number(selected[id]) } : {}),
        // Many products can't share a typed key — each auto-generates its own.
        ...(selectedIds.length === 1 && licence.trim() ? { licence: licence.trim() } : {}),
      }));
      await adminCustomersApi.assignProducts(clientId, lines);
      return selectedIds.length === 1 ? 'Product assigned' : `${selectedIds.length} products assigned`;
    },
    onSuccess: done,
    onError: (e) => Alert.alert('Not saved', errorMessage(e)),
  });

  const termOptions = [
    { value: '', label: '—' },
    { value: 'Due on Receipt', label: 'Due on Receipt' },
    { value: '7 Days', label: '7 Days' },
    // A saved term no longer offered stays selectable so it isn't silently rewritten.
    ...(invoicingTerm && !['', 'Due on Receipt', '7 Days'].includes(invoicingTerm) ? [{ value: invoicingTerm, label: invoicingTerm }] : []),
  ];

  const loading = customer.isLoading || products.isLoading || (editing && !prefilled && !customer.isError && !!group);

  return (
    <Screen title={editing ? 'Edit licence' : 'Assign products'} back>
      {customer.data ? (
        <Muted size={13.5} style={{ marginBottom: 8 }}>
          {customerName(customer.data)} · {clientId}
        </Muted>
      ) : null}
      {loading ? (
        <Loading />
      ) : customer.isError || products.isError ? (
        <ErrorBox
          message={errorMessage(customer.error ?? products.error)}
          onRetry={() => {
            void customer.refetch();
            void products.refetch();
          }}
        />
      ) : editing && !group ? (
        <ErrorBox message="This licence no longer exists." />
      ) : (
        <>
          <SectionHead title={`Products${selectedIds.length ? ` (${selectedIds.length} selected)` : ''}`} />
          <Muted size={12.5} style={{ marginBottom: 10 }}>
            {editing
              ? 'Tick to add products to this licence, untick to remove — all share the one licence key below.'
              : 'Tick products and set each one’s agreed price — the other terms below apply to all selected.'}
          </Muted>
          <View style={{ gap: 8 }}>
            {!list.length ? (
              <Muted size={13.5}>No active products available.</Muted>
            ) : (
              list.map((p) => {
                const picked = p.id in selected;
                return (
                  <Card key={p.id} style={[{ padding: 12 }, picked && { borderColor: colors.green2, backgroundColor: colors.greenTint }]}>
                    <Pressable onPress={() => toggle(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name={picked ? 'checkbox' : 'square-outline'} size={22} color={picked ? colors.green : colors.faint} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T w="s" size={14}>
                          {p.name}
                        </T>
                        <Muted size={12}>
                          {p.sku ?? p.productCode}
                          {Number(p.pricePerQty) > 0 ? ` · ${money(Number(p.pricePerQty))}` : ''}
                        </Muted>
                      </View>
                    </Pressable>
                    {picked ? (
                      <View style={{ marginTop: 10, gap: 10 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Field
                            label="Agreed price"
                            value={selected[p.id]}
                            onChangeText={(v) => setSelected((s) => ({ ...s, [p.id]: v.replace(/[^0-9.]/g, '') }))}
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            style={{ flex: 1.3 }}
                          />
                          <Field
                            label="Discount %"
                            value={discounts[p.id] ?? ''}
                            onChangeText={(v) => setDiscounts((d) => ({ ...d, [p.id]: v.replace(/[^0-9.]/g, '') }))}
                            placeholder="0"
                            keyboardType="decimal-pad"
                            style={{ flex: 1 }}
                          />
                          <Field
                            label="Qty/Hours"
                            value={units[p.id] ?? '1'}
                            onChangeText={(v) => setUnits((u) => ({ ...u, [p.id]: v.replace(/[^0-9.]/g, '') }))}
                            placeholder="1"
                            keyboardType="decimal-pad"
                            style={{ flex: 1 }}
                          />
                        </View>
                        {showBasis(p.id) ? (
                          <View>
                            <Muted size={12.5} w="s" style={{ marginBottom: 6 }}>
                              Price is per
                            </Muted>
                            <Segment<PriceBasis>
                              options={[
                                { value: 'DAILY', label: 'Per day' },
                                { value: 'MONTHLY', label: 'Per month' },
                              ]}
                              value={basisOf(p.id)}
                              onChange={(v) => setBases((b) => ({ ...b, [p.id]: v }))}
                            />
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </View>

          <SectionHead title="Terms" />
          <Card style={{ padding: 14, gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Muted size={13}>Tax rate</Muted>
              <T w="s" size={13}>
                {TAX_RATE}% GST (fixed)
              </T>
            </View>
            <View>
              <Muted size={12.5} w="s" style={{ marginBottom: 6 }}>
                Type of contract
              </Muted>
              <Segment<Contract>
                options={[
                  { value: 'LOCKED', label: 'Locked' },
                  { value: 'TRIAL', label: 'Trial' },
                ]}
                value={contractType}
                onChange={setContractType}
              />
            </View>
            <View>
              <Muted size={12.5} w="s" style={{ marginBottom: 6 }}>
                GST
              </Muted>
              <Segment<Gst>
                options={[
                  { value: 'EXCLUSIVE', label: 'Exclusive' },
                  { value: 'INCLUSIVE', label: 'Inclusive' },
                ]}
                value={gstType}
                onChange={setGstType}
              />
            </View>
            <View>
              <Muted size={12.5} w="s" style={{ marginBottom: 6 }}>
                Invoicing term
              </Muted>
              <Segment<string> options={termOptions} value={invoicingTerm} onChange={setInvoicingTerm} />
            </View>
            <Field
              label={editing ? 'Licence key (shared)' : 'Licence key'}
              value={licence}
              onChangeText={setLicence}
              placeholder={editing ? '' : 'Auto-generated (shared)'}
              autoCapitalize="characters"
              autoCorrect={false}
              hint={!editing && selectedIds.length > 1 ? 'With several products each gets its own key.' : undefined}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <DateField label="Issue date" value={issueDate} onChange={setIssueDate} placeholder="Pick a date" clearable />
              </View>
              <View style={{ flex: 1 }}>
                <DateField
                  label="Expiry date"
                  value={expiryDate}
                  onChange={setExpiryDate}
                  placeholder="Pick a date"
                  clearable
                  min={issueDate || undefined}
                />
              </View>
            </View>
            {!datesOk ? (
              <Muted size={12} color={colors.redFg}>
                The expiry date must be after the issue date.
              </Muted>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T w="s" size={14}>
                  Advance payment
                </T>
                <Muted size={12} style={{ lineHeight: 17 }}>
                  Auto recurring invoices at the start of each billing period, emailed to the client. Monthly terms bill on
                  the 1st (first invoice pro-rated from the issue date). The first invoice is sent immediately on assignment.
                </Muted>
              </View>
              <Toggle value={advancePay} onChange={setAdvancePay} />
            </View>
          </Card>

          <Card style={{ padding: 14, marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Muted size={14}>Total amount</Muted>
            <T w="b" size={18}>
              {money(total)}
            </T>
          </Card>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Btn title="Cancel" variant="ghost" onPress={() => nav.goBack()} style={{ flex: 1 }} />
            <Btn
              title={editing ? 'Save changes' : selectedIds.length > 1 ? `Assign ${selectedIds.length}` : 'Assign'}
              onPress={() => save.mutate()}
              loading={save.isPending}
              disabled={!selectedIds.length || !datesOk}
              style={{ flex: 1.4 }}
            />
          </View>
        </>
      )}
    </Screen>
  );
}
