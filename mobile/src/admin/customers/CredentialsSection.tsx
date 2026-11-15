import React, { useState } from 'react';
import { View, Alert, Pressable } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { errorMessage } from '../../api/client';
import { adminCustomersApi, type AdminCredential } from '../../api/admin/customers';
import { Btn, Card, ErrorBox, Loading, Muted, Pill, T } from '../../ui';
import { colors } from '../../theme';
import { CardTitle, Field, IconBtn, customerKey } from './common';

const credKey = (clientId: string) => ['admin-customer', clientId, 'credentials'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EyeToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} hitSlop={8} accessibilityLabel={shown ? 'Hide password' : 'Show password'}>
      <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
    </Pressable>
  );
}

/** Portal logins for this customer — reveal, change, remove, add (web Credential tab). */
export function CredentialsSection({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showNew, setShowNew] = useState(false);

  const creds = useQuery({ queryKey: credKey(clientId), queryFn: () => adminCustomersApi.listCredentials(clientId) });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: credKey(clientId) });
    void qc.invalidateQueries({ queryKey: customerKey(clientId) });
  };

  const add = useMutation({
    mutationFn: () => adminCustomersApi.addCredential(clientId, { email: email.trim(), password }),
    onSuccess: () => {
      setEmail('');
      setPassword('');
      invalidate();
      Alert.alert('Access granted', 'New login added.');
    },
    onError: (e) => Alert.alert('Could not add the login', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => adminCustomersApi.removeCredential(clientId, userId),
    onSuccess: () => {
      invalidate();
      Alert.alert('Login removed', 'Access revoked.');
    },
    onError: (e) => Alert.alert('Could not remove the login', errorMessage(e)),
  });

  const confirmRemove = (cred: AdminCredential) =>
    Alert.alert('Remove this login?', `${cred.email} will no longer be able to sign in to the portal.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(cred.id) },
    ]);

  const canAdd = EMAIL.test(email.trim()) && password.trim().length >= 8;

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ padding: 16 }}>
        <CardTitle icon="key-outline" title="Customer credentials" right={<Pill kind="ns" label="EG only" />} />
        <Muted size={13} style={{ marginBottom: 10 }}>
          Portal logins for this customer — grant access to more than one person.
        </Muted>
        {creds.isLoading ? (
          <Loading />
        ) : creds.isError ? (
          <ErrorBox message={errorMessage(creds.error)} onRetry={() => void creds.refetch()} />
        ) : creds.data?.length ? (
          <View style={{ gap: 10 }}>
            {creds.data.map((cred) => (
              <CredentialRow
                key={cred.id}
                clientId={clientId}
                cred={cred}
                onRemove={() => confirmRemove(cred)}
                removing={remove.isPending && remove.variables === cred.id}
              />
            ))}
          </View>
        ) : (
          <Muted size={13.5}>No portal logins yet. Add one below to give this customer access.</Muted>
        )}
      </Card>

      <Card style={{ padding: 16, gap: 12 }}>
        <T w="s" size={15}>
          Add a login
        </T>
        <Field
          label="Email (User ID)"
          value={email}
          onChangeText={setEmail}
          placeholder="person@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="off"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry={!showNew}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          right={<EyeToggle shown={showNew} onToggle={() => setShowNew((s) => !s)} />}
        />
        <Btn title="Add login" icon="add" onPress={() => add.mutate()} disabled={!canAdd} loading={add.isPending} />
      </Card>
    </View>
  );
}

function CredentialRow({
  clientId,
  cred,
  onRemove,
  removing,
}: {
  clientId: string;
  cred: AdminCredential;
  onRemove: () => void;
  removing: boolean;
}) {
  const [revealing, setRevealing] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [changing, setChanging] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const reveal = async () => {
    setRevealing(true);
    try {
      const res = await adminCustomersApi.revealCredential(clientId, cred.id);
      if (res.available && res.password) {
        setPassword(res.password);
        setShow(true);
      } else {
        Alert.alert('Nothing to reveal', 'No stored password to reveal for this login.');
      }
    } catch (e) {
      Alert.alert('Could not reveal the password', errorMessage(e));
    } finally {
      setRevealing(false);
    }
  };

  const save = async () => {
    if (newPass.trim().length < 8) return;
    setSaving(true);
    try {
      await adminCustomersApi.changeCredentialPassword(clientId, cred.id, newPass.trim());
      // Drop any revealed value so it can't show the old password.
      setPassword(null);
      setShow(false);
      setNewPass('');
      setChanging(false);
      Alert.alert('Password changed');
    } catch (e) {
      Alert.alert('Could not change the password', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, backgroundColor: colors.soft2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="mail-outline" size={16} color={colors.muted} />
        <T w="s" size={14} style={{ flex: 1 }} numberOfLines={1} selectable>
          {cred.email}
        </T>
        <IconBtn icon="key-outline" label="Change password" onPress={() => setChanging((v) => !v)} />
        <IconBtn icon="trash-outline" label="Remove login" color={colors.redFg} onPress={onRemove} disabled={removing} />
      </View>
      {!cred.isActive || cred.approvalStatus !== 'APPROVED' ? (
        <Pill kind="warn" label={!cred.isActive ? 'Inactive' : cred.approvalStatus} style={{ marginTop: 6 }} />
      ) : null}

      {changing ? (
        <View style={{ marginTop: 10, gap: 10 }}>
          <Field
            label="New password"
            value={newPass}
            onChangeText={setNewPass}
            placeholder="At least 8 characters"
            secureTextEntry={!showNew}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            right={<EyeToggle shown={showNew} onToggle={() => setShowNew((s) => !s)} />}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn
              title="Cancel"
              variant="ghost"
              onPress={() => {
                setChanging(false);
                setNewPass('');
              }}
              style={{ flex: 1, minHeight: 44 }}
            />
            <Btn
              title="Save password"
              onPress={() => void save()}
              loading={saving}
              disabled={newPass.trim().length < 8}
              style={{ flex: 1, minHeight: 44 }}
            />
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 10 }}>
        {password ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' }}>
              <T mono size={13} selectable>
                {show ? password : '•'.repeat(Math.max(password.length, 8))}
              </T>
            </View>
            <IconBtn icon={show ? 'eye-off-outline' : 'eye-outline'} label={show ? 'Hide' : 'Show'} onPress={() => setShow((s) => !s)} />
            <IconBtn
              icon="copy-outline"
              label="Copy password"
              onPress={() => {
                void Clipboard.setStringAsync(password);
                Alert.alert('Password copied');
              }}
            />
          </View>
        ) : (
          <Btn title="Reveal password" icon="eye-outline" variant="ghost" onPress={() => void reveal()} loading={revealing} style={{ minHeight: 42 }} />
        )}
      </View>
    </View>
  );
}
