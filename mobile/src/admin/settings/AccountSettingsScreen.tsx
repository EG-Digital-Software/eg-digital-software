import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { errorMessage, getSession, setSession } from '../../api/client';
import { fileUrl } from '../../api/tasks';
import { accountApi, type AccountUser } from '../../api/admin/settings';
import { displayName, useAuth } from '../../context/AuthContext';
import { Avatar, Btn, Card, Chips, Eyebrow, KV, Muted, Pill, Screen, T } from '../../ui';
import { colors } from '../../theme';
import { formatDate } from '../../lib/format';
import { Field, Input } from '../customers/form/fields';
import { toTitleCase } from '../customers/form/model';

export type AccountTab = 'profile' | 'password' | 'pin';

const TABS: { value: AccountTab; label: string }[] = [
  { value: 'profile', label: 'Profile' },
  { value: 'password', label: 'Change Password' },
  { value: 'pin', label: 'Access PIN' },
];

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'EG', CLIENT: 'Customer', EMPLOYEE: 'Team' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AVATAR = 3 * 1024 * 1024;

/** Swap the signed-in user (and optionally the access token) in the live session; AuthContext persists it. */
function adoptUser(user: AccountUser, tokens?: { accessToken: string; refreshToken?: string | null }) {
  const s = getSession();
  if (!s) return;
  setSession({
    ...s,
    user: { ...s.user, ...user },
    ...(tokens ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken ?? s.refreshToken ?? null } : {}),
  });
}

/**
 * My Account — port of the web AccountSettings: profile picture, your details,
 * change password and your own Access PIN. Route param `tab` picks the tab.
 */
export default function AccountSettingsScreen() {
  const route = useRoute<any>();
  const initialTab = (route.params?.tab as AccountTab | undefined) ?? 'profile';
  const [tab, setTab] = useState<AccountTab>(TABS.some((t) => t.value === initialTab) ? initialTab : 'profile');
  return (
    <Screen title="My Account" back>
      <Chips options={TABS} value={tab} onChange={setTab} />
      {tab === 'profile' ? <ProfileTab /> : tab === 'password' ? <PasswordTab /> : <PinTab />}
    </Screen>
  );
}

// ─── Profile ──────────────────────────────────────────────

