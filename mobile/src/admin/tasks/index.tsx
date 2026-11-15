import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listCustomers } from '../../api/portal';
import { errorMessage } from '../../api/client';
import type { CustomerSummary } from '../../api/types';
import { TaskScope } from '../../context/ScopeContext';
import { Avatar, Card, EmptyCard, ErrorBox, Loading, Muted, Screen, SearchField, Sheet, T } from '../../ui';
import { colors } from '../../theme';
import type { AdminRoute } from '../types';
import AdminTaskBoardScreen, { BoardBody } from './BoardScreen';
import AdminTaskScreen, { AdminTaskNewScreen } from './TaskScreen';
import AdminTaskAppointmentsScreen from './AppointmentsScreen';
import AdminTaskTimeSheetScreen from './TimeSheetScreen';
import AdminTaskDashboardScreen from './DashboardScreen';
import { useAdminTaskActivity } from './activity';

const LAST_KEY = 'admin-tasks:last-customer';
type Picked = { clientId: string; companyName: string };
const nameOf = (c: CustomerSummary) => c.companyName || c.contactPerson || c.clientId;

/** Tasks tab: pick a customer, then work on their board. The last customer is remembered. */
export function Home() {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const activity = useAdminTaskActivity();

  useEffect(() => {
    AsyncStorage.getItem(LAST_KEY)
      .then((raw) => {
        if (raw) setPicked(JSON.parse(raw) as Picked);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const choose = (c: CustomerSummary) => {
    const p = { clientId: c.clientId, companyName: nameOf(c) };
    setPicked(p);
    setPickerOpen(false);
    AsyncStorage.setItem(LAST_KEY, JSON.stringify(p)).catch(() => undefined);
  };

  if (!loaded) {
    return (
      <Screen title="Tasks">
        <Loading />
      </Screen>
    );
  }

  const switcher = (
    <Pressable onPress={() => setPickerOpen(true)} style={{ marginBottom: 12 }}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
        <Avatar name={picked?.companyName ?? '?'} size={38} radius={10} fill={colors.navy} color="#fff" />
        <View style={{ flex: 1 }}>
          <Muted size={12}>Customer</Muted>
          <T w="s" size={15} numberOfLines={1}>
            {picked?.companyName ?? 'Choose a customer'}
          </T>
        </View>
        {activity.any ? <View accessibilityLabel="Customers with new activity" style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.red }} /> : null}
        <T w="s" size={13} color={colors.green}>
          Change
        </T>
        <Ionicons name="chevron-down" size={16} color={colors.green} />
      </Card>
    </Pressable>
  );

  return (
    <>
      {picked ? (
        <TaskScope key={picked.clientId} clientId={picked.clientId}>
          <BoardBody clientId={picked.clientId} companyName={picked.companyName} header={switcher} />
        </TaskScope>
      ) : (
        <Screen title="Tasks">
          <Muted size={14} style={{ marginBottom: 12 }}>
            Plan and track work for each customer.
          </Muted>
          <CustomerList onPick={choose} hasNew={activity.companyHasNew} />
        </Screen>
      )}
      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)}>
        <T w="s" size={17} style={{ marginBottom: 10 }}>
          Choose a customer
        </T>
        <CustomerList onPick={choose} selected={picked?.clientId} hasNew={activity.companyHasNew} />
      </Sheet>
    </>
  );
}

function CustomerList({ onPick, selected, hasNew }: { onPick: (c: CustomerSummary) => void; selected?: string; hasNew: (clientId: string) => boolean }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useQuery({ queryKey: ['admin-tasks', 'customers', debounced], queryFn: () => listCustomers(debounced || undefined) });

  return (
    <>
      <SearchField value={q} onChangeText={setQ} placeholder="Search customers" />
      <View style={{ gap: 8, marginTop: 12 }}>
        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrorBox message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : (list.data ?? []).length === 0 ? (
          <EmptyCard icon="business-outline" title={debounced ? 'No matches' : 'No customers yet'} body={debounced ? undefined : 'Add a customer first, then plan their tasks here.'} />
        ) : (
          (list.data ?? []).map((c) => {
            const on = c.clientId === selected;
            const fresh = hasNew(c.clientId);
            return (
              <Card
                key={c.clientId}
                onPress={() => onPick(c)}
                style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }, on && { borderColor: colors.green2, backgroundColor: colors.greenTint }, !on && fresh && { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}
              >
                <Avatar name={nameOf(c)} size={36} radius={10} />
                <View style={{ flex: 1 }}>
                  <T w="s" size={14.5} numberOfLines={1}>
                    {nameOf(c)}
                  </T>
                  <T mono size={11.5} color={colors.muted}>
                    {c.clientId}
                  </T>
                </View>
                {fresh && !on ? <View accessibilityLabel="New activity" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red }} /> : null}
                {on ? <Ionicons name="checkmark-circle" size={20} color={colors.green} /> : <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
              </Card>
            );
          })
        )}
        {list.isFetching && !list.isLoading ? <ActivityIndicator color={colors.navy} /> : null}
      </View>
    </>
  );
}

export const routes: AdminRoute[] = [
  { name: 'AdminTaskBoard', component: AdminTaskBoardScreen },
  { name: 'AdminTask', component: AdminTaskScreen },
  { name: 'AdminTaskNew', component: AdminTaskNewScreen },
  { name: 'AdminTaskAppointments', component: AdminTaskAppointmentsScreen },
  { name: 'AdminTaskTimeSheet', component: AdminTaskTimeSheetScreen },
  { name: 'AdminTaskDashboard', component: AdminTaskDashboardScreen },
];
