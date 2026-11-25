import React, { useMemo } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useBoard } from '../lib/queries';
import { unreadCount, useSeenVersion } from '../lib/seen';
import {
  BLOOD_URL,
  clockIn,
  fmtDate,
  greeting,
  HOME_TZ,
  isActiveTask,
  money,
  needsSignature,
  nextHoliday,
  officeOpen,
  termLeft,
  useDashboard,
  useProducts,
  useProfile,
} from '../lib/portal';
import { Avatar, Bar, Btn, Card, Eyebrow, Muted, Pill, Screen, SectionHead, T, type IconName } from '../ui';
import { colors } from '../theme';

export default function OverviewScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const profile = useProfile();
  const dash = useDashboard();
  const products = useProducts();
  const board = useBoard();
  useSeenVersion();

  const p = profile.data;
  const docs = p?.documents ?? [];
  const toSign = docs.filter(needsSignature).length;
  const active = board.tasks.filter(isActiveTask);
  const unreadTasks = board.tasks.filter((t) => unreadCount(t, user?.id) > 0).length;
  const owed = dash.data?.outstanding.amount ?? 0;
  const owedText = owed > 0 ? `${money(owed)} owed` : 'Nothing owed';
  const manager = p?.accountManager;
  const managerName = manager ? `${manager.firstName} ${manager.lastName}`.trim() : '';
  const first = (user?.firstName || p?.contactPerson || '').split(' ')[0];

  const licences = useMemo(() => (products.data ?? []).filter((x) => !x.pending), [products.data]);
  const renewals = licences.filter((l) => l.daysRemaining !== null).sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0));
  const next = renewals[0];
  const sameEnd = next && renewals.every((r) => r.expiryDate?.slice(0, 10) === next.expiryDate?.slice(0, 10));
  const holiday = nextHoliday();
  const open = officeOpen();

  const go = (tab: string, screen?: string) =>
    screen ? nav.navigate('Main', { screen: tab, params: { screen, initial: false } }) : nav.navigate('Main', { screen: tab });
  const mail = () => manager && Linking.openURL(`mailto:${manager.email}`);

  const refreshing = profile.isRefetching || board.isRefetching;
  const refresh = () => {
    void profile.refetch();
    void dash.refetch();
    void products.refetch();
    void board.refetch();
  };

  return (
    <Screen title="Overview" refreshing={refreshing} onRefresh={refresh}>
      <Eyebrow style={{ marginTop: 6 }}>{p?.companyName || p?.contactPerson || ' '}</Eyebrow>
      <T w="s" size={26} style={{ letterSpacing: -0.5, marginTop: 2, marginBottom: 4 }}>
        {greeting()}
        {first ? `, ${first}.` : '.'}
      </T>
      <Muted size={13}>
        Your time {clockIn()} · Melbourne {clockIn(HOME_TZ)}
      </Muted>

      {/* Account summary */}
      <Card style={{ marginTop: 16, padding: 16, paddingLeft: 20, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.green2 }} />
        <Eyebrow>Account summary</Eyebrow>
        <T size={15} style={{ marginTop: 8, marginBottom: 12, lineHeight: 22 }}>
          <T w="b" size={15}>
            {toSign} agreement{toSign === 1 ? '' : 's'}
          </T>{' '}
          {toSign === 1 ? 'needs' : 'need'} your signature,{' '}
          <T w="b" size={15}>
            {active.length} task{active.length === 1 ? '' : 's'}
          </T>{' '}
          {active.length === 1 ? 'is' : 'are'} in progress and{' '}
          <T w="b" size={15}>
            {owed > 0 ? `${money(owed)} is owed` : 'nothing is owed'}
          </T>
          .
        </T>
        {toSign > 0 ? (
          <Btn title="Review and sign" onPress={() => go('Agreements')} />
        ) : owed > 0 ? (
          <Btn title="View invoices" onPress={() => nav.navigate('Invoices')} />
        ) : (
          <Btn title="View tasks" onPress={() => go('Tasks')} />
        )}
      </Card>

      {/* Quick actions */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        <Quick icon="create-outline" bg={colors.warnBg} fg="#B86E00" title="Sign" sub={`${toSign} waiting`} onPress={() => go('Agreements')} />
        <Quick icon="list-outline" bg={colors.onBg} fg={colors.onFg} title="Tasks" sub={`${unreadTasks} unread`} onPress={() => go('Tasks')} />
        <Quick icon="document-text-outline" bg={colors.greenSoft} fg={colors.green} title="Invoices" sub={owedText} onPress={() => nav.navigate('Invoices')} />
        <Quick
          icon="chatbubble-outline"
          bg={colors.soft}
          fg={colors.navy}
          title={managerName.split(' ')[0] || 'Support'}
          sub="Message"
          onPress={() => (manager ? mail() : Linking.openURL('tel:1800054555'))}
        />
      </View>

      {/* Contracts and renewals */}
      <SectionHead title="Contracts and renewals" action="Manage" onAction={() => nav.navigate('Products')} />
      <Card>
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
          {licences.length ? (
            <>
              <T w="s" size={18}>
                {licences.length} active
                {next ? (
                  <>
                    {' · next renewal in '}
                    <T w="s" size={18} color={colors.green}>
                      {next.daysRemaining} days
                    </T>
                  </>
                ) : null}
              </T>
              {next ? (
                <Muted size={13} style={{ marginTop: 2 }}>
                  {sameEnd && renewals.length > 1 ? 'All renew' : 'Renews'} on {fmtDate(next.expiryDate)}
                </Muted>
              ) : null}
            </>
          ) : (
            <Muted size={14} style={{ paddingBottom: 10 }}>
              No active licences yet.
            </Muted>
          )}
        </View>
        {licences.slice(0, 4).map((l, i) => {
          const left = termLeft(l);
          return (
            <View key={l.id} style={{ paddingHorizontal: 16, paddingVertical: 13, gap: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <T w="s" size={14} numberOfLines={1}>
                    {l.product} · Licence {i + 1}
                  </T>
                  {l.licence ? (
                    <T mono size={12} color={colors.muted}>
                      {l.licence}
                    </T>
                  ) : null}
                </View>
                {l.daysRemaining !== null ? <Pill kind={l.daysRemaining > 30 ? 'ok' : 'warn'} label={`${l.daysRemaining} days left`} /> : <Pill kind="ok" label="Ongoing" />}
              </View>
              {left !== null ? <Bar pct={100 - left} /> : null}
            </View>
          );
        })}
      </Card>

      {/* Work in flight */}
      <SectionHead title="Work in flight" action={`All ${board.tasks.length}`} onAction={() => go('Tasks')} />
      <Card>
        {active.length ? (
          active.slice(0, 5).map((t, i) => (
            <Pressable
              key={t.id}
              onPress={() => nav.navigate('Main', { screen: 'Tasks', params: { screen: 'Task', params: { taskId: t.id }, initial: false } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <T w="s" size={14}>
                  {t.title}
                </T>
                <Muted size={13} style={{ marginTop: 2 }}>
                  {t.dueDate ? `Due ${fmtDate(t.dueDate)}` : 'Ongoing · no due date'}
                </Muted>
              </View>
              <Pill kind="on" label={t.progress === 'ONGOING' ? 'Ongoing' : 'In progress'} />
            </Pressable>
          ))
        ) : (
          <Muted size={14} style={{ padding: 16 }}>
            Nothing in progress right now.
          </Muted>
        )}
      </Card>

      {/* Account manager */}
      {manager ? (
        <>
          <SectionHead title="Your account manager" />
          <Card style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={managerName} size={46} fill="#fff" style={{ borderWidth: 2, borderColor: colors.green2 }} />
              <View style={{ flex: 1 }}>
                <T w="s" size={15}>
                  {managerName}
                </T>
                <Muted size={13} numberOfLines={1}>
                  {manager.email}
                </Muted>
              </View>
              <Pill kind={open ? 'ok' : 'ns'} label={open ? 'Available' : 'Offline'} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Btn title="Message" onPress={mail} style={{ flex: 1 }} />
              {manager.phone ? (
                <Btn title="Call" variant="ghost" onPress={() => Linking.openURL(`tel:${manager.phone!.replace(/\s+/g, '')}`)} style={{ flex: 1 }} />
              ) : (
                <Btn title="Support" variant="ghost" onPress={() => Linking.openURL('tel:1800054555')} style={{ flex: 1 }} />
              )}
            </View>
          </Card>
        </>
      ) : null}

      {/* Next Melbourne holiday */}
      {holiday ? (
        <Card style={{ marginTop: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="calendar-outline" size={20} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Eyebrow style={{ fontSize: 10 }}>Next Melbourne holiday</Eyebrow>
            <T w="s" size={15} style={{ marginTop: 2 }}>
              {holiday.name}
            </T>
            <Muted size={13}>{holiday.date}</Muted>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T w="s" size={26} color={colors.green}>
              {holiday.days}
            </T>
            <Muted size={12}>{holiday.days === 1 ? 'day away' : 'days away'}</Muted>
          </View>
        </Card>
      ) : null}

      {/* Give blood */}
      <Card style={{ marginTop: 16, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.redBg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="water" size={18} color="#D7263D" />
          </View>
          <View>
            <T w="s" size={15}>
              Give blood, save lives
            </T>
            <Muted size={13}>Australian Red Cross Lifeblood</Muted>
          </View>
        </View>
        <Btn title="Join the Eloma Group team" variant="green" onPress={() => Linking.openURL(BLOOD_URL)} style={{ marginTop: 12 }} />
      </Card>
    </Screen>
  );
}

function Quick({ icon, bg, fg, title, sub, onPress }: { icon: IconName; bg: string; fg: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: 92,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingHorizontal: 4,
          paddingVertical: 10,
        },
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={fg} />
      </View>
      <T w="s" size={13} numberOfLines={1}>
        {title}
      </T>
      <Muted size={11.5} numberOfLines={1} style={{ textAlign: 'center', marginTop: -4 }}>
        {sub}
      </Muted>
    </Pressable>
  );
}
