import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import { isVaultLocked, vaultApi, type VaultAccess, type VaultEntry, type VaultInput } from '../../api/admin/vault';
import { Btn, Loading, Muted, Screen, T } from '../../ui';
import { colors } from '../../theme';
import { Field, Input, SelectField, SmallBtn, type PickOption } from '../customers/form/fields';
import { lockVault, setRevealed, useVaultError, VAULT_QK } from './store';
import { VaultShell, generatePassword, useQueryLockGuard, useVaultList, useVaultMeta } from './common';

type Params = { id?: string; customerId?: string; rotate?: boolean } | undefined;

/** Add or edit a login (web EntryDrawer, admin portal). */
export default function VaultFormScreen() {
  return (
    <VaultShell>
      <FormLoader />
    </VaultShell>
  );
}

function FormLoader() {
  const params = useRoute<any>().params as Params;
  const listQ = useVaultList();
  const metaQ = useVaultMeta();
  useQueryLockGuard(listQ.error, metaQ.error);
  const id = params?.id;
  if (listQ.isLoading || metaQ.isLoading) {
    return (
      <Screen title={id ? 'Edit login' : 'Add a login'} back>
        <Loading />
      </Screen>
    );
  }
  const entry = id ? listQ.data?.items.find((e) => e.id === id) ?? null : null;
  return <EntryForm key={id ?? 'new'} entryId={id} entry={entry} defaultCustomer={params?.customerId} rotate={!!params?.rotate} />;
}

const ACCESS_OPTIONS: PickOption[] = [
  { value: 'ADMINS', label: 'Admins only' },
  { value: 'TEAM', label: 'Admins + whole team' },
  { value: 'PICK', label: 'Admins + pick roles or people…' },
];

