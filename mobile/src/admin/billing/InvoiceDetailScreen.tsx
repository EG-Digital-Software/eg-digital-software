import React, { useState } from 'react';
import { View, Pressable, Alert, Linking, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingApi, paymentsApi, type AdminInvoice, type AdminInvoiceItem, type InvoiceStatus } from '../../api/admin/billing';
import { errorMessage } from '../../api/client';
import { fmtDate, money } from '../../lib/portal';
import { colors } from '../../theme';
import { Btn, Card, ErrorBox, Eyebrow, KV, Loading, Muted, Pill, Screen, SectionHead, Sheet, SheetOption, T } from '../../ui';
import { INVOICE_STATUS, cap, customerLabel } from './shared';
import { computeProration, daysOverdue, fmtDay, invoiceTermLabel } from './proration';
import { printInvoice, shareInvoicePdf } from './invoicePdf';

const STATUSES = Object.keys(INVOICE_STATUS) as InvoiceStatus[];

export default function InvoiceDetailScreen() {
  const nav = useNavigation<any>();
  const id: string = useRoute<any>().params?.id;
  const qc = useQueryClient();
  const [statusSheet, setStatusSheet] = useState(false);
  const [linkSheet, setLinkSheet] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<'share' | 'print' | null>(null);

  const q = useQuery({ queryKey: ['admin-billing', 'invoice', id], queryFn: () => billingApi.get(id), staleTime: 0, enabled: !!id });
  const inv = q.data;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin-billing'] });
    void qc.invalidateQueries({ queryKey: ['admin-payments'] });
  };

  const send = useMutation({
    mutationFn: () => billingApi.send(id),
    onSuccess: (r) => {
      invalidate();
      Alert.alert('Invoice sent', `Sent to ${r.recipients.join(', ')}`);
    },
    onError: (e) => Alert.alert('Could not send', errorMessage(e)),
  });
  const markPaid = useMutation({
    mutationFn: () => paymentsApi.record(id, Number(inv!.total) - Number(inv!.amountPaid), 'manual'),
    onSuccess: () => {
      invalidate();
      Alert.alert('Payment recorded');
    },
    onError: (e) => Alert.alert('Could not record payment', errorMessage(e)),
  });
  const setStatus = useMutation({
    mutationFn: (s: InvoiceStatus) => billingApi.updateStatus(id, s),
    onSuccess: () => {
      invalidate();
      setStatusSheet(false);
    },
    onError: (e) => Alert.alert('Could not change status', errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => billingApi.remove(id),
    onSuccess: () => {
      invalidate();
      nav.goBack();
    },
    onError: (e) => Alert.alert('Could not delete', errorMessage(e)),
  });

  if (q.isLoading) {
    return (
      <Screen title="Invoice" back>
        <Loading />
      </Screen>
    );
  }
  if (q.isError || !inv) {
    return (
      <Screen title="Invoice" back>
        <ErrorBox message={errorMessage(q.error, 'Invoice not found')} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }

  const cur = inv.currency;
  const balance = Number(inv.total) - Number(inv.amountPaid);
  const isPaid = inv.status === 'PAID' || balance <= 0;
  const overdue = daysOverdue(inv);
  const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.DRAFT;
  const email = inv.customer?.billingEmail || inv.customer?.contactEmail;
  const period = computeProration(inv.invoiceDate?.slice(0, 10), inv.nextBillingDate?.slice(0, 10) || undefined);

  const runPdf = async (kind: 'share' | 'print') => {
    setPdfBusy(kind);
    try {
      if (kind === 'share') await shareInvoicePdf(inv);
      else await printInvoice(inv);
    } catch (e) {
      Alert.alert(kind === 'share' ? 'Could not create the PDF' : 'Could not print', errorMessage(e));
    } finally {
      setPdfBusy(null);
    }
  };

  const confirmSend = () =>
    email
      ? Alert.alert(
          'Send invoice to customer?',
          `Emails the invoice with a secure pay link to ${email} and any linked customer-account addresses.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Send invoice', onPress: () => send.mutate() },
          ]
        )
      : Alert.alert('No email address', 'This customer has no billing or contact email — add one on the customer record first.');

  const confirmPaid = () =>
    Alert.alert(
      'Mark invoice as paid?',
      `Records a payment of ${money(balance, cur)} (the outstanding balance) and updates the invoice status.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Record payment', onPress: () => markPaid.mutate() },
      ]
    );

  const confirmStatus = (s: InvoiceStatus) => {
    if (s === inv.status) return setStatusSheet(false);
    Alert.alert('Change status?', `Set ${inv.invoiceNumber} to "${INVOICE_STATUS[s].label}"? This only changes the status — it does not record or remove payments.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change status', onPress: () => setStatus.mutate(s) },
    ]);
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete this invoice?',
      `Permanently deletes ${inv.invoiceNumber} and its line items${inv.payments?.length ? ' and recorded payments' : ''}. If it is the customer's latest invoice, no automatic invoice follows from it — billing resumes when you create their next invoice. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete invoice', style: 'destructive', onPress: () => remove.mutate() },
      ]
    );

  return (
    <Screen title={inv.invoiceNumber} back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {/* Summary */}
      <Card style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <T mono size={13} color={colors.muted} style={{ flex: 1 }}>
            {inv.invoiceNumber}
          </T>
          <Pill kind={st.kind} label={st.label} />
        </View>
        {overdue > 0 ? <Pill kind="red" label={`${overdue} ${overdue === 1 ? 'day' : 'days'} overdue`} style={{ marginTop: 8 }} /> : null}
        {inv.customer?.clientId ? (
          <Pressable
            onPress={() => nav.navigate('CustomerDetail', { clientId: inv.customer!.clientId })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}
          >
            <Ionicons name="business-outline" size={16} color={colors.onFg} />
            <T w="s" size={15} color={colors.onFg} style={{ flexShrink: 1 }} numberOfLines={1}>
              {customerLabel(inv.customer)}
            </T>
            <T mono size={11} color={colors.muted}>
              {inv.customer.clientId}
            </T>
            <Ionicons name="chevron-forward" size={14} color={colors.faint} />
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Tile label="Total" value={money(Number(inv.total), cur)} />
          <Tile label="Paid" value={money(Number(inv.amountPaid), cur)} color={colors.okFg} />
          <Tile label="Balance" value={money(balance, cur)} color={balance > 0 ? colors.redFg : undefined} />
        </View>
      </Card>

      {/* Actions */}
      <View style={{ gap: 10, marginTop: 14 }}>
        {!isPaid ? <Btn title="Mark as paid" icon="checkmark-circle-outline" onPress={confirmPaid} loading={markPaid.isPending} /> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn title="Send" icon="send-outline" variant="ghost" onPress={confirmSend} loading={send.isPending} style={{ flex: 1 }} />
          <Btn title="Edit" icon="create-outline" variant="ghost" onPress={() => nav.navigate('InvoiceForm', { id })} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn title="Status" icon="swap-horizontal-outline" variant="ghost" onPress={() => setStatusSheet(true)} style={{ flex: 1 }} />
          <Btn
            title="Pay link"
            icon="link-outline"
            variant="ghost"
            disabled={!inv.paymentUrl}
            onPress={() => setLinkSheet(true)}
            style={{ flex: 1 }}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn
            title="PDF"
            icon="download-outline"
            variant="ghost"
            loading={pdfBusy === 'share'}
            disabled={!!pdfBusy}
            onPress={() => void runPdf('share')}
            style={{ flex: 1 }}
          />
          <Btn
            title="Print"
            icon="print-outline"
            variant="ghost"
            loading={pdfBusy === 'print'}
            disabled={!!pdfBusy}
            onPress={() => void runPdf('print')}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      <KV
        style={{ marginTop: 14 }}
        rows={[
          ['Invoice date', fmtDate(inv.invoiceDate)],
          ['Due date', fmtDate(inv.dueDate)],
          ['Term', invoiceTermLabel(inv.term) || '—'],
          ['Next billing date', inv.nextBillingDate ? fmtDate(inv.nextBillingDate) : '—'],
          ['Billing period', period ? `${fmtDay(period.start)} – ${fmtDay(period.end)}` : null],
          ['Reference', inv.reference || '—'],
          ['Sends to', email],
        ]}
      />

      <SectionHead title="Line items" />
      <Card>
        {(inv.items ?? []).length === 0 ? (
          <Muted size={14} style={{ padding: 16 }}>
            No line items.
          </Muted>
        ) : (
          (inv.items ?? []).map((it, i) => <LineRow key={it.id} item={it} currency={cur} first={i === 0} />)
        )}
      </Card>

      <KV
        style={{ marginTop: 12 }}
        rows={[
          ['Subtotal', money(Number(inv.subtotal), cur)],
          ['GST', money(Number(inv.tax), cur)],
          ['Discount', Number(inv.discount) > 0 ? `-${money(Number(inv.discount), cur)}` : null],
          ['Total', money(Number(inv.total), cur)],
          ['Paid', money(Number(inv.amountPaid), cur)],
          ['Amount due', money(Math.max(balance, 0), cur)],
        ]}
      />

      {inv.notes ? (
        <>
          <SectionHead title="Notes" />
          <Card style={{ padding: 16 }}>
            <T size={14} style={{ lineHeight: 21 }}>
              {inv.notes}
            </T>
          </Card>
        </>
      ) : null}

      {inv.payments?.length ? (
        <>
          <SectionHead title="Payments" action="All payments" onAction={() => nav.navigate('Payments')} />
          <Card>
            {inv.payments.map((p, i) => (
              <View
                key={p.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}
              >
                <View style={{ flex: 1 }}>
                  <T w="s" size={14}>
                    {money(Number(p.amount), cur)}
                  </T>
                  <Muted size={12}>
                    {fmtDate(p.paidAt)} · {p.paymentMethod ?? '—'}
                  </Muted>
                </View>
                <Pill kind={p.status === 'SUCCESS' ? 'ok' : 'ns'} label={cap(p.status)} style={{ height: 24 }} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Btn
        title="Delete invoice"
        icon="trash-outline"
        variant="ghost"
        onPress={confirmDelete}
        loading={remove.isPending}
        style={{ marginTop: 24, borderColor: colors.redBg }}
      />

      <Sheet open={statusSheet} onClose={() => setStatusSheet(false)}>
        <T w="s" size={17}>
          Invoice status
        </T>
        <Muted size={13} style={{ marginTop: 4, lineHeight: 19 }}>
          Payments update the status on their own; set it by hand only to correct it.
        </Muted>
        {STATUSES.map((s) => (
          <SheetOption key={s} title={INVOICE_STATUS[s].label} selected={s === inv.status} onPress={() => confirmStatus(s)} />
        ))}
      </Sheet>

      <Sheet open={linkSheet} onClose={() => setLinkSheet(false)}>
        <PayLinkSheet inv={inv} onDone={() => setLinkSheet(false)} />
      </Sheet>
    </Screen>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.soft2, borderRadius: 12, padding: 10 }}>
      <Eyebrow style={{ fontSize: 10, letterSpacing: 1.2 }}>{label}</Eyebrow>
      <T w="b" size={15} color={color} style={{ marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
    </View>
  );
}

function LineRow({ item, currency, first }: { item: AdminInvoiceItem; currency: string; first: boolean }) {
  const snapshot = item.products ?? [];
  return (
    <View style={{ padding: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          {snapshot.length ? (
            snapshot.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <T w="s" size={14} style={{ flex: 1 }}>
                  {p.name}
                </T>
                <Muted size={13}>{money(Number(p.amount), currency)}</Muted>
              </View>
            ))
          ) : (
            <T w="s" size={14}>
              {item.description}
            </T>
          )}
        </View>
      </View>
      <Muted size={12} style={{ marginTop: 4 }}>
        {[
          item.sku ? `Licence ${item.sku}` : null,
          `${item.quantity} × ${money(Number(item.unitPrice), currency)}`,
          `GST ${Number(item.taxRate)}% ${item.gstType === 'INCLUSIVE' ? 'incl.' : 'excl.'}`,
          item.contractType === 'TRIAL' ? 'Trial' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Muted>
      <T w="s" size={14} style={{ marginTop: 6, textAlign: 'right' }}>
        {money(Number(item.lineTotal), currency)}
      </T>
    </View>
  );
}

function PayLinkSheet({ inv, onDone }: { inv: AdminInvoice; onDone: () => void }) {
  const url = inv.paymentUrl ?? '';
  return (
    <View>
      <T w="s" size={17}>
        Payment link
      </T>
      <Muted size={13} style={{ marginTop: 4, lineHeight: 19 }}>
        The customer's secure pay page for {inv.invoiceNumber}. It shows the invoice and takes payment.
      </Muted>
      <View style={{ backgroundColor: colors.soft, borderRadius: 12, padding: 12, marginTop: 12 }}>
        <T mono size={12} selectable>
          {url}
        </T>
      </View>
      <SheetOption
        title="Open pay page"
        chevron
        onPress={() => {
          onDone();
          void Linking.openURL(url);
        }}
      />
      <SheetOption
        title="Share link"
        chevron
        onPress={() => {
          onDone();
          void Share.share({ message: `Invoice ${inv.invoiceNumber}: ${url}`, url });
        }}
      />
      <SheetOption
        title="Copy link"
        onPress={async () => {
          await Clipboard.setStringAsync(url);
          onDone();
          Alert.alert('Link copied');
        }}
      />
    </View>
  );
}
