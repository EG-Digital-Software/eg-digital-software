import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useBoard } from '../lib/queries';
import { unreadCount, useSeenVersion } from '../lib/seen';
import { errorMessage } from '../api/client';
import { PROGRESS_PILL, fmtDate, isActiveTask, teamName } from '../lib/portal';
import { Avatar, Card, Chips, EmptyCard, ErrorBox, Loading, Muted, Pill, Screen, SearchField, T } from '../ui';
import { colors } from '../theme';
import { initials } from '../lib/format';

type Filter = 'all' | 'on' | 'ns' | 'un';

export default function TasksScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const board = useBoard();
  useSeenVersion();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const all = useMemo(
    () => [...board.tasks].sort((a, b) => Number(a.progress === 'COMPLETED') - Number(b.progress === 'COMPLETED') || a.taskNumber.localeCompare(b.taskNumber)),
    [board.tasks]
  );
  const unreadOf = (id: string) => {
    const t = all.find((x) => x.id === id);
    return t ? unreadCount(t, user?.id) : 0;
  };
  const term = q.trim().toLowerCase();
  const shown = all.filter((t) => {
    if (term && !`${t.taskNumber} ${t.title} ${teamName(t)}`.toLowerCase().includes(term)) return false;
    if (filter === 'on') return isActiveTask(t);
    if (filter === 'ns') return t.progress === 'NOT_STARTED';
    if (filter === 'un') return unreadOf(t.id) > 0;
    return true;
  });
  const ongoing = all.filter(isActiveTask).length;
  const unread = all.filter((t) => unreadOf(t.id) > 0).length;

  return (
    <Screen title="Tasks" refreshing={board.isRefetching} onRefresh={() => void board.refetch()}>
      <Muted size={14} style={{ marginBottom: 14 }}>
        Work we're tracking for you
      </Muted>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Total" value={all.length} />
        <Stat label="Ongoing" value={ongoing} color={colors.onFg} />
        <Stat label="Unread" value={unread} color="#C8264A" />
      </View>
      <SearchField value={q} onChangeText={setQ} placeholder="Search tasks or teams" style={{ marginTop: 16 }} />
      <Chips<Filter>
        style={{ marginTop: 12 }}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'on', label: 'Ongoing' },
          { value: 'ns', label: 'Not started' },
          { value: 'un', label: 'Unread' },
        ]}
      />
      <View style={{ gap: 10, marginTop: 12 }}>
        {board.isLoading ? (
          <Loading />
        ) : board.isError ? (
          <ErrorBox message={errorMessage(board.error)} onRetry={() => void board.refetch()} />
        ) : shown.length === 0 ? (
          <EmptyCard
            icon="search"
            title={all.length ? 'No tasks match' : 'No tasks yet'}
            body={all.length ? 'Try a different search or filter.' : 'Work your EG Eloma team does for you will appear here.'}
          />
        ) : (
          shown.map((t) => {
            const pill = PROGRESS_PILL[t.progress] ?? PROGRESS_PILL.NOT_STARTED!;
            const team = teamName(t);
            return (
              <Card key={t.id} onPress={() => nav.navigate('Task', { taskId: t.id })} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {unreadOf(t.id) > 0 ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.red }} /> : null}
                    <T mono size={12} color={colors.muted}>
                      {t.taskNumber}
                    </T>
                  </View>
                  <Pill kind={pill.kind} label={pill.label} />
                </View>
                <T w="s" size={15} style={{ marginTop: 8, marginBottom: 10 }}>
                  {t.title}
                </T>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Avatar name={team} label={initials(team)} size={26} style={{ borderWidth: 2, borderColor: '#fff' }} />
                    <Muted size={12}>{t.assignedTeam ? team : 'Not assigned yet'}</Muted>
                  </View>
                  <Muted size={12}>{t.dueDate ? `Ends ${fmtDate(t.dueDate)}` : 'No end date'}</Muted>
                </View>
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}

function Stat({ label, value, color = colors.fg }: { label: string; value: string | number; color?: string }) {
  return (
    <Card style={{ flex: 1, padding: 13 }}>
      <Muted size={12}>{label}</Muted>
      <T w="s" size={22} color={color} style={{ marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
    </Card>
  );
}

export { Stat };