function EntryForm({
  entryId,
  entry,
  defaultCustomer,
  rotate,
}: {
  entryId?: string;
  entry: VaultEntry | null;
  defaultCustomer?: string;
  rotate: boolean;
}) {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const onErr = useVaultError();
  const listQ = useVaultList();
  const metaQ = useVaultMeta();
  const meta = metaQ.data;
  const permissions = listQ.data?.permissions;
  const isNew = !entryId;

  const customers = meta?.customers ?? [];
  const firstOwner = permissions?.companyEdit ? '' : (defaultCustomer ?? customers[0]?.id ?? '');
  const [owner, setOwner] = useState<string>(entry ? (entry.customerId ?? '') : (defaultCustomer ?? firstOwner));
  const [name, setName] = useState(entry?.name ?? '');
  const [url, setUrl] = useState(entry?.url ?? '');
  const [username, setUsername] = useState(entry?.username ?? '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [folder, setFolder] = useState(entry?.folder ?? meta?.folders[0] ?? 'Software');
  const [twoFactor, setTwoFactor] = useState(entry?.twoFactor ?? 'Off');
  const [notes, setNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(isNew);
  const [access, setAccess] = useState<VaultAccess>(entry?.access ?? 'ADMINS');
  const [people, setPeople] = useState<string[]>(entry?.accessEmployeeIds ?? []);
  const [roles, setRoles] = useState<string[]>(entry?.accessRoleIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Notes are encrypted; load them for editing (logged as a reveal, like the web).
  useEffect(() => {
    if (!entryId) return;
    let alive = true;
    vaultApi
      .reveal(entryId, 'REVEALED')
      .then((r) => {
        if (!alive) return;
        setNotes(r.notes ?? '');
        setNotesLoaded(true);
      })
      .catch((e) => {
        if (isVaultLocked(e)) onErr(e);
        else if (alive) setNotesLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [entryId, onErr]);

  // Edited login vanished (deleted elsewhere).
  useEffect(() => {
    if (entryId && !entry) nav.goBack();
  }, [entryId, entry, nav]);

  const isCompany = owner === '';

  const ownerOptions = useMemo<PickOption[]>(
    () => [
      ...(permissions?.companyEdit ? [{ value: '', label: 'Eloma Group (team login)' }] : []),
      ...customers.map((c) => ({ value: c.id, label: c.name, right: c.clientId })),
    ],
    [permissions?.companyEdit, customers]
  );
  const folderOptions = useMemo<PickOption[]>(
    () => [...(meta?.folders ?? []), ...(meta?.folders.includes(folder) ? [] : [folder])].map((f) => ({ value: f, label: f })),
    [meta?.folders, folder]
  );
  const twoFactorOptions = useMemo<PickOption[]>(
    () => (meta?.twoFactor ?? [twoFactor]).map((f) => ({ value: f, label: f })),
    [meta?.twoFactor, twoFactor]
  );

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Service name is required');
    if (isNew && !password) return setError('Password is required');
    const body: VaultInput = {
      name: name.trim(),
      url: url.trim() || null,
      username: username.trim() || null,
      folder,
      twoFactor,
      ...(notesLoaded ? { notes: notes.trim() || null } : {}),
      ...(password ? { password } : {}),
    };
    if (isNew) body.customerId = owner || null;
    if (isCompany) {
      body.access = access;
      body.accessEmployeeIds = access === 'PICK' ? people : [];
      body.accessRoleIds = access === 'PICK' ? roles : [];
    }
    setBusy(true);
    try {
      const r = isNew ? await vaultApi.create(body) : await vaultApi.update(entryId!, body);
      setRevealed(r.id, null);
      void qc.invalidateQueries({ queryKey: VAULT_QK });
      nav.goBack();
      Alert.alert(isNew ? 'Login saved' : password ? 'Password changed' : 'Login updated');
    } catch (e) {
      if (isVaultLocked(e)) {
        lockVault('Vault locked — enter your PIN again');
        nav.navigate('Vault');
      } else setError(errorMessage(e, 'Could not save'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Screen title={isNew ? 'Add a login' : rotate ? 'Rotate password' : `Edit ${entry?.name ?? 'login'}`} back>
      {isNew ? (
        <Field label="Belongs to">
          <SelectField
            value={owner}
            options={ownerOptions}
            onChange={setOwner}
            title="Belongs to"
            placeholder="Choose a client…"
            searchable={ownerOptions.length > 8}
          />
        </Field>
      ) : null}
      <Field label="Service name">
        <Input value={name} onChangeText={setName} placeholder="e.g. Xero" maxLength={120} />
      </Field>
      <Field label="Website">
        <Input value={url} onChangeText={setUrl} placeholder="https://" maxLength={500} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      </Field>
      <Field label="Username or email">
        <Input value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={200} />
      </Field>
      <Field label={isNew ? 'Password' : 'New password (leave blank to keep the current one)'}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              maxLength={500}
              autoFocus={rotate}
            />
          </View>
          <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={8} accessibilityLabel={showPw ? 'Hide password' : 'Show password'} style={{ padding: 6 }}>
            <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        </View>
        <SmallBtn
          title="Generate strong password"
          icon="sparkles-outline"
          onPress={() => {
            setPassword(generatePassword());
            setShowPw(true);
          }}
          style={{ alignSelf: 'flex-start', marginTop: 8 }}
        />
      </Field>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Folder" style={{ flex: 1 }}>
          <SelectField value={folder} options={folderOptions} onChange={setFolder} title="Folder" />
        </Field>
        <Field label="Two-factor" style={{ flex: 1 }}>
          <SelectField value={twoFactor} options={twoFactorOptions} onChange={setTwoFactor} title="Two-factor" />
        </Field>
      </View>

      {isCompany ? (
        <Field label="Who can access">
          <SelectField value={access} options={ACCESS_OPTIONS} onChange={(v) => setAccess(v as VaultAccess)} title="Who can access" />
        </Field>
      ) : (
        <Muted size={12} style={{ marginTop: 10, lineHeight: 17 }}>
          Client logins are visible to that client, Eloma Group admins and the team working on the client.
        </Muted>
      )}
      {isCompany && access === 'PICK' ? (
        <View>
          {(meta?.roles.length ?? 0) > 0 ? (
            <Picker label="Team roles" options={meta!.roles} picked={roles} onToggle={(rid) => toggle(roles, setRoles, rid)} />
          ) : null}
          <Picker label="People" options={meta?.employees ?? []} picked={people} onToggle={(pid) => toggle(people, setPeople, pid)} />
        </View>
      ) : null}

      <Field label="Notes">
        <Input
          value={notes}
          onChangeText={setNotes}
          disabled={!notesLoaded}
          placeholder={notesLoaded ? 'Recovery steps, who to call, renewal date' : 'Loading…'}
          maxLength={4000}
          multiline
          style={{ minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }}
        />
      </Field>
      <Muted size={12} style={{ marginTop: 10, lineHeight: 17 }}>
        Encrypted before it’s saved. Only people with access can reveal it, and every reveal or copy is logged.
      </Muted>
      {error ? (
        <T size={13} color={colors.redFg} style={{ marginTop: 12 }}>
          {error}
        </T>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Btn title="Cancel" variant="ghost" onPress={() => nav.goBack()} disabled={busy} style={{ flex: 1 }} />
        <Btn title="Save login" onPress={() => void submit()} loading={busy} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

function Picker({
  label,
  options,
  picked,
  onToggle,
}: {
  label: string;
  options: { id: string; name: string }[];
  picked: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <Field label={label}>
      {options.length === 0 ? (
        <Muted size={12}>None yet.</Muted>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {options.map((o) => {
            const on = picked.includes(o.id);
            return (
              <Pressable
                key={o.id}
                onPress={() => onToggle(o.id)}
                accessibilityState={{ selected: on }}
                style={{
                  minHeight: 36,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: on ? colors.green2 : colors.line,
                  backgroundColor: on ? colors.greenChip : '#fff',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {on ? <Ionicons name="checkmark" size={14} color={colors.greenChipText} /> : null}
                <T w="s" size={13} color={on ? colors.greenChipText : colors.fg}>
                  {o.name}
                </T>
              </Pressable>
            );
          })}
        </View>
      )}
    </Field>
  );
}
