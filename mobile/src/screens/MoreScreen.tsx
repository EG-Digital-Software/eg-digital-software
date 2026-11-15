import React from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { displayName, useAuth } from '../context/AuthContext';
import { SUPPORT_PHONE, countryLabel, useProfile } from '../lib/portal';
import { initials } from '../lib/format';
import { Avatar, Btn, Card, KV, Muted, Screen, T } from '../ui';
import { colors } from '../theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const APP_VERSION: string = require('../../app.json').expo.version;

export function roleOf(position?: string | null) {
  return position?.trim() || 'Owner';
}

export default function MoreScreen() {
  const nav = useNavigation<any>();
  const { user, admin, signOut, exitCustomer } = useAuth();
  const profile = useProfile();
  const p = profile.data;
  const company = p?.companyName || p?.contactPerson || 'Your company';

  const rows: { ic: string; t: string; d: string; go: () => void }[] = [
    { ic: 'P', t: 'Products', d: 'Your plan and licences', go: () => nav.navigate('Products') },
    { ic: '$', t: 'Invoices', d: 'Billing and payments', go: () => nav.navigate('Invoices') },
    { ic: 'C', t: 'Company', d: 'Account details and team', go: () => nav.navigate('Company') },
    { ic: 'Me', t: 'Profile and settings', d: 'Notifications and sign-in', go: () => nav.navigate('Profile') },
  ];

  return (
    <Screen title="More" refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()}>
      <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar label={initials(company)} size={52} radius={14} fill={colors.navy} color="#fff" />
        <View style={{ flex: 1 }}>
          <T w="s" size={15}>
            {company}
          </T>
          <Muted size={13}>
            {p?.contactPerson || displayName(user)} · {roleOf(p?.contactPosition)}
          </Muted>
        </View>
      </Card>

      <Card style={{ marginTop: 16 }}>
        {rows.map((r, i) => (
          <Pressable
            key={r.t}
            onPress={r.go}
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line },
              pressed && { backgroundColor: colors.soft2 },
            ]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
              <T w="b" size={15} color={colors.green}>
                {r.ic}
              </T>
            </View>
            <View style={{ flex: 1 }}>
              <T w="s" size={15}>
                {r.t}
              </T>
              <Muted size={13}>{r.d}</Muted>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        ))}
      </Card>

      <KV style={{ marginTop: 16 }} rows={[['Country', countryLabel(p?.registrationCountry)], ['Support', SUPPORT_PHONE]]} />

      {admin ? <Btn title="Switch customer" variant="ghost" icon="swap-horizontal" onPress={exitCustomer} style={{ marginTop: 16 }} /> : null}
      <Btn title="Sign out" variant="ghost" onPress={() => void signOut()} style={{ marginTop: 16 }} />
      <Muted size={12} style={{ textAlign: 'center', marginTop: 14 }}>
        EG Eloma Client Portal · Eloma Group · v{APP_VERSION}
      </Muted>
    </Screen>
  );
}