function ProfileTab() {
  const { user: authUser } = useAuth();
  // The stored user lacks a few fields (status, member since) — fetch the live record.
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: accountApi.me });
  const user = { ...(authUser ?? {}), ...(me.data ?? {}) } as AccountUser;
  const [uploading, setUploading] = useState(false);
  const [vals, setVals] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [base, setBase] = useState(vals);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof vals, string>>>({});
  const [saving, setSaving] = useState(false);
  const isEmployee = user.role === 'EMPLOYEE';

  useEffect(() => {
    if (!authUser) return;
    const v = { firstName: authUser.firstName ?? '', lastName: authUser.lastName ?? '', email: authUser.email, phone: authUser.phone ?? '' };
    setVals(v);
    setBase(v);
  }, [authUser]);

  const dirty = JSON.stringify(vals) !== JSON.stringify(base);
  const set = (k: keyof typeof vals, v: string) => {
    setVals((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const onSave = async () => {
    const e: typeof errors = {};
    if (!vals.firstName.trim()) e.firstName = 'Required';
    if (!vals.lastName.trim()) e.lastName = 'Required';
    if (!EMAIL_RE.test(vals.email.trim())) e.email = 'Enter a valid email';
    if (vals.phone.length > 40) e.phone = 'Max 40 characters';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = {
        firstName: vals.firstName.trim(),
        lastName: vals.lastName.trim(),
        email: vals.email.trim(),
        ...(isEmployee ? { phone: vals.phone.trim() } : {}),
      };
      const updated = await accountApi.updateProfile(body);
      adoptUser(updated);
      void me.refetch();
      Alert.alert('Profile updated');
    } catch (err) {
      Alert.alert('Could not update profile', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access in Settings to choose a picture.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.mimeType && !a.mimeType.startsWith('image/')) return Alert.alert('Please choose an image file');
    if (a.fileSize && a.fileSize > MAX_AVATAR) return Alert.alert('Image must be under 3MB');
    setUploading(true);
    try {
      const updated = await accountApi.uploadAvatar({ uri: a.uri, name: a.fileName ?? `avatar-${Date.now()}.jpg`, mimeType: a.mimeType });
      adoptUser(updated);
      void me.refetch();
      Alert.alert('Profile picture updated');
    } catch (err) {
      Alert.alert('Could not upload picture', errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = () =>
    Alert.alert('Remove profile picture?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setUploading(true);
          try {
            const updated = await accountApi.removeAvatar();
            adoptUser({ ...updated, avatarUrl: updated.avatarUrl ?? null });
            void me.refetch();
            Alert.alert('Profile picture removed');
          } catch (err) {
            Alert.alert('Could not remove picture', errorMessage(err));
          } finally {
            setUploading(false);
          }
        },
      },
    ]);

  const name = displayName(user);
  const role = ROLE_LABEL[user.role ?? ''] ?? user.role ?? '';

  return (
    <>
      <Card style={{ marginTop: 14, padding: 18, alignItems: 'center' }}>
        <Pressable onPress={() => void pickAvatar()} disabled={uploading} accessibilityLabel="Change profile picture">
          {user.avatarUrl ? (
            <Image source={{ uri: fileUrl(user.avatarUrl) }} style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.soft }} />
          ) : (
            <Avatar name={name} size={84} fill={colors.navy} color="#fff" />
          )}
          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 32,
              height: 32,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: '#fff',
              backgroundColor: colors.navy,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={15} color="#fff" />}
          </View>
        </Pressable>
        <T w="b" size={19} style={{ marginTop: 12 }}>
          {name}
        </T>
        <Muted size={13.5}>{user.email}</Muted>
        {role ? <Pill kind="on" label={role} style={{ alignSelf: 'center', marginTop: 8 }} /> : null}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, alignSelf: 'stretch' }}>
          <Btn
            title={user.avatarUrl ? 'Change photo' : 'Upload photo'}
            icon="camera-outline"
            variant="ghost"
            onPress={() => void pickAvatar()}
            disabled={uploading}
            style={{ flex: 1, minHeight: 44 }}
          />
          {user.avatarUrl ? (
            <Btn title="Remove" icon="trash-outline" variant="ghost" onPress={removeAvatar} disabled={uploading} style={{ minHeight: 44 }} />
          ) : null}
        </View>
        <Muted size={12} style={{ marginTop: 8 }}>
          PNG, JPG, WEBP or GIF — up to 3MB.
        </Muted>
      </Card>

      <Eyebrow style={{ marginTop: 22, marginLeft: 2 }}>Your Details</Eyebrow>
      <Field label="First name" error={errors.firstName}>
        <Input value={vals.firstName} onChangeText={(t) => set('firstName', toTitleCase(t))} invalid={!!errors.firstName} maxLength={80} />
      </Field>
      <Field label="Last name" error={errors.lastName}>
        <Input value={vals.lastName} onChangeText={(t) => set('lastName', toTitleCase(t))} invalid={!!errors.lastName} maxLength={80} />
      </Field>
      <Field label="Email" error={errors.email} hint="This is also your sign-in address.">
        <Input
          value={vals.email}
          onChangeText={(t) => set('email', t.trim())}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          invalid={!!errors.email}
        />
      </Field>
      {isEmployee ? (
        <Field label="Phone" error={errors.phone} hint="Shown to clients when you're their account manager.">
          <Input value={vals.phone} onChangeText={(t) => set('phone', t)} keyboardType="phone-pad" placeholder="e.g. +61 400 000 000" maxLength={40} />
        </Field>
      ) : null}
      <Btn title="Save changes" icon="save-outline" onPress={() => void onSave()} loading={saving} disabled={!dirty} style={{ marginTop: 18 }} />

      <Eyebrow style={{ marginTop: 24, marginBottom: 10, marginLeft: 2 }}>Account</Eyebrow>
      <KV
        rows={[
          ['Role', role],
          ['Status', user.isActive === false ? 'Inactive' : 'Active'],
          ['Member since', user.createdAt ? formatDate(user.createdAt) : null],
        ]}
      />
    </>
  );
}

// ─── Password ─────────────────────────────────────────────

function PasswordRules({ value }: { value: string }) {
  if (!value) return null;
  const rules = [
    { label: 'At least 8 characters', ok: value.length >= 8 },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(value) },
    { label: 'Contains a number', ok: /\d/.test(value) },
  ];
  return (
    <View style={{ marginTop: 6, gap: 3 }}>
      {rules.map((r) => (
        <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={r.ok ? 'checkmark' : 'close'} size={13} color={r.ok ? colors.okFg : colors.muted} />
          <T size={12} color={r.ok ? colors.okFg : colors.muted}>
            {r.label}
          </T>
        </View>
      ))}
    </View>
  );
}

