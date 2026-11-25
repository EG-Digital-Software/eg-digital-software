import React from 'react';
import { View, Linking } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { ADDRESS_LABEL, addressLine, formatAbn, formatAcn, prettyEnum, useProfile } from '../lib/portal';
import { initials } from '../lib/format';
import { Avatar, Btn, Card, ErrorBox, KV, Loading, Muted, Pill, Screen, SectionHead, T } from '../ui';
import { colors } from '../theme';
import { roleOf } from './ClientMenu';

const ACCOUNT_PILL: Record<string, { kind: 'ok' | 'warn' | 'ns' | 'red'; label: string }> = {
  ACTIVE: { kind: 'ok', label: 'Active' },
  ACTIVE_TRIAL: { kind: 'warn', label: 'Trial' },
  DORMANT: { kind: 'ns', label: 'Dormant' },
  SUSPENDED: { kind: 'red', label: 'Suspended' },
};

export default function CompanyScreen() {
  const { user } = useAuth();
  const profile = useProfile();
  const p = profile.data;
  const manager = p?.accountManager;

  const mailManager = (subject: string, body = '') => {
    const to = manager?.email || 'support@elomagroup.org';
    void Linking.openURL(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  if (!p) {
    return (
      <Screen title="Company" back>
        {profile.isError ? <ErrorBox message={errorMessage(profile.error)} onRetry={() => void profile.refetch()} /> : <Loading />}
      </Screen>
    );
  }

  const company = p.companyName || p.contactPerson || 'Your company';
  const principal = p.addresses?.find((a) => a.type === 'PRINCIPAL');
  const place = principal ? [principal.suburb || principal.city, principal.state].filter(Boolean).join(', ') : '';
  const status = ACCOUNT_PILL[p.accountStatusEffective || p.accountStatus || 'ACTIVE'] ?? ACCOUNT_PILL.ACTIVE!;
  const ids = p.companyIdentifiers ?? {};
  const directors = (p.directors ?? []).filter((d) => d.email?.toLowerCase() !== (p.contactEmail ?? '').toLowerCase());
  const dirName = (d: (typeof directors)[number]) => [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email || 'Director';

  return (
    <Screen title="Company" back refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()}>
      <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar label={initials(company)} size={52} radius={14} fill={colors.navy} color="#fff" />
        <View style={{ flex: 1 }}>
          <T w="s" size={15}>
            {company}
          </T>
          <Muted size={13}>{[p.tradingAs, place].filter(Boolean).join(' · ') || p.clientId}</Muted>
        </View>
        <Pill kind={status.kind} label={status.label} />
      </Card>

      <SectionHead title="Registration" />
      <KV
        rows={[
          ['Customer ID', p.clientId, { mono: true }],
          ['ABN', formatAbn(p.abn || ids.abn)],
          ['ACN', formatAcn(p.acn || ids.acn)],
          ['Company number', ids.companyNumber],
          ['VAT', ids.vat],
          ['Business type', prettyEnum(p.businessType)],
        ]}
      />

      <SectionHead title="Primary contact" />
      <KV
        rows={[
          ['Name', p.contactPerson],
          ['Position', p.contactPosition],
          ['Email', p.contactEmail],
          ['Mobile', p.contactMobile],
        ]}
      />

      {p.addresses?.length ? (
        <>
          <SectionHead title="Addresses" />
          <KV rows={p.addresses.map((a) => [ADDRESS_LABEL[a.type] ?? prettyEnum(a.type), addressLine(a)] as [string, string])} />
        </>
      ) : null}

      <SectionHead
        title="Team and access"
        action="Invite"
        onAction={() =>
          mailManager(
            `Portal access for ${company}`,
            `Hi${manager ? ` ${manager.firstName}` : ''},\n\nPlease give the following people access to our EG Eloma portal:\n\n${
              directors.map((d) => `- ${dirName(d)}${d.email ? ` <${d.email}>` : ''}`).join('\n') || '- Name <email>'
            }\n\nThanks`
          )
        }
      />
      <Card>
        <Person name={p.contactPerson || `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()} role={`${roleOf(p.contactPosition)} · You`} pill={<Pill kind="ok" label="Active" />} first />
        {directors.map((d) => (
          <Person key={d.id} name={dirName(d)} role="Director" pill={<Pill kind="ns" label="Not invited" />} />
        ))}
      </Card>

      <Btn
        title="Request a change"
        variant="ghost"
        onPress={() => mailManager('Account details change', `Hi${manager ? ` ${manager.firstName}` : ''},\n\nPlease update our account details (${p.clientId}):\n\n`)}
        style={{ marginTop: 16 }}
      />
    </Screen>
  );
}

function Person({ name, role, pill, first }: { name: string; role: string; pill: React.ReactNode; first?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <Avatar name={name} />
      <View style={{ flex: 1 }}>
        <T w="s" size={14}>
          {name}
        </T>
        <Muted size={12.5}>{role}</Muted>
      </View>
      {pill}
    </View>
  );
}
