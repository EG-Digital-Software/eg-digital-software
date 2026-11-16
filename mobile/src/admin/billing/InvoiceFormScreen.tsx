import React, { useMemo, useRef, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  billingApi,
  type AdminInvoice,
  type BillingCustomer,
  type InvoiceInput,
  type InvoiceLineInput,
} from '../../api/admin/billing';
import { errorMessage } from '../../api/client';
import { money } from '../../lib/portal';
import { colors } from '../../theme';
import { Btn, Card, ErrorBox, Loading, Muted, Screen, SectionHead, Sheet, SheetOption, T } from '../../ui';
import { DateField } from '../pickers';
import { CustomerPickerSheet, Field, Input, ReadBox, Seg, SelectBox, customerLabel, decimalOnly, digitsOnly } from './shared';
import {
  INVOICE_TERMS,
  buildLicenceGroups,
  chargePeriod,
  computeDueDate,
  computeProration,
  defaultNextBillingDate,
  findLicenceGroup,
  fmtDay,
  invoiceTermLabel,
  licenceGroupBilled,
  normalizeInvoiceTerm,
  productBilled,
  productUnits,
  round2,
  termToDays,
  toDateInput,
  today,
  type LicenceGroup,
  type Proration,
} from './proration';

/** One line as typed — numbers stay strings while editing. */
interface Line {
  key: string;
  productId?: string | null;
  sku?: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  contractType: 'LOCKED' | 'TRIAL';
  gstType: 'INCLUSIVE' | 'EXCLUSIVE';
}

let seq = 0;
const blankLine = (description = ''): Line => ({
  key: `l${++seq}`,
  productId: null,
  sku: null,
  description,
  quantity: '1',
  unitPrice: '0',
  taxRate: '10',
  contractType: 'LOCKED',
  gstType: 'EXCLUSIVE',
});

const PER: Record<string, string> = { DAILY: '/day', WEEKLY: '/week', MONTHLY: '/month', ANNUALLY: '/year', ONE_TIME: ' one-time' };

/** InvoiceForm { id?, clientId? } — create (no id) or edit an invoice. */
export default function InvoiceFormScreen() {
  const id: string | undefined = useRoute<any>().params?.id;
  const presetClient: string | undefined = useRoute<any>().params?.clientId;
  const existing = useQuery({
    queryKey: ['admin-billing', 'invoice', id],
    queryFn: () => billingApi.get(id!),
    enabled: !!id,
    staleTime: 0,
    // Don't reset unsaved edits by refetching under the form.
    refetchOnWindowFocus: false,
  });

  if (id && existing.isLoading) {
    return (
      <Screen title="Edit invoice" back>
        <Loading />
      </Screen>
    );
  }
  if (id && (existing.isError || !existing.data)) {
    return (
      <Screen title="Edit invoice" back>
        <ErrorBox message={errorMessage(existing.error, 'Invoice not found')} onRetry={() => void existing.refetch()} />
      </Screen>
    );
  }
  return <InvoiceFormBody invoice={existing.data} presetClient={presetClient} />;
}

