import React, { useEffect, useState } from 'react';
import { View, Alert } from 'react-native';
import { displayName, useAuth } from '../../context/AuthContext';
import { pushEnabled, setPushEnabled } from '../../lib/push';
import { Avatar, Btn, Card, Eyebrow, KV, Muted, Screen, T, Toggle } from '../../ui';
import { colors } from '../../theme';

export default function AdminProfileScreen() {
  const { user, signOut } = useAuth();
  const [pushOn, setPushOn] = useState(true);
  useEffect(() => {
    void pushEnabled().then(setPushOn);
  }, []);
  const flipPush = async (on: boolean) => {
    setPushOn(on);
    const ok = await setPushEnabled(on);
    if (on && !ok) {
      Alert.alert(
        'Notifications not turned on',
        'Allow notifications for EG Eloma in your phone’s settings. (They also need the installed EG Eloma app — not Expo Go.)'
      );
    }
  };
  const name = displayName(user);
  return (
    <Screen title="Profile" back>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Avatar name={name} size={84} fill={colors.navy} color="#fff" />
        <T w="b" size={21} style={{ marginTop: 12 }}>
          {name}
        </T>
        <Muted size={13.5}>Admin</Muted>
      </View>
      <Eyebrow style={{ marginTop: 24, marginBottom: 10, marginLeft: 2 }}>Account</Eyebrow>
      <KV rows={[['Email', user?.email ?? ''], ['Role', 'Super admin']]} />
      <Eyebrow style={{ marginTop: 20, marginBottom: 10, marginLeft: 2 }}>Settings</Eyebrow>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 }}>
        <View style={{ flex: 1 }}>
          <T w="s" size={14}>
            Push notifications
          </T>
          <Muted size={12.5}>Messages, approvals and updates on this phone</Muted>
        </View>
        <Toggle value={pushOn} onChange={(v) => void flipPush(v)} />
      </Card>
      <Btn title="Sign out" variant="ghost" onPress={() => void signOut()} style={{ marginTop: 20 }} />
    </Screen>
  );
}