function PasswordInput({ value, onChange, invalid, kind }: { value: string; onChange: (v: string) => void; invalid?: boolean; kind: 'current' | 'new' }) {
  const [show, setShow] = useState(false);
  return (
    <View>
      <Input
        value={value}
        onChangeText={onChange}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={kind === 'current' ? 'password' : 'newPassword'}
        autoComplete={kind === 'current' ? 'current-password' : 'new-password'}
        invalid={invalid}
        style={{ paddingRight: 48 }}
      />
      <Pressable
        onPress={() => setShow((v) => !v)}
        hitSlop={8}
        accessibilityLabel={show ? 'Hide password' : 'Show password'}
        style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}
      >
        <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function PasswordTab() {
  const empty = { currentPassword: '', newPassword: '', confirm: '' };
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof empty, string>>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof empty, val: string) => {
    setV((x) => ({ ...x, [k]: val }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async () => {
    const e: typeof errors = {};
    if (!v.currentPassword) e.currentPassword = 'Required';
    if (v.newPassword.length < 8) e.newPassword = 'At least 8 characters';
    else if (v.newPassword === v.currentPassword) e.newPassword = 'Must be different from your current password';
    if (v.newPassword !== v.confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const result = await accountApi.changePassword(v.currentPassword, v.newPassword);
      // The API rotated this device's tokens — adopt the new access token so the session survives.
      adoptUser(result.user, { accessToken: result.accessToken, refreshToken: result.refreshToken });
      setV(empty);
      Alert.alert(
        'Password updated',
        result.sessionsRevoked > 0
          ? `Signed out of ${result.sessionsRevoked} other ${result.sessionsRevoked === 1 ? 'device' : 'devices'}.`
          : undefined
      );
    } catch (err) {
      Alert.alert('Could not update password', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginTop: 14, padding: 16 }}>
      <T w="s" size={16}>
        Change Password
      </T>
      <Field label="Current password" error={errors.currentPassword}>
        <PasswordInput kind="current" value={v.currentPassword} onChange={(t) => set('currentPassword', t)} invalid={!!errors.currentPassword} />
      </Field>
      <Field label="New password" error={errors.newPassword}>
        <PasswordInput kind="new" value={v.newPassword} onChange={(t) => set('newPassword', t)} invalid={!!errors.newPassword} />
        <PasswordRules value={v.newPassword} />
      </Field>
      <Field label="Confirm new password" error={errors.confirm}>
        <PasswordInput kind="new" value={v.confirm} onChange={(t) => set('confirm', t)} invalid={!!errors.confirm} />
      </Field>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.muted} style={{ marginTop: 2 }} />
        <Muted size={12.5} style={{ flex: 1, lineHeight: 18 }}>
          Changing your password signs you out on every other device. This one stays signed in.
        </Muted>
      </View>
      <Btn title="Update password" onPress={() => void submit()} loading={busy} style={{ marginTop: 16 }} />
    </Card>
  );
}

// ─── Access PIN ───────────────────────────────────────────

function PinTab() {
  const qc = useQueryClient();
  const [shown, setShown] = useState(false);
  const q = useQuery({ queryKey: ['auth', 'access-pin'], queryFn: accountApi.accessPin });
  const regenerate = useMutation({
    mutationFn: accountApi.regenerateAccessPin,
    onSuccess: (res) => {
      qc.setQueryData(['auth', 'access-pin'], res);
      setShown(true);
      Alert.alert('New PIN issued', 'Your old PIN no longer works.');
    },
    onError: (e) => Alert.alert('Could not issue a PIN', errorMessage(e)),
  });
  const pin = q.data?.pin;

  const copy = async () => {
    if (!pin) return;
    try {
      await Clipboard.setStringAsync(pin);
      Alert.alert('PIN copied');
    } catch {
      Alert.alert('Could not copy the PIN');
    }
  };

  return (
    <Card style={{ marginTop: 14, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="key-outline" size={18} color={colors.green} />
        <T w="s" size={16}>
          Access PIN
        </T>
      </View>
      <Muted size={13} style={{ marginTop: 8, lineHeight: 19 }}>
        Your personal 6-digit PIN. It is asked every time you open a task's Access Point tab, and your name is recorded against
        everything you do there. Don't share it.
      </Muted>
      {q.isLoading ? (
        <ActivityIndicator color={colors.navy} style={{ marginTop: 16 }} />
      ) : q.isError || !pin ? (
        <Btn title="Couldn't load your PIN — retry" variant="ghost" onPress={() => void q.refetch()} style={{ marginTop: 14 }} />
      ) : (
        <>
          <View
            style={{
              marginTop: 14,
              alignSelf: 'flex-start',
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.soft2,
            }}
          >
            <T mono size={24} style={{ letterSpacing: 8 }}>
              {shown ? pin : '••••••'}
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Btn
              title={shown ? 'Hide' : 'Show'}
              icon={shown ? 'eye-off-outline' : 'eye-outline'}
              variant="ghost"
              onPress={() => setShown((x) => !x)}
              style={{ flex: 1, minHeight: 44 }}
            />
            <Btn title="Copy" icon="copy-outline" variant="ghost" onPress={() => void copy()} style={{ flex: 1, minHeight: 44 }} />
          </View>
        </>
      )}
      <Btn
        title="Generate new PIN"
        icon="refresh"
        variant="ghost"
        loading={regenerate.isPending}
        disabled={!pin}
        onPress={() =>
          Alert.alert('Issue a new PIN?', 'Your current PIN will stop working straight away.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Generate', style: 'destructive', onPress: () => regenerate.mutate() },
          ])
        }
        style={{ marginTop: 12, minHeight: 44 }}
      />
    </Card>
  );
}
