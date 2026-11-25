import React, { useEffect, useState } from 'react';
import { View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { displayName, useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { countryLabel, useProfile } from '../lib/portal';
import { pushEnabled, setPushEnabled } from '../lib/push';
import { useAppLock } from '../lib/appLock';
import { Avatar, Btn, Card, Eyebrow, KV, Muted, Screen, T, Toggle } from '../ui';
import { colors } from '../theme';
import { APP_VERSION, roleOf } from './ClientMenu';

type Prefs = { push: boolean; email: boolean };
const PREFS_KEY = (id: string) => `eg:prefs:${id}`;

export default function ProfileScreen() {
  const { user, admin, signOut, bio, setBioEnabled } = useAuth();
  const p = useProfile().data;
  const [prefs, setPrefs] = useState<Prefs>({ push: true, email: true });
  const name = p?.contactPerson || displayName(user);
  const email = user?.email || p?.contactEmail || '';
  const role = roleOf(p?.contactPosition);
  const manager = p?.accountManager;

  // Saved on this phone only.
  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(PREFS_KEY(user.id))
      .then((raw) => raw && setPrefs({ ...{ push: true, email: true }, ...(JSON.parse(raw) as Partial<Prefs>) }))
      .catch(() => undefined);
  }, [user?.id]);

  const setPref = (k: keyof Prefs, v: boolean) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    if (user) AsyncStorage.setItem(PREFS_KEY(user.id), JSON.stringify(next)).catch(() => undefined);
  };

  const flipBio = async (on: boolean) => {
    if (on && !bio.available) {
      Alert.alert(`${bio.label} not set up`, `Set up ${bio.label} in your phone’s settings first.`);
      return;
    }
    try {
      await setBioEnabled(on);
    } catch (e) {
      Alert.alert(`${bio.label} sign-in`, errorMessage(e));
    }
  };

  const lock = useAppLock();
  const flipLock = async (on: boolean) => {
    try {
      await lock.setEnabled(on);
    } catch (e) {
      Alert.alert('App lock', errorMessage(e));
    }
  };

  // Push is per phone: switching it off removes this phone from the API.
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

  const settings: { t: string; d: string; on: boolean; flip: (v: boolean) => void; disabled?: boolean }[] = [
    { t: 'Push notifications', d: 'New messages, signatures and invoices', on: pushOn, flip: (v) => void flipPush(v) },
    { t: 'Email updates', d: `A weekly summary to ${email || 'your email'}`, on: prefs.email, flip: (v) => setPref('email', v) },
    { t: `${bio.label} sign-in`, d: 'Skip the password on this phone', on: bio.enabled, flip: (v) => void flipBio(v), disabled: !!admin },
    { t: 'App lock', d: `Ask for ${bio.label} every time the app opens`, on: lock.enabled, flip: (v) => void flipLock(v), disabled: !!admin },
  ];

  return (
    <Screen title="Profile" back>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Avatar name={name} size={84} fill={colors.navy} color="#fff" />
        <T w="b" size={21} style={{ marginTop: 12, textAlign: 'center' }}>
          {name}
        </T>
        <Muted size={13.5} style={{ marginTop: 2, textAlign: 'center' }}>
          {role}
          {p?.companyName ? ` · ${p.companyName}` : ''}
        </Muted>
      </View>

      <Eyebrow style={{ marginTop: 24, marginBottom: 10, marginLeft: 2 }}>Account</Eyebrow>
      <KV
        rows={[
          ['Email', email],
          ['Role', role],
          ['Account manager', manager ? `${manager.firstName} ${manager.lastName}`.trim() : null],
          ['Country', countryLabel(p?.registrationCountry)],
        ]}
      />

      <Eyebrow style={{ marginTop: 20, marginBottom: 10, marginLeft: 2 }}>Settings</Eyebrow>
      <Card>
        {settings.map((x, i) => (
          <View key={x.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
            <View style={{ flex: 1 }}>
              <T w="s" size={14}>
                {x.t}
              </T>
              <Muted size={12.5}>{x.d}</Muted>
            </View>
            <Toggle value={x.on} onChange={x.flip} disabled={x.disabled} />
          </View>
        ))}
      </Card>

      <Card style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.muted} style={{ marginTop: 2 }} />
        <Muted size={13.5} style={{ flex: 1, lineHeight: 20 }}>
          Passwords and company details are managed on the web portal.
        </Muted>
      </Card>

      <Btn title="Sign out" variant="ghost" onPress={() => void signOut()} style={{ marginTop: 16 }} />
      <Muted size={12} style={{ textAlign: 'center', marginTop: 14 }}>
        EG Eloma app v{APP_VERSION} · Eloma Group
      </Muted>
    </Screen>
  );
}
