import React from 'react';
import { View, Linking, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import { adminCustomersApi, businessTypesLabel, type AdminCustomer } from '../../api/admin/customers';
import { countryLabel, fmtDate, formatAbn, formatAcn, money } from '../../lib/portal';
import { Btn, Card, EmptyCard, ErrorBox, Loading, Muted, Pill, T, type PillKind } from '../../ui';
import { colors } from '../../theme';
import { ACCOUNT_STATUS, CardTitle, Detail, addressText, identifierLabel, num, statusOf } from './common';

const phone = (n?: string | null) => n || null;

// ─── Overview ─────────────────────────────────────────────

/** Mirrors the add/edit form section by section (web Overview tab). */
export function OverviewSection({ c }: { c: AdminCustomer }) {
  const principal = c.addresses?.find((a) => a.type === 'PRINCIPAL');
  const billing = c.addresses?.find((a) => a.type === 'BILLING');
  const ids = c.companyIdentifiers ?? (c.abn || c.acn ? { abn: c.abn ?? '', acn: c.acn ?? '' } : {});
  const st = statusOf(c);

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ padding: 16 }}>
        <CardTitle icon="business-outline" title="Company information" />
        <Detail label="Registration country" value={c.registrationCountry ? countryLabel(c.registrationCountry).split(' · ')[0] : null} />
        {Object.entries(ids)
          .filter(([, v]) => !!v)
          .map(([k, v]) => (
            <Detail
              key={k}
              label={identifierLabel(k)}
              value={k === 'abn' ? formatAbn(v) : k === 'acn' ? formatAcn(v) : v}
              mono
            />
          ))}
        <Detail label="Business name" value={c.companyName} always />
        <Detail
          label={(c.tradingNames?.length ?? 0) > 1 ? `Trading as (${c.tradingNames!.length})` : 'Trading as'}
          value={c.tradingNames?.length ? c.tradingNames.join('\n') : c.tradingAs}
        />
        <Detail label="Business type" value={businessTypesLabel(c.businessType)} />
        <Detail label="Customer ID" value={c.clientId} mono always />
        <Detail label="Principal address" value={addressText(principal)} always />
        <Detail label="Billing address" value={addressText(billing)} always />
      </Card>

      <Card style={{ padding: 16 }}>
        <CardTitle icon="person-outline" title="Contact information" />
        <ContactLine label="Contact name" value={c.contactPerson} />
        <ContactLine label="Contact position" value={c.contactPosition} />
        <ContactLine label="Contact email" value={c.contactEmail} kind="mail" />
        <ContactLine label="Contact mobile" value={phone(c.contactMobile)} kind="tel" />
        <ContactLine label="Authorised" value={c.authorized ? 'Yes' : 'No'} />
        {!c.authorized ? (
          <>
            <ContactLine label="Authorised person" value={c.authorizedPerson} />
            <ContactLine label="Authorised email" value={c.authorizedEmail} kind="mail" />
            <ContactLine label="Authorised mobile" value={phone(c.authorizedMobile)} kind="tel" />
          </>
        ) : null}
      </Card>

      {c.directors?.length ? (
        <Card style={{ padding: 16 }}>
          <CardTitle icon="people-outline" title="Company C-suite details" />
          {c.directors.map((d, i) => (
            <View key={d.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
              <T w="s" size={14}>
                {[d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ') || `Director ${i + 1}`}
              </T>
              {d.email ? <LinkText value={d.email} kind="mail" /> : null}
              {d.contactNumber ? <LinkText value={d.contactNumber} kind="tel" /> : null}
            </View>
          ))}
        </Card>
      ) : null}

      {c.itContacts?.length ? (
        <Card style={{ padding: 16 }}>
          <CardTitle icon="server-outline" title="IT details" />
          {c.itContacts.map((it, i) => (
            <View key={it.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
              <T w="s" size={14}>
                {it.name || `IT contact ${i + 1}`}
              </T>
              {it.email ? <LinkText value={it.email} kind="mail" /> : null}
              {it.phone ? <LinkText value={it.phone} kind="tel" /> : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={{ padding: 16 }}>
        <CardTitle icon="receipt-outline" title="Invoicing details" />
        <ContactLine label="Accounts person name" value={c.billingContactPerson} />
        <ContactLine label="Accounts person mobile" value={phone(c.billingContactNumber)} kind="tel" />
        <ContactLine label="Accounts person email" value={c.billingEmail} kind="mail" />
        <Detail label="Credit score" value={c.creditScore != null ? String(c.creditScore) : null} always />
        <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Muted size={12.5}>Account status</Muted>
          <Pill kind={st.kind} label={st.label} style={{ marginTop: 6 }} />
        </View>
      </Card>
    </View>
  );
}

function LinkText({ value, kind }: { value: string; kind: 'mail' | 'tel' }) {
  return (
    <Pressable onPress={() => void Linking.openURL(kind === 'mail' ? `mailto:${value}` : `tel:${value.replace(/\s/g, '')}`)}>
      <T size={13.5} color={colors.green} style={{ marginTop: 2 }}>
        {value}
      </T>
    </Pressable>
  );
}

function ContactLine({ label, value, kind }: { label: string; value?: string | null; kind?: 'mail' | 'tel' }) {
  return (
    <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
      <Muted size={12.5}>{label}</Muted>
      {value && kind ? (
        <LinkText value={value} kind={kind} />
      ) : (
        <T w="s" size={14} style={{ marginTop: 3 }} selectable>
          {value || '—'}
        </T>
      )}
    </View>
  );
}

// ─── Invoices ─────────────────────────────────────────────

const INVOICE_STATUS: Record<string, { kind: PillKind; label: string }> = {
  DRAFT: { kind: 'ns', label: 'Draft' },
  SENT: { kind: 'info', label: 'Sent' },
  PENDING: { kind: 'warn', label: 'Due' },
  PARTIALLY_PAID: { kind: 'warn', label: 'Part paid' },
  PAID: { kind: 'ok', label: 'Paid' },
  OVERDUE: { kind: 'red', label: 'Overdue' },
  CANCELLED: { kind: 'ns', label: 'Cancelled' },
};

export function InvoicesSection({ c }: { c: AdminCustomer }) {
  const nav = useNavigation<any>();
  const invoices = c.invoices ?? [];
  return (
    <View style={{ gap: 10 }}>
      <Btn title="Create invoice" icon="add" onPress={() => nav.navigate('InvoiceForm', { clientId: c.clientId })} />
      {!invoices.length ? (
        <EmptyCard icon="receipt-outline" title="No invoices yet" body="Create an invoice for this customer." />
      ) : (
        invoices.map((inv) => {
          const st = INVOICE_STATUS[inv.status] ?? { kind: 'ns' as PillKind, label: inv.status };
          const balance = num(inv.total) - num(inv.amountPaid);
          return (
            <Card key={inv.id} style={{ padding: 14 }} onPress={() => nav.navigate('InvoiceDetail', { id: inv.id })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T mono size={13} w="s">
                    {inv.invoiceNumber ?? '—'}
                  </T>
                  <Muted size={12.5} style={{ marginTop: 2 }}>
                    {fmtDate(inv.invoiceDate)} · due {fmtDate(inv.dueDate)}
                  </Muted>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <T w="b" size={15}>
                    {money(num(inv.total), inv.currency ?? 'AUD')}
                  </T>
                  <Pill kind={st.kind} label={st.label} />
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.faint} />
              </View>
              {balance > 0 && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT' && num(inv.amountPaid) > 0 ? (
                <Muted size={12} style={{ marginTop: 6 }}>
                  Balance {money(balance, inv.currency ?? 'AUD')}
                </Muted>
              ) : null}
            </Card>
          );
        })
      )}
    </View>
  );
}

// ─── Account history ──────────────────────────────────────

export function HistorySection({ clientId }: { clientId: string }) {
  const q = useQuery({ queryKey: ['admin-customer', clientId, 'history'], queryFn: () => adminCustomersApi.history(clientId) });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorBox message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const { summary, events } = q.data;
  const status = ACCOUNT_STATUS[summary.status] ?? ACCOUNT_STATUS.ACTIVE;
  const label = summary.status === 'ACTIVE_TRIAL' ? 'Trial' : status.label;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card style={{ flex: 1, padding: 12 }}>
          <Muted size={11.5}>Current status</Muted>
          <Pill kind={status.kind} label={label} style={{ marginTop: 6 }} />
        </Card>
        <Card style={{ flex: 1, padding: 12 }}>
          <Muted size={11.5}>Days left on renewal</Muted>
          <T w="s" size={16} color={summary.daysLeft != null && summary.daysLeft <= 7 ? colors.redFg : colors.fg} style={{ marginTop: 6 }}>
            {summary.daysLeft != null ? `${summary.daysLeft} days` : '—'}
          </T>
        </Card>
      </View>
      <Card style={{ padding: 12 }}>
        {summary.trialSince ? (
          <>
            <Muted size={11.5}>On trial since</Muted>
            <T w="s" size={15} style={{ marginTop: 4 }}>
              {fmtDate(summary.trialSince)} <Muted size={13}>({summary.trialDays} days so far)</Muted>
            </T>
          </>
        ) : (
          <>
            <Muted size={11.5}>Active until</Muted>
            <T w="s" size={15} style={{ marginTop: 4 }}>
              {summary.activeUntil ? fmtDate(summary.activeUntil) : 'Not renewed yet'}
            </T>
          </>
        )}
      </Card>

      <Card style={{ padding: 16 }}>
        <CardTitle icon="time-outline" title="Account history" />
        {!events.length ? (
          <Muted size={13.5} style={{ marginTop: 6 }}>
            Nothing here yet. Trials and renewals will appear here.
          </Muted>
        ) : (
          <View style={{ marginTop: 8 }}>
            {events.map((e, i) => (
              <View key={e.id} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center', width: 24 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="refresh" size={13} color={colors.green} />
                  </View>
                  {i < events.length - 1 ? <View style={{ flex: 1, width: 1.5, backgroundColor: colors.line, marginVertical: 2 }} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 16 }}>
                  <T w="s" size={14}>
                    {e.title}
                  </T>
                  <Muted size={12}>{fmtDate(e.at)}</Muted>
                  {e.detail ? (
                    <Muted size={12.5} style={{ marginTop: 2 }}>
                      {e.detail}
                    </Muted>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}
