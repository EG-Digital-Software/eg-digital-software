import React, { useEffect, useState } from 'react';
import { Alert, View, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { approvalsApi, type PendingUser } from '../../api/admin/dashboard';
import { Btn, Muted, Sheet, T } from '../../ui';
import { colors } from '../../theme';
import { Field } from './common';

function SheetTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <T w="s" size={18}>
        {title}
      </T>
      {sub ? (
        <Muted size={13} style={{ marginTop: 4, lineHeight: 19 }}>
          {sub}
        </Muted>
      ) : null}
    </View>
  );
}

function Actions({ onCancel, children }: { onCancel: () => void; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
      <Btn title="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const EMPTY = { firstName: '', lastName: '', email: '', designation: '', password: '' };

/** Admin creates an approved team (EMPLOYEE) login. */
export function AddEmployeeSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ ...EMPTY });
  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const close = () => {
    setForm({ ...EMPTY });
    onClose();
  };
  const create = useMutation({
    mutationFn: () =>
      approvalsApi.createEmployee({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim(),
        designation: form.designation.trim() || undefined,
        password: form.password,
      }),
    onSuccess: () => {
      onDone();
      close();
      Alert.alert('Team member added', 'They can sign in now.');
    },
    onError: (e) => Alert.alert('Not added', errorMessage(e)),
  });
  const valid = !!form.firstName.trim() && !!form.email.trim() && form.password.length >= 8;

  return (
    <Sheet open={open} onClose={close}>
      <SheetTitle title="Add team member" sub="Creates an approved Team (Employee) login. You can reveal or reset the password later." />
      <Field label="First name" value={form.firstName} onChangeText={set('firstName')} placeholder="Jane" autoCapitalize="words" />
      <Field label="Last name" value={form.lastName} onChangeText={set('lastName')} placeholder="Doe" autoCapitalize="words" />
      <Field
        label="Email"
        value={form.email}
        onChangeText={set('email')}
        placeholder="jane@company.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="off"
      />
      <Field label="Role / Designation" value={form.designation} onChangeText={set('designation')} placeholder="e.g. Accountant, Support Lead" />
      <Field
        label="Password"
        value={form.password}
        onChangeText={set('password')}
        placeholder="At least 8 characters"
        secure
        autoCapitalize="none"
        autoComplete="new-password"
      />
      <Actions onCancel={close}>
        <Btn title="Add employee" onPress={() => create.mutate()} disabled={!valid} loading={create.isPending} />
      </Actions>
    </Sheet>
  );
}

/** Admin edits a team member's profile: name, login email, designation, phone. */
export function EditEmployeeSheet({ user, onClose, onDone }: { user: PendingUser | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', designation: '', phone: '' });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        email: user.email ?? '',
        designation: user.designation ?? '',
        phone: user.phone ?? '',
      });
    }
  }, [user]);

  const save = useMutation({
    mutationFn: () =>
      approvalsApi.updateEmployee(user!.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        designation: form.designation.trim(),
        phone: form.phone.trim(),
      }),
    onSuccess: () => {
      onDone();
      onClose();
      Alert.alert('Team member updated');
    },
    onError: (e) => Alert.alert('Not saved', errorMessage(e)),
  });
  const valid = !!form.firstName.trim() && !!form.email.trim();

  return (
    <Sheet open={!!user} onClose={onClose}>
      <SheetTitle title="Edit team member" sub="Update this team member's profile details." />
      <Field label="First name" value={form.firstName} onChangeText={set('firstName')} autoCapitalize="words" />
      <Field label="Last name" value={form.lastName} onChangeText={set('lastName')} autoCapitalize="words" />
      <Field label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Role / Designation" value={form.designation} onChangeText={set('designation')} placeholder="e.g. Accountant, Support Lead" />
      <Field
        label="Phone"
        value={form.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        placeholder="e.g. +61 400 000 000"
        hint="Shown to clients when this team member is their account manager."
      />
      <Actions onCancel={onClose}>
        <Btn title="Save changes" onPress={() => save.mutate()} disabled={!valid} loading={save.isPending} />
      </Actions>
    </Sheet>
  );
}

/** Admin reveals a team login's current password and/or resets it. */
export function EmployeePasswordSheet({ user, onClose }: { user: PendingUser | null; onClose: () => void }) {
  const [password, setPassword] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [next, setNext] = useState('');

  const close = () => {
    setPassword(null);
    setShow(false);
    setNext('');
    onClose();
  };

  const reveal = useMutation({
    mutationFn: () => approvalsApi.revealPassword(user!.id),
    onSuccess: (res) => {
      if (res.available && res.password) {
        setPassword(res.password);
        setShow(true);
      } else {
        Alert.alert('No stored password', 'There is no stored password to reveal — set a new one below.');
      }
    },
    onError: (e) => Alert.alert('Could not reveal the password', errorMessage(e)),
  });

  const change = useMutation({
    mutationFn: () => approvalsApi.changePassword(user!.id, next.trim()),
    onSuccess: () => {
      setPassword(null);
      setShow(false);
      setNext('');
      Alert.alert('Password updated');
    },
    onError: (e) => Alert.alert('Could not change the password', errorMessage(e)),
  });

  return (
    <Sheet open={!!user} onClose={close}>
      <SheetTitle title="Team member password" sub={user ? `${user.firstName} ${user.lastName} · ${user.email}` : ''} />
      <T w="s" size={13} style={{ marginTop: 14, marginBottom: 6, marginLeft: 2 }}>
        Current password
      </T>
      {password ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: colors.soft, justifyContent: 'center', paddingHorizontal: 14 }}>
            <T mono size={14} selectable>
              {show ? password : '•'.repeat(Math.max(password.length, 8))}
            </T>
          </View>
          <Pressable onPress={() => setShow((v) => !v)} style={iconBtn} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.fg} />
          </Pressable>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(password);
              Alert.alert('Password copied');
            }}
            style={iconBtn}
            accessibilityLabel="Copy password"
          >
            <Ionicons name="copy-outline" size={20} color={colors.fg} />
          </Pressable>
        </View>
      ) : (
        <Btn title="Reveal password" icon="eye-outline" variant="ghost" onPress={() => reveal.mutate()} loading={reveal.isPending} />
      )}
      <View style={{ height: 1, backgroundColor: colors.line, marginTop: 18 }} />
      <Field label="New password" value={next} onChangeText={setNext} placeholder="At least 8 characters" secure autoCapitalize="none" autoComplete="new-password" />
      <Actions onCancel={close}>
        <Btn title="Save password" onPress={() => change.mutate()} disabled={next.trim().length < 8} loading={change.isPending} />
      </Actions>
    </Sheet>
  );
}

const iconBtn = {
  width: 48,
  height: 48,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: colors.line,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