function InvoiceFormBody({ invoice, presetClient }: { invoice?: AdminInvoice; presetClient?: string }) {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const editing = !!invoice;

  // ── Form state (prefilled like the web's EditInvoicePage / InvoiceForm defaults) ──
  const [clientId, setClientId] = useState(invoice?.customer?.clientId ?? presetClient ?? '');
  const [pickedCustomer, setPickedCustomer] = useState<BillingCustomer | null>(null);
  const initialDate = invoice ? (invoice.invoiceDate ? invoice.invoiceDate.slice(0, 10) : '') : toDateInput(today());
  const [invoiceDate, setInvoiceDateRaw] = useState(initialDate);
  const [term, setTerm] = useState(invoice ? normalizeInvoiceTerm(invoice.term) : 'NET_7');
  const [nextBillingDate, setNextBillingDate] = useState(() => {
    const stored = (invoice?.nextBillingDate ?? '').slice(0, 10);
    if (stored) return stored;
    const d = defaultNextBillingDate(initialDate || undefined);
    return d ? toDateInput(d) : '';
  });
  const [reference, setReference] = useState(invoice?.reference ?? '');
  const [discount, setDiscount] = useState(invoice ? String(Number(invoice.discount) || 0) : '0');
  const [notes, setNotes] = useState(invoice?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() =>
    invoice
      ? (invoice.items ?? []).map((it) => ({
          key: `l${++seq}`,
          productId: it.productId ?? null,
          sku: it.sku ?? null,
          description: it.description,
          quantity: String(it.quantity),
          unitPrice: String(Number(it.unitPrice) || 0),
          taxRate: String(Number(it.taxRate) || 0),
          contractType: it.contractType === 'TRIAL' ? 'TRIAL' : 'LOCKED',
          gstType: it.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE',
        }))
      : [blankLine()]
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState(false);
  const [termSheet, setTermSheet] = useState(false);
  const [productSheet, setProductSheet] = useState<number | null>(null);

  // Create form: the next billing date follows the invoice date (1st of the
  // next month) until the admin sets it themselves.
  const nextEdited = useRef(false);
  const setInvoiceDate = (v: string) => {
    setInvoiceDateRaw(v);
    if (!editing && !nextEdited.current) {
      const d = defaultNextBillingDate(v || undefined);
      if (d) setNextBillingDate(toDateInput(d));
    }
  };

  const nextRef = useQuery({
    queryKey: ['admin-billing', 'next-reference'],
    queryFn: billingApi.nextReference,
    enabled: !editing,
    staleTime: 0,
  });

  // The customer's product assignments → selectable licence groups.
  const customer = useQuery({
    queryKey: ['admin-billing', 'customer', clientId],
    queryFn: () => billingApi.customer(clientId),
    enabled: !!clientId,
  });
  const groups = useMemo<LicenceGroup[]>(() => buildLicenceGroups(customer.data?.customerProducts), [customer.data]);

  const proration = useMemo(() => computeProration(invoiceDate || undefined, nextBillingDate || undefined), [invoiceDate, nextBillingDate]);
  const period = proration ? `${fmtDay(proration.start)} to ${fmtDay(proration.end)}` : '';
  const due = useMemo(() => computeDueDate(invoiceDate || undefined, term), [invoiceDate, term]);

  const groupBilledFor = (productId?: string | null, sku?: string | null): number | null => {
    const g = findLicenceGroup(groups, productId, sku);
    return g ? licenceGroupBilled(g, proration) : null;
  };
  /** What a line bills per unit: a product line's live pro-rated price, else the typed price. */
  const effectiveUnitPrice = (it: Line): number => {
    if (it.productId) {
      const billed = groupBilledFor(it.productId, it.sku);
      if (billed != null) return round2(billed);
    }
    return Number(it.unitPrice) || 0;
  };
  const lineAmount = (it: Line) => {
    const gross = effectiveUnitPrice(it) * (Number(it.quantity) || 0);
    return it.gstType === 'INCLUSIVE' ? gross : gross * (1 + (Number(it.taxRate) || 0) / 100);
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const it of lines) {
      // Rounded per line exactly as the API does (backend computeLine), so the preview matches what's saved.
      const rate = (Number(it.taxRate) || 0) / 100;
      if (it.gstType === 'INCLUSIVE') {
        const gross = round2(effectiveUnitPrice(it) * (Number(it.quantity) || 0));
        const net = round2(gross / (1 + rate));
        subtotal += net;
        tax += round2(gross - net);
      } else {
        const net = round2(effectiveUnitPrice(it) * (Number(it.quantity) || 0));
        subtotal += net;
        tax += round2(net * rate);
      }
    }
    subtotal = round2(subtotal);
    tax = round2(tax);
    const disc = Number(discount) || 0;
    return { subtotal, tax, total: round2(subtotal + tax - disc) };
    // effectiveUnitPrice reads proration + groups.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, discount, proration, groups]);

  const patchLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const selectGroup = (i: number, g: LicenceGroup) => {
    const rep = g.items[0];
    if (!rep) return;
    const grpTerm = g.items.find((cp) => cp.invoicingTerm)?.invoicingTerm;
    patchLine(i, {
      productId: rep.product.id,
      sku: g.licenceKey || rep.product.sku || rep.product.productCode || '',
      description: g.items.map((cp) => cp.product.name).join('\n'),
      quantity: '1',
      unitPrice: String(round2(licenceGroupBilled(g, proration))),
      taxRate: String(Number(rep.taxRate ?? 10) || 0),
      contractType: rep.contractType === 'TRIAL' ? 'TRIAL' : 'LOCKED',
      gstType: rep.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE',
    });
    if (grpTerm) setTerm(normalizeInvoiceTerm(grpTerm));
  };

  const removeLine = (i: number) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ ...blankLine(), key: ls[0]!.key }]));

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin-billing'] });
    void qc.invalidateQueries({ queryKey: ['admin-payments'] });
  };

  const save = useMutation({
    mutationFn: (body: InvoiceInput) =>
      invoice ? billingApi.update(invoice.id, body) : billingApi.create({ ...body, clientId }),
    onSuccess: (saved) => {
      invalidate();
      if (invoice) {
        Alert.alert('Invoice updated');
        nav.goBack();
      } else {
        Alert.alert('Invoice saved as a draft', 'Tap "Send" on the invoice to issue it to the customer.');
        nav.replace('InvoiceDetail', { id: saved.id });
      }
    },
    onError: (e) => Alert.alert('Could not save invoice', errorMessage(e)),
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!editing && !clientId) errs.clientId = 'Select a customer';
    if (!invoiceDate) errs.invoiceDate = 'Pick the invoice date';
    const disc = Number(discount);
    if (!Number.isFinite(disc) || disc < 0) errs.discount = 'Must be 0 or more';
    else if (disc > round2(totals.subtotal + totals.tax)) errs.discount = 'Can’t be more than the invoice total';
    lines.forEach((l, i) => {
      if (!l.description.trim()) errs[`d${i}`] = 'Required';
      const qty = Number(l.quantity);
      if (!Number.isInteger(qty) || qty <= 0) errs[`q${i}`] = 'Whole number above 0';
      const rate = Number(l.taxRate);
      if (l.taxRate === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) errs[`t${i}`] = '0–100';
      if (!Number.isFinite(Number(l.unitPrice)) || Number(l.unitPrice) < 0) errs[`p${i}`] = 'Must be 0 or more';
    });
    setErrors(errs);
    if (Object.keys(errs).length) {
      Alert.alert('Check the form', 'Some fields need attention.');
      return;
    }
    const items: InvoiceLineInput[] = lines.map((l) => ({
      productId: l.productId || undefined,
      sku: l.sku || undefined,
      description: l.description,
      quantity: Number(l.quantity),
      // Send exactly the amounts shown — product lines at their live pro-rated price.
      unitPrice: effectiveUnitPrice(l),
      taxRate: Number(l.taxRate),
      contractType: l.contractType,
      gstType: l.gstType,
    }));
    const body: InvoiceInput = {
      invoiceDate,
      term,
      nextBillingDate: nextBillingDate || undefined,
      discount: disc || 0,
      notes,
      items,
      dueDate: due ? toDateInput(due) : undefined,
      ...(editing ? { reference } : {}),
    };
    save.mutate(body);
  };

  const customerName = editing
    ? customerLabel(invoice?.customer)
    : pickedCustomer
      ? customerLabel(pickedCustomer)
      : customer.data
        ? customerLabel(customer.data)
        : clientId;
  const termOptions: { value: string; label: string }[] = [
    ...(editing ? [{ value: '', label: '—' }] : []),
    ...INVOICE_TERMS,
    ...(term && !INVOICE_TERMS.some((t) => t.value === term) ? [{ value: term, label: invoiceTermLabel(term) }] : []),
  ];
  const days = termToDays(term);

  return (
    <Screen title={editing ? `Edit ${invoice!.invoiceNumber}` : 'New invoice'} back padBottom={48}>
      {editing ? (
        <Muted size={13.5} style={{ lineHeight: 20 }}>
          Update dates, line items and notes. Saving re-prices the invoice.
        </Muted>
      ) : null}

      {/* ── Details ── */}
      <SectionHead title="Invoice details" />
      <Card style={{ padding: 16, paddingTop: 4 }}>
        <Field label="Customer" error={errors.clientId}>
          {editing ? (
            <ReadBox value={customerName || '—'} />
          ) : (
            <SelectBox value={clientId ? `${customerName} (${clientId})` : ''} placeholder="Select customer…" onPress={() => setPicker(true)} />
          )}
        </Field>
        <Field label="Invoice date" error={errors.invoiceDate}>
          <DateField value={invoiceDate} onChange={setInvoiceDate} />
        </Field>
        <Field label="Term" hint="How long the client has to pay">
          <SelectBox value={termOptions.find((t) => t.value === term)?.label ?? '—'} placeholder="—" onPress={() => setTermSheet(true)} />
        </Field>
        <Field label="Due date" hint={`Pay within ${days} day${days === 1 ? '' : 's'} of the invoice date`}>
          <ReadBox value={due ? fmtDay(due) : '—'} />
        </Field>
        <Field
          label="Next billing date"
          hint={proration ? `Billing period: ${period} (${proration.billedDays}/${proration.periodDays} days)` : null}
        >
          <DateField
            value={nextBillingDate}
            onChange={(v) => {
              nextEdited.current = true;
              setNextBillingDate(v);
            }}
          />
        </Field>
        <Field label="Reference" hint={editing ? null : 'Auto-generated — assigned when the invoice is created'}>
          {editing ? (
            <Input value={reference} onChangeText={setReference} autoCapitalize="characters" autoCorrect={false} />
          ) : (
            <ReadBox value={nextRef.data ?? 'Auto-generated'} mono />
          )}
        </Field>
      </Card>

      {/* ── Line items ── */}
      <SectionHead
        title="Line items"
        action="+ Add line"
        onAction={() => setLines((ls) => [...ls, blankLine(editing ? '' : period)])}
      />
      {lines.map((l, i) => {
        const group = findLicenceGroup(groups, l.productId, l.sku);
        const isProduct = !!l.productId && !!group;
        return (
          <Card key={l.key} style={{ padding: 14, paddingTop: 2, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <T w="s" size={14} style={{ flex: 1 }}>
                Line {i + 1}
              </T>
              <Pressable onPress={() => removeLine(i)} hitSlop={10} accessibilityLabel={`Remove line ${i + 1}`}>
                <Ionicons name="trash-outline" size={19} color={colors.muted} />
              </Pressable>
            </View>
            <Field label="Product" error={errors[`d${i}`]}>
              <SelectBox
                value={group ? groupLabel(group) : ''}
                placeholder={
                  clientId ? (groups.length ? 'Select licence / products…' : 'No products assigned to this client') : 'Select a customer first…'
                }
                disabled={!clientId}
                onPress={() => setProductSheet(i)}
              />
              {group ? (
                <GroupSummary group={group} sku={l.sku} proration={proration} />
              ) : (
                <Input
                  style={{ marginTop: 8, minHeight: 64 }}
                  multiline
                  value={l.description}
                  onChangeText={(t) => patchLine(i, { description: t })}
                  placeholder="Description (one product per line)"
                />
              )}
            </Field>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Qty" error={errors[`q${i}`]} style={{ flex: 1 }}>
                <Input value={l.quantity} onChangeText={(t) => patchLine(i, { quantity: digitsOnly(t) })} keyboardType="number-pad" />
              </Field>
              <Field label="Unit price" error={errors[`p${i}`]} style={{ flex: 1.4 }}>
                {isProduct ? (
                  <ReadBox value={money(effectiveUnitPrice(l))} />
                ) : (
                  <Input value={l.unitPrice} onChangeText={(t) => patchLine(i, { unitPrice: decimalOnly(t) })} keyboardType="decimal-pad" />
                )}
              </Field>
              <Field label="Tax %" error={errors[`t${i}`]} style={{ flex: 1 }}>
                <Input value={l.taxRate} onChangeText={(t) => patchLine(i, { taxRate: decimalOnly(t) })} keyboardType="decimal-pad" />
              </Field>
            </View>
            <Field label="GST">
              <Seg
                value={l.gstType}
                onChange={(v) => patchLine(i, { gstType: v })}
                options={[
                  { value: 'EXCLUSIVE', label: 'Exclusive' },
                  { value: 'INCLUSIVE', label: 'Inclusive' },
                ]}
              />
            </Field>
            <Field label="Contract">
              <Seg
                value={l.contractType}
                onChange={(v) => patchLine(i, { contractType: v })}
                options={[
                  { value: 'LOCKED', label: 'Locked' },
                  { value: 'TRIAL', label: 'Trial' },
                ]}
              />
            </Field>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <Muted size={12.5}>Amount (incl. GST)</Muted>
              <T w="b" size={15} color={colors.green}>
                {money(lineAmount(l))}
              </T>
            </View>
          </Card>
        );
      })}
      <Btn title="Add line" icon="add" variant="dashed" onPress={() => setLines((ls) => [...ls, blankLine(editing ? '' : period)])} />

      {/* ── Notes ── */}
      <SectionHead title="Notes" />
      <Input multiline style={{ minHeight: 110 }} value={notes} onChangeText={setNotes} placeholder="Notes visible on the invoice…" />

      {/* ── Summary ── */}
      <SectionHead title="Summary" />
      <Card style={{ padding: 16 }}>
        <SumRow label="Subtotal" value={money(totals.subtotal)} />
        <SumRow label="Tax" value={money(totals.tax)} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <Muted size={14}>Discount</Muted>
          <Input
            value={discount}
            onChangeText={(t) => setDiscount(decimalOnly(t))}
            keyboardType="decimal-pad"
            style={{ width: 130, textAlign: 'right', minHeight: 42 }}
          />
        </View>
        {errors.discount ? (
          <T size={12} color={colors.redFg} style={{ textAlign: 'right', marginTop: 4 }}>
            {errors.discount}
          </T>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, marginTop: 14, paddingTop: 14 }}>
          <T w="b" size={18}>
            Total
          </T>
          <T w="b" size={18}>
            {money(totals.total)}
          </T>
        </View>
        {editing && Number(invoice!.amountPaid) > 0 ? (
          <View style={{ backgroundColor: colors.warnBg, borderRadius: 10, padding: 10, marginTop: 12 }}>
            <T size={12.5} color={colors.warnFg} style={{ lineHeight: 18 }}>
              {money(Number(invoice!.amountPaid))} already paid on this invoice — editing the total changes the outstanding balance.
            </T>
          </View>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Btn title="Cancel" variant="ghost" onPress={() => nav.goBack()} disabled={save.isPending} style={{ flex: 1 }} />
        <Btn title={editing ? 'Save changes' : 'Create invoice'} onPress={submit} loading={save.isPending} style={{ flex: 1.4 }} />
      </View>

      {/* ── Sheets ── */}
      <CustomerPickerSheet
        open={picker}
        activeOnly
        selected={clientId}
        onClose={() => setPicker(false)}
        onPick={(c) => {
          if (!c) return;
          if (c.clientId !== clientId) {
            // Product lines belong to the previous customer — start them over.
            setLines((ls) => ls.map((l) => (l.productId ? { ...blankLine(), key: l.key } : l)));
          }
          setPickedCustomer(c);
          setClientId(c.clientId);
          setPicker(false);
        }}
      />

      <Sheet open={termSheet} onClose={() => setTermSheet(false)}>
        <T w="s" size={17}>
          Term
        </T>
        {termOptions.map((t) => (
          <SheetOption
            key={t.value || 'none'}
            title={t.label}
            selected={t.value === term}
            onPress={() => {
              setTerm(t.value);
              setTermSheet(false);
            }}
          />
        ))}
      </Sheet>

      <Sheet open={productSheet !== null} onClose={() => setProductSheet(null)}>
        <T w="s" size={17}>
          Licence / products
        </T>
        {customer.isLoading ? (
          <Loading />
        ) : customer.isError ? (
          <View style={{ marginTop: 10 }}>
            <ErrorBox message={errorMessage(customer.error)} onRetry={() => void customer.refetch()} />
          </View>
        ) : (
          <>
            {groups.length === 0 ? (
              <Muted size={14} style={{ paddingVertical: 16 }}>
                No products assigned to this client.
              </Muted>
            ) : (
              groups.map((g) => (
                <SheetOption
                  key={g.key}
                  title={g.items.map((cp) => cp.product.name).join(' + ')}
                  right={g.licenceKey || undefined}
                  selected={productSheet !== null && findLicenceGroup(groups, lines[productSheet]?.productId, lines[productSheet]?.sku)?.key === g.key}
                  onPress={() => {
                    if (productSheet !== null) selectGroup(productSheet, g);
                    setProductSheet(null);
                  }}
                />
              ))
            )}
            <SheetOption
              title="Manual line (type a description)"
              onPress={() => {
                if (productSheet !== null) {
                  const cur = lines[productSheet];
                  if (cur?.productId) patchLine(productSheet, { ...blankLine(), key: cur.key });
                }
                setProductSheet(null);
              }}
            />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

const groupLabel = (g: LicenceGroup) => `${g.items.map((cp) => cp.product.name).join(' + ')}${g.licenceKey ? ` · ${g.licenceKey}` : ''}`;

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
      <Muted size={14}>{label}</Muted>
      <T w="s" size={14}>
        {value}
      </T>
    </View>
  );
}

/** Read-only licence summary for a product-backed line (like the web's LineItemProduct). */
function GroupSummary({ group, sku, proration }: { group: LicenceGroup; sku?: string | null; proration: Proration | null }) {
  return (
    <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.soft2, padding: 10 }}>
      {sku ? (
        <T w="s" size={12.5} style={{ paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 6 }}>
          Licence: {sku}
        </T>
      ) : null}
      {group.items.map((cp, i) => (
        <View key={cp.id} style={{ paddingTop: i ? 6 : 0, marginTop: i ? 6 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T w="s" size={13} style={{ flex: 1 }} numberOfLines={1}>
              {cp.product.name}
            </T>
            <Muted size={11.5}>SKU: {cp.product.sku || cp.product.productCode || '—'}</Muted>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
            <Muted size={12}>
              Agreed {money(Number(cp.price) || 0)}
              {PER[chargePeriod(cp) ?? ''] ?? '/month'}
              {Number(cp.discountPercent) > 0 ? ` −${Number(cp.discountPercent)}%` : ''}
            </Muted>
            <Muted size={12}>Units {productUnits(cp)}</Muted>
            <T w="s" size={12} color={colors.green}>
              Net {money(productBilled(cp, proration))}
            </T>
          </View>
        </View>
      ))}
    </View>
  );
}
