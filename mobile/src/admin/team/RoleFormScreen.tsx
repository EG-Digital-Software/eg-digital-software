import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { teamApi, teamKeys, type AccessLevel, type AccessMap, type TeamRole } from '../../api/admin/team';
import { colors } from '../../theme';
import { Btn, Card, ErrorBox, Eyebrow, Loading, Muted, Screen, T } from '../../ui';
import { Field, Segs } from '../dashboard/common';
import { STAFF_SECTIONS, STAFF_TABS, keysOf, levelFor, type StaffTab } from './access';
import { Tick } from './AssignRolesSheet';

/** Create or edit a team role. Params: { roleId? } (no id = new role). */
export default function RoleFormScreen() {
  const route = useRoute<any>();
  const roleId: string | undefined = route.params?.roleId;
  const rolesQ = useQuery({ queryKey: teamKeys.roles, queryFn: teamApi.roles, enabled: !!roleId });
  const role = roleId ? rolesQ.data?.find((r) => r.id === roleId) : null;

  if (roleId && !role) {
    return (
      <Screen title="Edit role" back>
        {rolesQ.isLoading ? (
          <Loading />
        ) : (
          <ErrorBox
            message={rolesQ.isError ? errorMessage(rolesQ.error) : 'This role no longer exists.'}
            onRetry={() => void rolesQ.refetch()}
          />
        )}
      </Screen>
    );
  }
  return <RoleForm key={role?.id ?? 'new'} role={role ?? null} />;
}

/** View / Edit switch for one tab or sub-tab. */
function LevelSwitch({ value, onChange }: { value: AccessLevel; onChange: (v: AccessLevel) => void }) {
  return (
    <View style={{ width: 128 }}>
      <Segs<AccessLevel>
        options={[
          { value: 'view', label: 'View' },
          { value: 'edit', label: 'Edit' },
        ]}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}

function ViewOnly() {
  return (
    <Muted size={12} style={{ marginLeft: 'auto' }}>
      View only
    </Muted>
  );
}

function RoleForm({ role }: { role: TeamRole | null }) {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const [name, setName] = useState(role?.name ?? '');
  const [access, setAccess] = useState<AccessMap>(() => ({ ...(role?.access ?? {}) }));

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), access };
      return role ? teamApi.updateRole(role.id, body) : teamApi.createRole(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamKeys.roles });
      Alert.alert(role ? 'Role updated' : 'Role created');
      nav.goBack();
    },
    onError: (e) => Alert.alert('Not saved', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => teamApi.deleteRole(role!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamKeys.roles });
      Alert.alert('Role deleted');
      nav.goBack();
    },
    onError: (e) => Alert.alert('Could not delete', errorMessage(e)),
  });

  const patch = (changes: Record<string, AccessLevel | null>) =>
    setAccess((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(changes)) {
        if (v) next[k] = v;
        else delete next[k];
      }
      return next;
    });

  // Ticking a tab grants all of it at view level; the admin then narrows it down.
  const grantTab = (tab: StaffTab, on: boolean): Record<string, AccessLevel | null> =>
    Object.fromEntries(keysOf(tab).map((k) => [k, on ? 'view' : null]));

  const allOn = STAFF_TABS.every((t) => levelFor(access, t.key));
  const selectAll = () =>
    patch(Object.assign({}, ...STAFF_TABS.filter((t) => !levelFor(access, t.key)).map((t) => grantTab(t.key, true))));

  const confirmDelete = () =>
    role &&
    Alert.alert(
      'Delete this role?',
      `"${role.name}" will be removed from ${role.memberIds.length} team member(s), who lose the tabs it granted. The team members themselves are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete role', style: 'destructive', onPress: () => remove.mutate() },
      ]
    );

  return (
    <Screen title={role ? 'Edit role' : 'New role'} back>
      <Muted size={13} style={{ lineHeight: 19 }}>
        Tick the tabs this role can open, then choose View (see only) or Edit (make changes) for each. Team, Approvals and
        Settings stay admin-only.
      </Muted>

      <Field label="Role name" value={name} onChangeText={setName} placeholder="e.g. Billing, Support" maxLength={60} autoCapitalize="words" />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 4 }}>
        <Eyebrow>Tab access</Eyebrow>
        <Pressable onPress={() => (allOn ? setAccess({}) : selectAll())} hitSlop={8}>
          <T w="s" size={13} color={colors.green}>
            {allOn ? 'Clear all' : 'Select all'}
          </T>
        </Pressable>
      </View>

      {STAFF_TABS.map((t) => {
        const sections = STAFF_SECTIONS[t.key];
        const on = levelFor(access, t.key) !== null;
        const level = access[t.key];
        return (
          <Card key={t.key} style={{ marginTop: 10, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 56 }}>
              <Pressable
                onPress={() => patch(grantTab(t.key, !on))}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Tick on={on} />
                <Ionicons name={t.icon} size={18} color={colors.muted} />
                <T w="s" size={14.5}>
                  {t.label}
                </T>
              </Pressable>
              {on && !sections ? (
                t.viewOnly ? (
                  <ViewOnly />
                ) : level ? (
                  <LevelSwitch value={level} onChange={(v) => patch({ [t.key]: v })} />
                ) : null
              ) : null}
            </View>

            {on && sections ? (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.soft2, paddingHorizontal: 14, paddingVertical: 6 }}>
                {sections.map((sec, i) => {
                  const key = `${t.key}.${sec.key}`;
                  // The first sub-tab (Overview) is the way in — always granted with the tab.
                  const locked = i === 0;
                  const secLevel = access[key];
                  return (
                    <View key={key} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                      <Pressable
                        disabled={locked}
                        onPress={() => patch({ [key]: secLevel ? null : 'view' })}
                        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!secLevel, disabled: locked }}
                      >
                        <View style={{ marginTop: 1 }}>
                          <Tick on={!!secLevel} disabled={locked} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <T w="s" size={13.5}>
                            {sec.label}
                          </T>
                          <Muted size={12} style={{ lineHeight: 17 }}>
                            {sec.hint}
                          </Muted>
                        </View>
                      </Pressable>
                      {secLevel ? (
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 }}>
                          {sec.viewOnly ? <ViewOnly /> : <LevelSwitch value={secLevel} onChange={(v) => patch({ [key]: v })} />}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </Card>
        );
      })}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
        <Btn title="Cancel" variant="ghost" onPress={() => nav.goBack()} style={{ flex: 1 }} />
        <Btn
          title={role ? 'Save changes' : 'Create role'}
          onPress={() => save.mutate()}
          disabled={!name.trim() || remove.isPending}
          loading={save.isPending}
          style={{ flex: 1 }}
        />
      </View>
      {role ? (
        <Btn
          title="Delete role"
          icon="trash-outline"
          variant="ghost"
          onPress={confirmDelete}
          loading={remove.isPending}
          disabled={save.isPending}
          style={{ marginTop: 10 }}
        />
      ) : null}
    </Screen>
  );
}
