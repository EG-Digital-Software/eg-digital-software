import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { teamApi, type PendingUser, type TeamRole } from '../../api/admin/team';
import { colors } from '../../theme';
import { Btn, Muted, Sheet, T } from '../../ui';
import { STAFF_TABS, describeAccess, mergeAccess } from './access';

/** Square tick box (web checkbox). */
export function Tick({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: on ? colors.green : colors.faint,
        backgroundColor: on ? colors.green : '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {on ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
    </View>
  );
}

/** Pick which roles a team member holds (any number). */
export function AssignRolesSheet({
  user,
  roles,
  onClose,
  onDone,
}: {
  user: PendingUser | null;
  roles: TeamRole[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Prefill with the roles this member holds whenever the sheet opens.
  useEffect(() => {
    if (user) setPicked(new Set(roles.filter((r) => r.memberIds.includes(user.id)).map((r) => r.id)));
    // Only on open: a background roles refetch shouldn't wipe the admin's picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const save = useMutation({
    mutationFn: () => teamApi.setEmployeeRoles(user!.id, [...picked]),
    onSuccess: () => {
      onDone();
      onClose();
      Alert.alert('Roles updated');
    },
    onError: (e) => Alert.alert('Not saved', errorMessage(e)),
  });

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const summary = describeAccess(mergeAccess(roles.filter((r) => picked.has(r.id)).map((r) => r.access)));

  return (
    <Sheet open={!!user} onClose={onClose}>
      <T w="s" size={18}>
        Assign roles
      </T>
      <Muted size={13} style={{ marginTop: 4 }}>
        {user ? `${user.firstName} ${user.lastName} · ${user.email}` : ''}
      </Muted>

      {roles.length === 0 ? (
        <Muted size={14} style={{ marginTop: 16 }}>
          No roles yet — create one in the Roles tab first.
        </Muted>
      ) : (
        <>
          {roles.map((r) => {
            const on = picked.has(r.id);
            return (
              <Pressable
                key={r.id}
                onPress={() => toggle(r.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 56,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: on ? colors.green2 : colors.line,
                  backgroundColor: on ? colors.greenTint : '#fff',
                  marginTop: 8,
                }}
              >
                <Tick on={on} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w="s" size={14}>
                    {r.name}
                  </T>
                  <Muted size={12} numberOfLines={2}>
                    {r.tabs.length
                      ? STAFF_TABS.filter((t) => r.tabs.includes(t.key))
                          .map((t) => t.label)
                          .join(', ')
                      : 'No tabs'}
                  </Muted>
                </View>
              </Pressable>
            );
          })}
          <View style={{ marginTop: 14, borderRadius: 12, backgroundColor: colors.soft, padding: 12 }}>
            <T size={12.5} color={colors.muted} style={{ lineHeight: 18 }}>
              <T w="b" size={12.5}>
                Access:{' '}
              </T>
              {summary.length ? summary.map((x) => x.label).join('; ') : 'Own tasks and customers only'}
            </T>
          </View>
        </>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        <Btn title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
        <Btn
          title="Save roles"
          onPress={() => save.mutate()}
          disabled={roles.length === 0}
          loading={save.isPending}
          style={{ flex: 1 }}
        />
      </View>
    </Sheet>
  );
}
