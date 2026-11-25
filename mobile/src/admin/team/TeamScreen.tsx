import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { teamApi, teamKeys, type PendingUser, type TeamRole } from '../../api/admin/team';
import { formatDate } from '../../lib/format';
import { colors } from '../../theme';
import { Avatar, Btn, Card, EmptyCard, ErrorBox, Eyebrow, Loading, Muted, Pill, Screen, SearchField, T, type IconName } from '../../ui';
import { Segs } from '../dashboard/common';
import { AddEmployeeSheet, EditEmployeeSheet, EmployeePasswordSheet } from '../dashboard/employeeSheets';
import { describeAccess } from './access';
import { AssignRolesSheet } from './AssignRolesSheet';

type Tab = 'overview' | 'roles';

const fullName = (u: PendingUser) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;

/** Team dashboard (web TeamDashboardPage): members, their roles, and the roles themselves. */
export default function TeamScreen() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [editEmp, setEditEmp] = useState<PendingUser | null>(null);
  const [pwFor, setPwFor] = useState<PendingUser | null>(null);
  const [assignFor, setAssignFor] = useState<PendingUser | null>(null);

  const employeesQ = useQuery({ queryKey: teamKeys.employees, queryFn: teamApi.employees });
  const rolesQ = useQuery({ queryKey: teamKeys.roles, queryFn: teamApi.roles });
  const employees = employeesQ.data ?? [];
  const roles = rolesQ.data ?? [];
  const activeCount = employees.filter((e) => e.isActive).length;

  const refreshEmployees = () => qc.invalidateQueries({ queryKey: teamKeys.employees });
  const refreshRoles = () => qc.invalidateQueries({ queryKey: teamKeys.roles });
  const rolesOf = (id: string) => roles.filter((r) => r.memberIds.includes(id));

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [fullName(e), e.email, e.designation ?? ''].some((v) => v.toLowerCase().includes(q))
    );
  }, [employees, search]);

  const removeEmp = useMutation({
    mutationFn: (id: string) => teamApi.removeEmployee(id),
    onSuccess: () => {
      void refreshEmployees();
      void refreshRoles();
      Alert.alert('Team member removed');
    },
    onError: (e) => Alert.alert('Could not remove', errorMessage(e)),
  });

  const deleteRole = useMutation({
    mutationFn: (id: string) => teamApi.deleteRole(id),
    onSuccess: () => {
      void refreshRoles();
      Alert.alert('Role deleted');
    },
    onError: (e) => Alert.alert('Could not delete', errorMessage(e)),
  });

  const confirmRemove = (emp: PendingUser) =>
    Alert.alert(
      'Remove this team member?',
      `${fullName(emp)} (${emp.email}) loses their login, task assignments and notifications. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeEmp.mutate(emp.id) },
      ]
    );

  const confirmDeleteRole = (r: TeamRole) =>
    Alert.alert(
      'Delete this role?',
      `"${r.name}" will be removed from ${r.memberIds.length} team member(s), who lose the tabs it granted. The team members themselves are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete role', style: 'destructive', onPress: () => deleteRole.mutate(r.id) },
      ]
    );

  const refresh = () => {
    void employeesQ.refetch();
    void rolesQ.refetch();
  };
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? fullName(e) : null;
  };

  const tiles = [
    { label: 'Team members', value: employees.length, color: undefined },
    { label: 'Active', value: activeCount, color: colors.okFg },
    { label: 'Inactive', value: employees.length - activeCount, color: colors.warnFg },
  ];

  return (
    <Screen
      title="Team"
      back
      refreshing={(employeesQ.isRefetching || rolesQ.isRefetching) && !employeesQ.isLoading}
      onRefresh={refresh}
    >
      <Segs<Tab>
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'roles', label: 'Roles' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'overview' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            {tiles.map((t) => (
              <Card key={t.label} style={{ flex: 1, padding: 12 }}>
                <Eyebrow style={{ fontSize: 9.5, letterSpacing: 1 }}>{t.label}</Eyebrow>
                <T w="b" size={22} color={t.color} style={{ marginTop: 6 }}>
                  {employeesQ.isLoading ? '—' : String(t.value)}
                </T>
              </Card>
            ))}
          </View>

          <Btn title="Add team member" icon="person-add-outline" onPress={() => setAdding(true)} style={{ marginTop: 14 }} />
          <SearchField value={search} onChangeText={setSearch} placeholder="Name, email or designation" style={{ marginTop: 12 }} />

          {employeesQ.isLoading ? (
            <Loading />
          ) : employeesQ.isError ? (
            <View style={{ marginTop: 14 }}>
              <ErrorBox message={errorMessage(employeesQ.error)} onRetry={() => void employeesQ.refetch()} />
            </View>
          ) : !employees.length ? (
            <EmptyCard
              icon="people-outline"
              title="No team members yet"
              body="Approved team members will appear here. Add one above or from Approvals → Manage Team."
              style={{ marginTop: 14 }}
            />
          ) : !shown.length ? (
            <EmptyCard icon="search-outline" title="No match" body="No team member matches this search." style={{ marginTop: 14 }} />
          ) : (
            <>
              <Muted size={12.5} style={{ marginTop: 12, marginLeft: 2 }}>
                {shown.length} {shown.length === 1 ? 'person' : 'people'}
              </Muted>
              {shown.map((emp) => {
                const held = rolesOf(emp.id);
                return (
                  <Card key={emp.id} style={{ marginTop: 10, padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Avatar name={fullName(emp)} size={40} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T w="s" size={15} numberOfLines={1}>
                          {fullName(emp)}
                        </T>
                        <Muted size={12.5} numberOfLines={1}>
                          {emp.email}
                        </Muted>
                      </View>
                      <Pill kind={emp.isActive ? 'ok' : 'warn'} label={emp.isActive ? 'Active' : 'Inactive'} style={{ height: 26 }} />
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      <Pill kind="ns" label={emp.designation || 'Team member'} style={{ height: 26 }} />
                      {held.map((r) => (
                        <Pill key={r.id} kind="info" label={r.name} style={{ height: 26 }} />
                      ))}
                    </View>
                    <Muted size={12} style={{ marginTop: 8 }}>
                      {held.length ? '' : 'No roles · '}Last login {emp.lastLoginAt ? formatDate(emp.lastLoginAt) : 'never'}
                      {emp.phone ? ` · ${emp.phone}` : ''}
                    </Muted>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      <MiniBtn icon="shield-checkmark-outline" title="Roles" onPress={() => setAssignFor(emp)} />
                      <MiniBtn icon="create-outline" title="Edit" onPress={() => setEditEmp(emp)} />
                      <MiniBtn icon="key-outline" title="Password" onPress={() => setPwFor(emp)} />
                      <MiniBtn icon="trash-outline" title="Remove" danger onPress={() => confirmRemove(emp)} />
                    </View>
                  </Card>
                );
              })}
            </>
          )}
        </>
      ) : (
        <>
          <Muted size={13} style={{ marginTop: 14, lineHeight: 19 }}>
            Each role grants a set of admin tabs, each view-only or editable. Team members see only the tabs their roles allow.
          </Muted>
          <Btn title="New role" icon="add" onPress={() => nav.navigate('TeamRoleForm', {})} style={{ marginTop: 12 }} />

          {rolesQ.isLoading ? (
            <Loading />
          ) : rolesQ.isError ? (
            <View style={{ marginTop: 14 }}>
              <ErrorBox message={errorMessage(rolesQ.error)} onRetry={() => void rolesQ.refetch()} />
            </View>
          ) : !roles.length ? (
            <EmptyCard
              icon="shield-checkmark-outline"
              title="No roles yet"
              body="Create a role, tick the tabs it can access and choose View or Edit, then assign it to team members from the Overview tab."
              style={{ marginTop: 14 }}
            />
          ) : (
            roles.map((r) => {
              const access = describeAccess(r.access);
              const members = r.memberIds.map(nameOf).filter((n): n is string => !!n);
              return (
                <Card key={r.id} style={{ marginTop: 12, padding: 14 }} onPress={() => nav.navigate('TeamRoleForm', { roleId: r.id })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="shield-checkmark-outline" size={19} color={colors.navy} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w="s" size={15} numberOfLines={1}>
                        {r.name}
                      </T>
                      <Muted size={12.5}>
                        {r.memberIds.length} {r.memberIds.length === 1 ? 'member' : 'members'}
                      </Muted>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                  </View>
                  {access.length ? (
                    <View style={{ gap: 6, marginTop: 10 }}>
                      {access.map((a) => (
                        <View key={a.key} style={{ flexDirection: 'row', gap: 6 }}>
                          <Ionicons name="checkmark" size={14} color={colors.okFg} style={{ marginTop: 2 }} />
                          <T size={13} style={{ flex: 1 }}>
                            {a.label}
                          </T>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Muted size={12.5} style={{ marginTop: 10 }}>
                      No tabs
                    </Muted>
                  )}
                  {members.length ? (
                    <Muted size={12} style={{ marginTop: 8 }} numberOfLines={2}>
                      {members.join(', ')}
                    </Muted>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <MiniBtn icon="create-outline" title="Edit" onPress={() => nav.navigate('TeamRoleForm', { roleId: r.id })} />
                    <MiniBtn icon="trash-outline" title="Delete" danger onPress={() => confirmDeleteRole(r)} />
                  </View>
                </Card>
              );
            })
          )}
        </>
      )}

      <AddEmployeeSheet open={adding} onClose={() => setAdding(false)} onDone={() => void refreshEmployees()} />
      <EditEmployeeSheet user={editEmp} onClose={() => setEditEmp(null)} onDone={() => void refreshEmployees()} />
      <EmployeePasswordSheet user={pwFor} onClose={() => setPwFor(null)} />
      <AssignRolesSheet user={assignFor} roles={roles} onClose={() => setAssignFor(null)} onDone={() => void refreshRoles()} />
    </Screen>
  );
}

/** Compact outline button for card actions. */
function MiniBtn({ icon, title, onPress, danger }: { icon: IconName; title: string; onPress: () => void; danger?: boolean }) {
  const fg = danger ? colors.redFg : colors.fg;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: danger ? colors.redBg : colors.line,
        backgroundColor: danger ? colors.redBg : '#fff',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={15} color={fg} />
      <T w="s" size={13} color={fg}>
        {title}
      </T>
    </Pressable>
  );
}
