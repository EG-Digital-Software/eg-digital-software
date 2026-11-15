import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Muted, T } from '../../../ui';
import { colors } from '../../../theme';
import { errorMessage } from '../../../api/client';
import { customerFormApi } from '../../../api/admin/customerForm';
import { Field, Input, Section, SmallBtn, st } from './fields';
import { clean } from './model';

/**
 * Customer Credential — the portal login the admin provisions for the customer.
 * On create both fields are required and set up the login. On edit the email
 * prefills and the password box sets a NEW password (blank keeps the current
 * one); the admin can also reveal the password currently in force.
 */
export function CredentialSection({
  email,
  password,
  onEmail,
  onPassword,
  emailError,
  passwordError,
  isEdit,
  clientId,
  hasCredential,
  open,
  onToggle,
}: {
  email: string;
  password: string;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  emailError?: string;
  passwordError?: string;
  isEdit: boolean;
  clientId?: string;
  hasCredential?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const [show, setShow] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const reveal = async () => {
    if (!clientId) return;
    setRevealing(true);
    try {
      const res = await customerFormApi.revealCredential(clientId);
      if (res.available && res.password) setRevealed(res.password);
      else Alert.alert('Nothing to reveal', 'No stored password to reveal — set a new one below to reset it.');
    } catch (e) {
      Alert.alert('Could not reveal the password', errorMessage(e));
    } finally {
      setRevealing(false);
    }
  };

  return (
    <Section
      icon="key-outline"
      title="Customer Credential"
      description="The email and password the customer uses to sign in to their portal"
      open={open}
      onToggle={onToggle}
      errorCount={(emailError ? 1 : 0) + (passwordError ? 1 : 0)}
    >
      <Field label={`Customer Email (User ID)${isEdit ? '' : ' *'}`} error={emailError} hint="The email the customer logs in with">
        <Input
          value={email}
          onChangeText={(t) => onEmail(clean('email', t))}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          placeholder="name@company.com"
          invalid={!!emailError}
        />
      </Field>
      <Field
        label={isEdit ? 'New Password' : 'Password *'}
        error={passwordError}
        hint={isEdit ? 'Leave blank to keep the current password' : 'At least 8 characters'}
      >
        <View>
          <Input
            value={password}
            onChangeText={onPassword}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            invalid={!!passwordError}
            style={{ paddingRight: 64 }}
          />
          <Pressable
            onPress={() => setShow((x) => !x)}
            hitSlop={6}
            accessibilityLabel={show ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 6, top: 7, height: 36, paddingHorizontal: 10, justifyContent: 'center' }}
          >
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        </View>
      </Field>

      {isEdit && hasCredential ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          <SmallBtn title="Reveal current password" icon="eye-outline" onPress={reveal} loading={revealing} style={{ alignSelf: 'flex-start' }} />
          {revealed ? (
            <View style={[st.tile, { marginTop: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
              <T mono size={14} style={{ flex: 1 }} selectable>
                {revealed}
              </T>
              <Pressable
                hitSlop={8}
                accessibilityLabel="Copy password"
                onPress={async () => {
                  await Clipboard.setStringAsync(revealed);
                  Alert.alert('Copied', 'Password copied to the clipboard.');
                }}
              >
                <Ionicons name="copy-outline" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {!isEdit ? (
        <Muted size={12} style={{ marginTop: 12, lineHeight: 17 }}>
          The customer can sign in immediately with these details and change their own password later — any change stays
          visible to you here.
        </Muted>
      ) : null}
    </Section>
  );
}
