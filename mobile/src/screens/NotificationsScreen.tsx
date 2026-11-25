import React from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '../api/portal';
import { errorMessage } from '../api/client';
import { useScope } from '../context/ScopeContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../lib/portal';
import { formatStamp } from '../lib/format';
import { stripMentions } from '../lib/mentions';
import { Btn, Card, EmptyCard, ErrorBox, Loading, Muted, Screen, T } from '../ui';
import { colors } from '../theme';
import type { AppNotification } from '../api/types';

/** Admin app: where an /admin/... link lands. */
function adminTarget(link: string): { name: string; params?: object } | null {
  const invoice = /\/admin\/billing\/([^/?#]+)/i.exec(link);
  if (invoice) return { name: 'InvoiceDetail', params: { id: invoice[1] } };
  const customer = /\/admin\/customers\/([^/?#]+)/i.exec(link);
  if (customer && customer[1] !== 'new') return { name: 'CustomerDetail', params: { clientId: customer[1] } };
  if (/approvals/i.test(link)) return { name: 'Approvals' };
  if (/payments/i.test(link)) return { name: 'Payments' };
  if (/billing|invoice/i.test(link)) return { name: 'Main', params: { screen: 'Billing' } };
  if (/customers/i.test(link)) return { name: 'Main', params: { screen: 'Customers' } };
  if (/task/i.test(link)) return { name: 'Main', params: { screen: 'Tasks' } };
  if (/dashboard/i.test(link)) return { name: 'Main', params: { screen: 'Dashboard' } };
  return null;
}

/** Where a notification's web link lands in the app. */
function target(n: AppNotification, admin: boolean): { name: string; params?: object } | null {
  const link = n.link ?? '';
  if (admin) return adminTarget(link);
  const task = /[?&]task=([0-9a-f-]+)/i.exec(link) ?? /tasks\/([0-9a-f-]{36})/i.exec(link);
  if (task) return { name: 'Thread', params: { taskId: task[1] } };
  if (/agreement|document/i.test(link)) return { name: 'Main', params: { screen: 'Agreements' } };
  if (/invoice|billing/i.test(link)) return { name: 'Invoices' };
  if (/licen|product/i.test(link)) return { name: 'Products' };
  if (/task/i.test(link)) return { name: 'Main', params: { screen: 'Tasks' } };
  return null;
}

export default function NotificationsScreen() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const { scopeKey } = useScope();
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const key = isAdmin ? `admin:${user!.id}` : scopeKey;
  const q = useNotifications();
  const items = q.data?.items ?? [];
  const unread = q.data?.unread ?? 0;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications', key] });
    void qc.invalidateQueries({ queryKey: ['notifications-count', key] });
  };
  const readAll = useMutation({ mutationFn: portalApi.markAllRead, onSuccess: refresh });
  const open = (n: AppNotification) => {
    if (!n.read) void portalApi.markRead(n.id).then(refresh).catch(() => undefined);
    const t = target(n, isAdmin);
    if (t) nav.navigate(t.name, t.params);
  };

  return (
    <Screen title="Notifications" back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyCard icon="notifications-outline" title="You're all caught up" body="Messages, signatures and invoices will show up here." />
      ) : (
        <>
          {unread > 0 ? <Btn title={`Mark all ${unread} as read`} variant="ghost" onPress={() => readAll.mutate()} loading={readAll.isPending} style={{ marginBottom: 12 }} /> : null}
          <Card>
            {items.map((n, i) => (
              <Pressable
                key={n.id}
                onPress={() => open(n)}
                style={({ pressed }) => [
                  { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line },
                  pressed && { backgroundColor: colors.soft2 },
                ]}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: n.read ? 'transparent' : colors.red }} />
                <View style={{ flex: 1 }}>
                  <T w={n.read ? 'm' : 's'} size={14}>
                    {n.title}
                  </T>
                  {n.body ? (
                    <Muted size={13} numberOfLines={2} style={{ marginTop: 2 }}>
                      {stripMentions(n.body)}
                    </Muted>
                  ) : null}
                  <Muted size={12} style={{ marginTop: 4 }}>
                    {formatStamp(n.createdAt)}
                  </Muted>
                </View>
              </Pressable>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
