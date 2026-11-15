import React, { useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../api/client';
import type { InvoiceFilter } from '../api/portal';
import type { Invoice } from '../api/types';
import { addressLine, fmtDate, money, prettyEnum, useDashboard, useInvoices, useProfile } from '../lib/portal';
import { Btn, Card, Chips, EmptyCard, ErrorBox, KV, Loading, Muted, Pill, Screen, SectionHead, Sheet, Steps, T, type PillKind } from '../ui';
import { colors } from '../theme';

const STATUS: Record<string, { kind: PillKind; label: string }> = {
  DRAFT: { kind: 'ns', label: 'Draft' },
  SENT: { kind: 'info', label: 'Sent' },
  PENDING: { kind: 'warn', label: 'Due' },
  PARTIALLY_PAID: { kind: 'warn', label: 'Part paid' },
  PAID: { kind: 'ok', label: 'Paid' },
  OVERDUE: { kind: 'red', label: 'Overdue' },
  CANCELLED: { kind: 'ns', label: 'Cancelled' },
};

/** "NET_7" → "7 Days", "DUE_ON_RECEIPT" → "Due On Receipt". */
const termLabel = (t?: string | null) => {
  if (!t) return null;
  const m = /(\d+)/.exec(t);
  return m && /NET|DAY/i.test(t) ? `${m[1]} Days` : prettyEnum(t);
};

export default function InvoicesScreen() {
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  const [open, setOpen] = useState<Invoice | null>(null);
  const invoices = useInvoices(filter);
  const dash = useDashboard().data;
  const p = useProfile().data;

  const list = invoices.data ?? [];
  const billing = p?.addresses?.find((a) => a.type === 'BILLING') ?? p?.addresses?.find((a) => a.type === 'PRINCIPAL');
  const terms = termLabel(p?.invoicingTerm) ?? termLabel(list[0]?.term);
  const due = terms ? `Due in ${terms.toLowerCase()}` : 'Due by the due date';

  return (
    <Screen title="Invoices" back refreshing={invoices.isRefetching} onRefresh={() => void invoices.refetch()}>
      <Chips<InvoiceFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `All · ${dash?.invoices ?? 0}` },
          { value: 'outstanding', label: `Outstanding · ${dash?.outstanding.count ?? 0}` },
          { value: 'paid', label: 'Paid' },
          { value: 'overdue', label: `Overdue · ${dash?.overdue.count ?? 0}` },
        ]}
      />

      {invoices.isLoading ? (
        <Loading />
      ) : invoices.isError ? (
        <ErrorBox message={errorMessage(invoices.error)} onRetry={() => void invoices.refetch()} />
      ) : list.length === 0 ? (
        <EmptyCard
          style={{ marginTop: 16 }}
          icon="document-text-outline"
          title={filter === 'all' ? 'No invoices yet' : 'No invoices here'}
          body={filter === 'all' ? 'Your first invoice will appear here. You’ll be able to view it and pay online.' : 'Nothing matches this filter.'}
        />
      ) : (
        <Card style={{ marginTop: 16 }}>
          {list.map((inv, i) => {
            const st = STATUS[inv.status] ?? STATUS.SENT!;
            return (
              <Pressable
                key={inv.id}
                onPress={() => setOpen(inv)}
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line },
                  pressed && { backgroundColor: colors.soft2 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <T mono size={12.5}>
                    {inv.invoiceNumber}
                  </T>
                  <Muted size={12.5} style={{ marginTop: 2 }}>
                    {fmtDate(inv.invoiceDate)} · due {fmtDate(inv.dueDate)}
                  </Muted>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <T w="s" size={14}>
                    {money(Number(inv.total), inv.currency)}
                  </T>
                  <Pill kind={st.kind} label={st.label} style={{ height: 24 }} />
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}

      <KV
        style={{ marginTop: 16 }}
        rows={[
          ['Payment terms', terms],
          ['Currency', 'AUD · GST'],
          ['Sent to', p?.billingEmail || p?.contactEmail],
          ['Billing address', billing ? addressLine(billing) : null],
        ]}
      />

      <SectionHead title="How billing will work" />
      <Card style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
        <Steps
          style={{ marginTop: 0 }}
          steps={[
            { label: 'Plan active', state: 'done' },
            { label: 'Invoice issued', state: 'wait' },
            { label: 'Emailed', state: 'todo' },
            { label: due, state: 'todo' },
          ]}
        />
      </Card>

      <Sheet open={!!open} onClose={() => setOpen(null)}>
        {open ? <InvoiceSheet inv={open} /> : null}
      </Sheet>
    </Screen>
  );
}

function InvoiceSheet({ inv }: { inv: Invoice }) {
  const st = STATUS[inv.status] ?? STATUS.SENT!;
  const total = Number(inv.total);
  const paid = Number(inv.amountPaid) || 0;
  const balance = Math.max(0, total - paid);
  const isPaid = inv.status === 'PAID' || balance <= 0;
  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T mono size={13} color={colors.muted}>
          {inv.invoiceNumber}
        </T>
        <Pill kind={st.kind} label={st.label} />
      </View>
      <T w="s" size={26} style={{ marginTop: 8 }}>
        {money(total, inv.currency)}
      </T>
      <KV
        style={{ marginTop: 14 }}
        rows={[
          ['Issued', fmtDate(inv.invoiceDate)],
          ['Due', fmtDate(inv.dueDate)],
          ['Subtotal', money(Number(inv.subtotal), inv.currency)],
          ['GST', money(Number(inv.tax), inv.currency)],
          ...(Number(inv.discount) > 0 ? ([['Discount', `-${money(Number(inv.discount), inv.currency)}`]] as [string, string][]) : []),
          ['Paid', money(paid, inv.currency)],
          ['Balance', money(balance, inv.currency)],
        ]}
      />
      {!isPaid && inv.paymentUrl ? (
        <Btn title="Pay now" icon="card-outline" onPress={() => Linking.openURL(inv.paymentUrl!)} style={{ marginTop: 14 }} />
      ) : null}
      {isPaid ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 14 }}>
          <Ionicons name="checkmark-circle" size={18} color={colors.green} />
          <T w="s" size={14} color={colors.green}>
            Paid in full — thank you
          </T>
        </View>
      ) : null}
    </>
  );
}
