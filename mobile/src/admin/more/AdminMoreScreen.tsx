import React from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { displayName, useAuth } from '../../context/AuthContext';
import { Avatar, Btn, Card, Eyebrow, Muted, Screen, T, type IconName } from '../../ui';
import { colors } from '../../theme';
import { APP_VERSION } from '../../screens/MoreScreen';

type Row = { icon: IconName; title: string; sub: string; go: () => void };

/** Admin "More": the screens that don't get a tab of their own. */
export default function AdminMoreScreen() {
  const nav = useNavigation<any>();
  const { user, signOut } = useAuth();
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'Manage',
      rows: [
        { icon: 'people-outline', title: 'Team', sub: 'Members, roles and access', go: () => nav.navigate('Team') },
        { icon: 'cube-outline', title: 'Products', sub: 'Catalogue, pricing and bulk upload', go: () => nav.navigate('ProductsHome') },
        { icon: 'lock-closed-outline', title: 'Vault', sub: 'Saved passwords and logins', go: () => nav.navigate('Vault') },
        { icon: 'chatbubble-ellipses-outline', title: 'Feedback', sub: 'Client reviews and testimonials', go: () => nav.navigate('Feedback') },
        { icon: 'card-outline', title: 'Payments', sub: 'Transactions and payment status', go: () => nav.navigate('Payments') },
        { icon: 'checkmark-done-outline', title: 'Approvals', sub: 'Registrations and time sheet requests', go: () => nav.navigate('Approvals') },
        { icon: 'eye-outline', title: 'Preview', sub: 'Open a customer’s app exactly as they see it', go: () => nav.navigate('CustomerPicker') },
      ],
    },
    {
      title: 'Insights',
      rows: [
        { icon: 'bar-chart-outline', title: 'Report', sub: 'Revenue, customers and payments', go: () => nav.navigate('Report') },
        { icon: 'trending-up-outline', title: 'Marketing', sub: 'EG Eloma marketing report', go: () => nav.navigate('CompanyReport', { view: 'mkt' }) },
        { icon: 'cloud-outline', title: 'Cloud', sub: 'Azure performance', go: () => nav.navigate('CompanyReport', { view: 'azure' }) },
      ],
    },
    {
      title: 'You',
      rows: [
        { icon: 'notifications-outline', title: 'Notifications', sub: 'Everything that needs your attention', go: () => nav.navigate('Notifications') },
        { icon: 'person-circle-outline', title: 'My Account', sub: 'Profile, password and access PIN', go: () => nav.navigate('AccountSettings') },
        { icon: 'settings-outline', title: 'Settings', sub: 'Organisation details and access PINs', go: () => nav.navigate('Settings') },
        { icon: 'phone-portrait-outline', title: 'This phone', sub: 'Phone notifications and fingerprint sign-in', go: () => nav.navigate('Profile') },
      ],
    },
  ];

  return (
    <Screen title="More">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
        <Avatar name={displayName(user)} size={48} fill={colors.navy} color="#fff" />
        <View style={{ flex: 1 }}>
          <T w="b" size={16}>
            {displayName(user)}
          </T>
          <Muted size={13}>Admin · {user?.email}</Muted>
        </View>
      </Card>

      {groups.map((g) => (
        <View key={g.title}>
          <Eyebrow style={{ marginTop: 20, marginBottom: 10, marginLeft: 2 }}>{g.title}</Eyebrow>
          <Card>
            {g.rows.map((r, i) => (
              <Pressable
                key={r.title}
                onPress={r.go}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}
              >
                <Ionicons name={r.icon} size={21} color={colors.navy} />
                <View style={{ flex: 1 }}>
                  <T w="s" size={14.5}>
                    {r.title}
                  </T>
                  <Muted size={12.5}>{r.sub}</Muted>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </Card>
        </View>
      ))}

      <Btn title="Sign out" variant="ghost" onPress={() => void signOut()} style={{ marginTop: 20 }} />
      <Muted size={12} style={{ textAlign: 'center', marginTop: 14 }}>
        EG Eloma app v{APP_VERSION} · Admin
      </Muted>
    </Screen>
  );
}
