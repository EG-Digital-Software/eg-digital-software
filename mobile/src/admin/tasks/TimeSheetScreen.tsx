import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import {
  decideTimeSheetRequest,
  type TimeSheetEntry,
  type TimeSheetEntryInput,
  type TimeSheetPool,
  type TimeSheetPoolInput,
} from '../../api/admin/tasks';
import { TaskScope } from '../../context/ScopeContext';
import { displayName, useAuth } from '../../context/AuthContext';
import { useBoard } from '../../lib/queries';
import { Btn, Card, EmptyCard, ErrorBox, Loading, Muted, Screen, Sheet, T, Toggle } from '../../ui';
import { colors, GUTTER } from '../../theme';
import { DateRow, Input, Label, SelectRow, SmallBtn, Tabs, confirmDestroy, shareTextFile, useAdminApi } from './common';
import {
  ENTRY_STATUS_LABEL,
  TIME_CATEGORIES,
  TIME_PRIORITIES,
  TIME_STAFF,
  counts,
  dayLabel,
  hoursLabel,
  money,
  monthLabel,
  newRequestId,
  rangeLabel,
  round2,
  summarisePool,
  timeSheetCsv,
  type Summary,
} from './timesheetCalc';

const onErr = (title: string) => (e: unknown) => Alert.alert(title, errorMessage(e));

const TONE = {
  amber: { bg: colors.warnBg, fg: colors.warnFg },
  red: { bg: colors.redBg, fg: colors.redFg },
  blue: { bg: colors.infoBg, fg: colors.infoFg },
  green: { bg: colors.okBg, fg: colors.okFg },
  grey: { bg: colors.nsBg, fg: colors.nsFg },
};
const STATUS_TONE: Record<string, keyof typeof TONE> = {
  ADMIN_PENDING: 'blue',
  ADMIN_REJECTED: 'red',
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
};
const PRIORITY_TONE: Record<string, keyof typeof TONE> = { Phase: 'grey', P1: 'red', P2: 'amber', P3: 'blue', P4: 'grey' };

function Notice({ tone, children }: { tone: 'amber' | 'red' | 'blue'; children: React.ReactNode }) {
  return (
    <View style={{ padding: 12, borderRadius: 10, backgroundColor: TONE[tone].bg, marginTop: 8 }}>
      <T size={13} color={TONE[tone].fg} style={{ lineHeight: 18 }}>
        {children}
      </T>
    </View>
  );
}

function Tag({ tone, label }: { tone: keyof typeof TONE; label: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: TONE[tone].bg, alignSelf: 'flex-start' }}>
      <T w="s" size={11.5} color={TONE[tone].fg}>
        {label}
      </T>
    </View>
  );
}

function Meter({ value, max, tone }: { value: number; max: number; tone: 'navy' | 'amber' | 'red' | 'green' }) {
  const color = { navy: colors.navy, amber: colors.amber, red: colors.red, green: colors.green2 }[tone];
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden', marginTop: 8 }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <Card style={{ padding: 13, marginTop: 10 }}>
      <Muted size={12}>{label}</Muted>
      <T w="b" size={19} style={{ marginTop: 2 }}>
        {value}
      </T>
      {sub ? (
        <Muted size={12} style={{ marginTop: 2 }}>
          {sub}
        </Muted>
      ) : null}
      {children}
    </Card>
  );
}

/** Route AdminTaskTimeSheet { clientId, companyName? } — the board's Time Sheet (hour pools). */
export default function AdminTaskTimeSheetScreen() {
  const route = useRoute<any>();
  const clientId: string = route.params?.clientId;
  return (
    <TaskScope clientId={clientId}>
      <TimeSheet clientId={clientId} companyName={route.params?.companyName} />
    </TaskScope>
  );
}

function TimeSheet({ clientId, companyName }: { clientId: string; companyName?: string }) {
  const api = useAdminApi(clientId);
  const qc = useQueryClient();
  const board = useBoard();
  const key = ['admin-tasks', clientId, 'timesheet'];
  // Others change the sheet too (the client approves, the team logs).
  const q = useQuery({ queryKey: key, queryFn: api.timeSheet, refetchInterval: 30_000 });
  const [selected, setSelected] = useState('');
  const [poolForm, setPoolForm] = useState<{ pool: TimeSheetPool | null } | null>(null);
  const boardTasks = useMemo(() => (board.data?.buckets ?? []).flatMap((b) => b.tasks), [board.data]);

  const savePool = useMutation({
    mutationFn: (v: { id?: string; body: TimeSheetPoolInput }) => (v.id ? api.updateTimeSheetPool(v.id, v.body) : api.createTimeSheetPool(v.body)),
    onSuccess: (pool) => {
      void qc.invalidateQueries({ queryKey: key });
      setSelected(pool.id);
      setPoolForm(null);
    },
    onError: onErr('Pool not saved'),
  });

  const pools = q.data?.pools ?? [];
  const pool = pools.find((p) => p.id === selected) ?? pools[0];

  return (
    <Screen title={companyName ? `Time Sheet · ${companyName}` : 'Time Sheet'} back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <ErrorBox message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 8 }}>
            {pools.map((p) => {
              const on = p.id === pool?.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setSelected(p.id)}
                  style={{ minWidth: 170, padding: 12, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? colors.green2 : colors.line, backgroundColor: on ? colors.greenTint : '#fff' }}
                >
                  <T w="s" size={14} numberOfLines={1}>
                    {p.name}
                  </T>
                  <Muted size={12} numberOfLines={1}>
                    {p.tasks.map((t) => t.taskNumber).join(' + ')}
                  </Muted>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setPoolForm({ pool: null })}
              style={{ minWidth: 130, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.faint, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
            >
              <Ionicons name="add" size={16} color={colors.muted} />
              <T w="s" size={13} color={colors.muted}>
                New pool
              </T>
            </Pressable>
          </ScrollView>
          {!pool ? (
            <EmptyCard
              icon="time-outline"
              title="No hour pool yet"
              body="Create a pool for the hours this customer has bought, and pick the tasks that share it."
              style={{ marginTop: 16 }}
            />
          ) : (
            <PoolPanel key={pool.id} clientId={clientId} pool={pool} today={q.data.today} onEdit={() => setPoolForm({ pool })} />
          )}
        </>
      )}
      {poolForm ? (
        <PoolFormSheet
          pool={poolForm.pool}
          tasks={boardTasks.map((t) => ({ id: t.id, taskNumber: t.taskNumber, title: t.title }))}
          saving={savePool.isPending}
          onClose={() => setPoolForm(null)}
          onSave={(body) => savePool.mutate({ id: poolForm.pool?.id, body })}
        />
      ) : null}
    </Screen>
  );
}

function monthLine(used: number, usual: number, max: number, available: number): string {
  if (used >= max) return `${max} h monthly maximum reached`;
  const poolLimited = available < round2(max - used) ? ' (limited by the pool balance)' : '';
  if (used < usual) return `${hoursLabel(round2(usual - used))} left of the usual ${usual} h · up to ${max} h if needed${poolLimited}`;
  return `Usual ${usual} h used · ${hoursLabel(available)} more allowed, up to the ${max} h maximum${poolLimited}`;
}

function PoolPanel({ clientId, pool, today, onEdit }: { clientId: string; pool: TimeSheetPool; today: string; onEdit: () => void }) {
  const api = useAdminApi(clientId);
  const qc = useQueryClient();
  const { user } = useAuth();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin-tasks', clientId, 'timesheet'] });
  const s = useMemo(() => summarisePool(pool, pool.entries, today, pool.approvals), [pool, today]);
  const cur = s.current;
  const labels = useMemo(() => new Map(pool.tasks.map((t) => [t.taskId, t.label?.trim() || t.taskNumber])), [pool.tasks]);
  const taskName = (id: string) => labels.get(id) ?? id;
  const multi = pool.tasks.length > 1;

  const entries = useMemo(() => [...pool.entries].sort((a, b) => b.date.localeCompare(a.date)), [pool.entries]);
  const months = useMemo(() => Array.from(new Set(entries.map((e) => e.date.slice(0, 7)))), [entries]);
  const [month, setMonth] = useState('all');
  const [tab, setTab] = useState<'entries' | 'monthly'>('entries');
  const [form, setForm] = useState<{ entry: TimeSheetEntry | null } | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState<TimeSheetEntry | null>(null);

  const pending = entries.filter((e) => e.status === 'PENDING').length;
  const withAdmin = entries.filter((e) => e.status === 'ADMIN_PENDING').length;
  const shown = month === 'all' ? entries : entries.filter((e) => e.date.startsWith(month));
  const shownActual = shown.reduce((n, e) => n + (counts(e) ? e.actualHours : 0), 0);
  const cardRow = month === 'all' ? cur : s.rows.find((r) => r.month === month) ?? cur;
  const cardAvailable = !cardRow
    ? 0
    : cardRow.status === 'current'
      ? s.availableThisMonth
      : round2(Math.max(0, Math.min(pool.monthlyMax - cardRow.used, Math.max(0, s.balance) + s.extraRemaining)));
  const terms = `${pool.poolHours} h pool shared by ${pool.tasks.map((t) => taskName(t.taskId)).join(' + ')} · ${pool.monthlyHours} h a month, up to ${pool.monthlyMax} h in a month if needed · ${money(pool.extraRate)}/h beyond the pool`;

  const saveEntry = useMutation({
    mutationFn: (v: { id?: string; body: TimeSheetEntryInput }) => (v.id ? api.updateTimeSheetEntry(pool.id, v.id, v.body) : api.addTimeSheetEntry(pool.id, v.body)),
    onSuccess: (_r, v) => {
      refresh();
      setForm(null);
      Alert.alert(v.id ? 'Entry updated' : 'Time logged', v.id ? 'Sent to the client for approval again.' : undefined);
    },
    onError: onErr('Not saved'),
  });
  const deleteEntry = useMutation({ mutationFn: (id: string) => api.deleteTimeSheetEntry(pool.id, id), onSuccess: refresh, onError: onErr('Not deleted') });
  const adminDecide = useMutation({
    mutationFn: (v: { id: string; decision: 'APPROVED' | 'REJECTED'; reason?: string }) => decideTimeSheetRequest(v.id, { decision: v.decision, reason: v.reason }),
    onSuccess: () => {
      refresh();
      setRejecting(null);
    },
    onError: onErr('Not saved'),
  });
  const approve = useMutation({
    mutationFn: (body: { hours: number; reference?: string }) => api.approveTimeSheetExtra(pool.id, body),
    onSuccess: () => {
      refresh();
      setApproving(false);
    },
    onError: onErr('Not approved'),
  });

  return (
    <>
      <T w="s" size={17} style={{ marginTop: 16 }}>
        {pool.name}
      </T>
      <Muted size={12.5} style={{ marginTop: 2, lineHeight: 18 }}>
        {dayLabel(pool.termStart)} – {dayLabel(pool.termEnd)} · {terms}
      </Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <SmallBtn title="Log time" icon="add" tone="primary" onPress={() => setForm({ entry: null })} />
        <SmallBtn title="Approve extra hours" icon="add-circle-outline" onPress={() => setApproving(true)} />
        <SmallBtn title="Edit pool" icon="create-outline" onPress={onEdit} />
        <SmallBtn
          title="Export CSV"
          icon="download-outline"
          onPress={() => void shareTextFile(`${pool.name.replace(/[^\w.-]+/g, '-')}-time-sheet.csv`, timeSheetCsv([...entries].reverse(), taskName))}
        />
      </View>

      {withAdmin > 0 ? (
        <Notice tone="blue">
          {withAdmin} {withAdmin === 1 ? 'request is' : 'requests are'} over the monthly maximum and waiting for your approval. They don't count until approved; then they go to the client.
        </Notice>
      ) : null}
      {pending > 0 ? (
        <Notice tone="amber">
          {pending} {pending === 1 ? 'entry is' : 'entries are'} waiting for the client's approval. They count against the pool until the client decides; rejected entries stop counting.
        </Notice>
      ) : null}
      {s.workPaused ? (
        <Notice tone="red">Pool used up. Work pauses until extra hours are approved at {money(pool.extraRate)}/h. P1 fixes for EG Eloma's own code continue.</Notice>
      ) : null}
      {s.poolExhausted && !s.workPaused ? (
        <Notice tone="blue">
          Using approved extra hours: {hoursLabel(s.extraRemaining)} left of {hoursLabel(s.extraApproved)} approved, billed at {money(pool.extraRate)}/h on the next monthly invoice.
        </Notice>
      ) : null}
      {s.extraUnapproved > 0 ? (
        <Notice tone="red">{hoursLabel(s.extraUnapproved)} logged beyond the pool without approval. The client needs to approve these hours before they can be invoiced.</Notice>
      ) : null}
      {cur && cur.overMonthlyMax > 0 ? (
        <Notice tone="red">
          {monthLabel(cur.month)} is {hoursLabel(cur.overMonthlyMax)} over the {pool.monthlyMax} h monthly maximum. Move that work to next month.
        </Notice>
      ) : null}
      {cur && cur.monthlyAlert && cur.overMonthlyMax === 0 && cur.overMonthlyHours === 0 ? (
        <Notice tone="amber">
          Monthly alert: {hoursLabel(cur.used)} used in {monthLabel(cur.month)} (alert at {pool.monthlyAlertAt} h, maximum {pool.monthlyMax} h).
        </Notice>
      ) : null}
      {!s.poolExhausted && s.totalUsed >= pool.poolAlertAt ? (
        <Notice tone="amber">
          Pool alert: {hoursLabel(s.totalUsed)} of {pool.poolHours} h used ({Math.round((s.totalUsed / pool.poolHours) * 100)}%).
        </Notice>
      ) : null}

      <Stat
        label={cardRow ? `${cardRow.status === 'current' ? 'This month' : cardRow.status === 'closed' ? 'Past month' : 'Upcoming month'} · ${monthLabel(cardRow.month)}` : 'This month'}
        value={cardRow ? `${hoursLabel(cardRow.used)} / ${pool.monthlyHours} h` : '—'}
        sub={!cardRow ? 'Outside the term' : cardRow.status === 'closed' ? `Closed · up to ${pool.monthlyMax} h was allowed` : monthLine(cardRow.used, pool.monthlyHours, pool.monthlyMax, cardAvailable)}
      >
        {cardRow ? (
          <Meter value={cardRow.used} max={pool.monthlyMax} tone={cardRow.used >= pool.monthlyMax ? 'red' : cardRow.used > pool.monthlyHours || cardRow.used >= pool.monthlyAlertAt ? 'amber' : 'navy'} />
        ) : null}
      </Stat>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Stat label="Pool balance" value={hoursLabel(Math.max(0, s.balance))} sub={`of ${pool.poolHours} h`}>
            <Meter value={Math.max(0, s.balance)} max={pool.poolHours} tone="green" />
          </Stat>
        </View>
        <View style={{ flex: 1 }}>
          <Stat label="Used to date" value={hoursLabel(s.totalUsed)} sub={`Alert at ${pool.poolAlertAt} h`}>
            <Meter value={s.totalUsed} max={pool.poolHours} tone={s.totalUsed >= pool.poolAlertAt ? 'amber' : 'navy'} />
          </Stat>
        </View>
      </View>
      <Stat
        label="Extra hours"
        value={s.extraApproved > 0 ? `${hoursLabel(s.extraHours)} / ${hoursLabel(s.extraApproved)}` : hoursLabel(s.extraHours)}
        sub={
          s.extraApproved > 0
            ? `${money(s.extraCharge)} so far · ${hoursLabel(s.extraRemaining)} approved hours left`
            : s.extraHours > 0
              ? `${money(s.extraCharge)} at ${money(pool.extraRate)}/h`
              : `None approved · ${money(pool.extraRate)}/h if the pool runs out`
        }
      >
        {s.extraApproved > 0 ? <Meter value={s.extraHours} max={s.extraApproved} tone={s.extraRemaining <= 0 ? 'red' : 'navy'} /> : null}
      </Stat>

      <View style={{ marginTop: 14 }}>
        <Tabs
          tabs={[
            { key: 'entries', label: 'Entries' },
            { key: 'monthly', label: 'Monthly summary' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'entries' ? (
        <>
          <View style={{ marginTop: 12 }}>
            <SelectRow value={month} onChange={(v) => setMonth(v || 'all')} options={[{ value: 'all', label: 'All months' }, ...months.map((m) => ({ value: m, label: monthLabel(m) }))]} />
          </View>
          {shown.length === 0 ? (
            <Muted size={13} style={{ textAlign: 'center', marginTop: 20 }}>
              No time logged{month !== 'all' ? ` in ${monthLabel(month)}` : ''}.
            </Muted>
          ) : (
            shown.map((e) => {
              const rejected = e.status === 'REJECTED' || e.status === 'ADMIN_REJECTED';
              return (
                <Card key={e.id} style={{ padding: 13, marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Muted size={12.5} style={{ flex: 1 }}>
                      {rangeLabel(e.date, e.endDate)}
                    </Muted>
                    <T w="b" size={15} color={counts(e) ? colors.fg : colors.muted} style={rejected ? { textDecorationLine: 'line-through' } : undefined}>
                      {e.actualHours.toFixed(2)} h
                    </T>
                  </View>
                  <T w="s" size={14} style={{ marginTop: 4 }}>
                    {e.description}
                  </T>
                  <Muted size={12}>
                    {e.category} · {e.staff}
                    {multi ? ` · ${taskName(e.taskId)}` : ''}
                    {e.notes ? ` · ${e.notes}` : ''}
                  </Muted>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
                    <Tag tone={PRIORITY_TONE[e.priority] ?? 'grey'} label={e.priority} />
                    <Tag tone={STATUS_TONE[e.status] ?? 'amber'} label={ENTRY_STATUS_LABEL[e.status] ?? e.status} />
                    <T mono size={11} color={colors.muted}>
                      {e.requestId}
                    </T>
                  </View>
                  {rejected && e.rejectReason ? (
                    <T size={12.5} color={colors.redFg} style={{ marginTop: 6 }}>
                      Reason: {e.rejectReason}
                    </T>
                  ) : null}
                  {e.decidedBy && e.status !== 'PENDING' && e.status !== 'ADMIN_PENDING' ? <Muted size={12}>by {e.decidedBy}</Muted> : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {e.status === 'ADMIN_PENDING' ? (
                      <>
                        <SmallBtn title="Approve" icon="checkmark" tone="good" disabled={adminDecide.isPending} onPress={() => adminDecide.mutate({ id: e.id, decision: 'APPROVED' })} />
                        <SmallBtn title="Reject" icon="close" tone="danger" disabled={adminDecide.isPending} onPress={() => setRejecting(e)} />
                      </>
                    ) : null}
                    <SmallBtn title="Edit" icon="create-outline" onPress={() => setForm({ entry: e })} />
                    <SmallBtn
                      title="Delete"
                      icon="trash-outline"
                      tone="danger"
                      onPress={() =>
                        confirmDestroy('Delete this time entry?', `${e.requestId} — ${e.actualHours} h · ${e.description}. Its hours go back to the pool. This cannot be undone.`, () =>
                          deleteEntry.mutate(e.id)
                        )
                      }
                    />
                  </View>
                </Card>
              );
            })
          )}
          {shown.length ? (
            <Muted size={12.5} style={{ marginTop: 10, textAlign: 'right' }}>
              {shown.length} {shown.length === 1 ? 'entry' : 'entries'} · {shownActual.toFixed(2)} h counted
            </Muted>
          ) : null}
        </>
      ) : (
        <MonthlySummary pool={pool} summary={s} taskName={taskName} />
      )}
      <Muted size={12} style={{ marginTop: 14 }}>
        Issues that span the website and backend are logged to the task whose code caused them.
      </Muted>

      {form ? (
        <LogTimeSheet
          pool={pool}
          summary={form.entry ? summarisePool(pool, pool.entries.filter((x) => x.id !== form.entry!.id), today, pool.approvals) : s}
          today={today}
          tasks={pool.tasks.map((t) => ({ id: t.taskId, name: taskName(t.taskId) }))}
          entry={form.entry}
          saving={saveEntry.isPending}
          onClose={() => setForm(null)}
          onSave={(body) => saveEntry.mutate({ id: form.entry?.id, body })}
        />
      ) : null}
      {approving ? (
        <ApproveExtraSheet pool={pool} approverName={displayName(user)} saving={approve.isPending} onClose={() => setApproving(false)} onSave={(b) => approve.mutate(b)} />
      ) : null}
      {rejecting ? (
        <RejectSheet entry={rejecting} saving={adminDecide.isPending} onClose={() => setRejecting(null)} onReject={(reason) => adminDecide.mutate({ id: rejecting.id, decision: 'REJECTED', reason })} />
      ) : null}
    </>
  );
}

function MonthlySummary({ pool, summary, taskName }: { pool: TimeSheetPool; summary: Summary; taskName: (id: string) => string }) {
  const multi = pool.tasks.length > 1;
  const total = pool.approvals.reduce((n, a) => n + a.hours, 0);
  return (
    <>
      {summary.rows.map((r) => {
        const upcoming = r.status === 'upcoming';
        return (
          <Card key={r.month} style={[{ padding: 12, marginTop: 10 }, r.status === 'current' && { borderColor: colors.green2, backgroundColor: colors.greenTint }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T w="s" size={14} color={upcoming ? colors.muted : colors.fg} style={{ flex: 1 }}>
                {monthLabel(r.month)}
              </T>
              {r.status === 'current' ? <Tag tone="green" label="Current" /> : null}
            </View>
            {upcoming ? (
              <Muted size={12.5}>Upcoming</Muted>
            ) : (
              <>
                <Muted size={12.5} style={{ marginTop: 2 }}>
                  Used {r.used.toFixed(1)} / {pool.monthlyHours} h · balance {(r.status === 'current' ? r.balanceStart - r.used : r.balanceEnd).toFixed(1)} h
                  {r.extraHours > 0 ? ` · extra ${r.extraHours.toFixed(1)} h (${money(r.extraCharge)})` : ''}
                </Muted>
                {multi ? (
                  <Muted size={12}>
                    {pool.taskIds.map((id) => `${taskName(id)} ${(r.usedByTask[id] ?? 0).toFixed(1)}`).join(' · ')}
                  </Muted>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {r.overMonthlyMax > 0 ? <Tag tone="red" label="Over max" /> : null}
                  {r.overMonthlyHours > 0 && r.overMonthlyMax === 0 ? <Tag tone="amber" label={`Over ${pool.monthlyHours} h`} /> : null}
                  {r.monthlyAlert ? <Tag tone="amber" label={`${pool.monthlyAlertAt} h alert`} /> : null}
                  {r.poolAlert ? <Tag tone="amber" label={`${Math.round((pool.poolAlertAt / pool.poolHours) * 100)}% pool`} /> : null}
                </View>
              </>
            )}
          </Card>
        );
      })}
      {pool.approvals.length ? (
        <>
          <Label style={{ marginTop: 18 }}>Approved extra hours</Label>
          <Card>
            {pool.approvals.map((a, i) => (
              <View key={a.id} style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T w="s" size={14}>
                    {hoursLabel(a.hours)}
                  </T>
                  <Muted size={12.5}>up to {money(a.hours * pool.extraRate)}</Muted>
                </View>
                <Muted size={12}>
                  {dayLabel(a.date)} · approved by {a.approvedBy}
                  {a.reference ? ` · ${a.reference}` : ''}
                </Muted>
              </View>
            ))}
            <View style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', justifyContent: 'space-between' }}>
              <T w="s" size={13.5}>
                Total approved {hoursLabel(total)}
              </T>
              <Muted size={12.5}>up to {money(total * pool.extraRate)}</Muted>
            </View>
          </Card>
        </>
      ) : null}
    </>
  );
}

function LogTimeSheet({
  pool,
  summary,
  today,
  tasks,
  entry,
  saving,
  onSave,
  onClose,
}: {
  pool: TimeSheetPool;
  summary: Summary;
  today: string;
  tasks: { id: string; name: string }[];
  entry: TimeSheetEntry | null;
  saving: boolean;
  onSave: (body: TimeSheetEntryInput) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState(() =>
    entry
      ? {
          date: entry.date,
          endDate: entry.endDate,
          taskId: entry.taskId,
          requestId: entry.requestId,
          priority: entry.priority,
          category: entry.category,
          description: entry.description,
          staff: entry.staff,
          actualHours: String(entry.actualHours),
          notes: entry.notes ?? '',
        }
      : {
          date: today,
          endDate: today,
          taskId: tasks[tasks.length - 1]?.id ?? '',
          requestId: newRequestId(),
          priority: 'P4',
          category: '',
          description: '',
          staff: '',
          actualHours: '',
          notes: '',
        }
  );
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const legacyId = !/^REQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(f.requestId);
  const actual = parseFloat(f.actualHours.replace(',', '.'));
  const hours = Number.isFinite(actual) ? actual : 0;
  const month = summary.rows.find((r) => r.month === f.date.slice(0, 7));
  const after = (month?.used ?? 0) + hours;
  const outside = f.date < pool.termStart || f.endDate > pool.termEnd;
  const backwards = !!f.endDate && f.endDate < f.date;
  const overMax = !!month && after > pool.monthlyMax;
  const available = Math.max(0, summary.balance) + summary.extraRemaining;
  const needsApproval = hours > available && f.priority !== 'P1';
  const filled =
    !outside && !backwards && !!f.endDate && !!f.category && !!f.taskId && !!f.requestId.trim() && !!f.description.trim() && !!f.staff.trim() && Number.isFinite(actual) && actual >= 0;
  const staffOptions = [...TIME_STAFF, ...(f.staff && !(TIME_STAFF as readonly string[]).includes(f.staff) ? [f.staff] : [])];

  return (
    <Sheet open onClose={onClose}>
      <T w="s" size={17}>
        {entry ? 'Edit entry' : 'Log time'}
      </T>
      {entry ? <Muted size={12.5}>Saving sends it to the client for approval again.</Muted> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>Start date</Label>
          <DateRow value={f.date} clearable={false} min={pool.termStart} max={pool.termEnd} onChange={(v) => set({ date: v, endDate: f.endDate < v ? v : f.endDate })} />
        </View>
        <View style={{ flex: 1 }}>
          <Label>End date</Label>
          <DateRow value={f.endDate} clearable={false} min={f.date} max={pool.termEnd} onChange={(v) => set({ endDate: v })} />
        </View>
      </View>
      {tasks.length > 1 ? (
        <>
          <Label>Task</Label>
          <SelectRow value={f.taskId} onChange={(v) => v && set({ taskId: v })} options={tasks.map((t) => ({ value: t.id, label: t.name }))} />
        </>
      ) : null}
      <Label>Request ID</Label>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Card style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12 }}>
          <T mono size={13}>
            {f.requestId}
          </T>
        </Card>
        <SmallBtn title="New" icon="refresh" onPress={() => set({ requestId: newRequestId() })} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>Priority</Label>
          <SelectRow value={f.priority} onChange={(v) => v && set({ priority: v })} options={TIME_PRIORITIES.map((p) => ({ value: p, label: p }))} />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Category</Label>
          <SelectRow value={f.category} onChange={(v) => v && set({ category: v })} placeholder="Select" options={TIME_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>Staff</Label>
          <SelectRow value={f.staff} onChange={(v) => v && set({ staff: v })} placeholder="Select" options={staffOptions.map((c) => ({ value: c, label: c }))} />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Hours</Label>
          <Input value={f.actualHours} onChangeText={(v) => set({ actualHours: v })} keyboardType="decimal-pad" placeholder="e.g. 1.5" />
        </View>
      </View>
      <Label>Description</Label>
      <Input value={f.description} onChangeText={(v) => set({ description: v })} placeholder="Describe the work" maxLength={500} />
      <Label>Notes (optional)</Label>
      <Input value={f.notes} onChangeText={(v) => set({ notes: v })} multiline maxLength={1000} />

      {legacyId ? <Notice tone="amber">This entry's old request ID is not in the REQ-XXXX-XXXX format — tap New to make one before saving.</Notice> : null}
      {backwards ? <Notice tone="red">The end date must not be before the start date.</Notice> : null}
      {outside ? (
        <Notice tone="red">
          These dates are outside the term ({dayLabel(pool.termStart)} – {dayLabel(pool.termEnd)}).
        </Notice>
      ) : null}
      {needsApproval ? (
        <Notice tone="red">
          Only {hoursLabel(available)} is left in the pool and approved extra hours. The client needs to approve at least {hoursLabel(round2(hours - available))} more before this can be logged (P1 fixes are exempt).
        </Notice>
      ) : null}
      {overMax && month ? (
        <Notice tone="amber">
          This takes {monthLabel(month.month)} to {hoursLabel(after)}, over the {pool.monthlyMax} h monthly maximum. As the admin you can log it; it goes to the client for approval.
        </Notice>
      ) : null}
      {!overMax && month && after > pool.monthlyHours && month.used <= pool.monthlyHours ? (
        <Notice tone="amber">
          This takes {monthLabel(month.month)} past the usual {pool.monthlyHours} h, to {hoursLabel(after)} (up to {pool.monthlyMax} h allowed if needed).
        </Notice>
      ) : null}
      {!overMax && month && after >= pool.monthlyAlertAt && month.used < pool.monthlyAlertAt ? <Notice tone="amber">Saving this crosses the {pool.monthlyAlertAt} h monthly alert.</Notice> : null}
      {actual === 0 ? <Notice tone="blue">0 h entries record work logged on another task (for example, a backend cause found while working a website ticket).</Notice> : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Btn title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
        <Btn
          title={entry ? 'Save & send' : 'Save entry'}
          style={{ flex: 1 }}
          loading={saving}
          disabled={!filled || legacyId || needsApproval}
          onPress={() =>
            onSave({
              date: f.date,
              endDate: f.endDate,
              taskId: f.taskId,
              requestId: f.requestId.trim(),
              priority: f.priority,
              category: f.category,
              description: f.description.trim(),
              staff: f.staff.trim(),
              actualHours: actual,
              notes: f.notes.trim() || undefined,
            })
          }
        />
      </View>
    </Sheet>
  );
}

function RejectSheet({ entry, saving, onReject, onClose }: { entry: TimeSheetEntry; saving: boolean; onReject: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Sheet open onClose={onClose}>
      <T w="s" size={17}>
        Reject time entry
      </T>
      <Muted size={13} style={{ marginTop: 4 }}>
        {entry.requestId} — {hoursLabel(entry.actualHours)} · {entry.description}
      </Muted>
      <Label>Why are you rejecting it?</Label>
      <Input value={reason} onChangeText={setReason} multiline autoFocus maxLength={1000} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Btn title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
        <Btn title="Reject" style={{ flex: 1, backgroundColor: colors.red, borderColor: colors.red }} loading={saving} disabled={!reason.trim()} onPress={() => onReject(reason.trim())} />
      </View>
    </Sheet>
  );
}

function ApproveExtraSheet({
  pool,
  approverName,
  saving,
  onSave,
  onClose,
}: {
  pool: TimeSheetPool;
  approverName: string;
  saving: boolean;
  onSave: (b: { hours: number; reference?: string }) => void;
  onClose: () => void;
}) {
  const [hours, setHours] = useState('10');
  const [reference, setReference] = useState('');
  const [agreed, setAgreed] = useState(false);
  const h = parseFloat(hours.replace(',', '.'));
  const valid = Number.isFinite(h) && h > 0;
  return (
    <Sheet open onClose={onClose}>
      <T w="s" size={17}>
        Approve extra hours
      </T>
      <Label>Hours</Label>
      <Input value={hours} onChangeText={setHours} keyboardType="decimal-pad" />
      <Muted size={12.5} style={{ marginTop: 6 }}>
        Rate {money(pool.extraRate)}/h · up to {valid ? money(h * pool.extraRate) : '—'}
      </Muted>
      <Label>Reference (optional)</Label>
      <Input value={reference} onChangeText={setReference} placeholder="Quote or request ID" maxLength={120} />
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 14 }}>
        <Toggle value={agreed} onChange={setAgreed} />
        <T size={13} style={{ flex: 1, lineHeight: 18 }}>
          I{approverName ? ` (${approverName})` : ''} approve up to {valid ? hoursLabel(h) : 'these hours'} beyond the pool at {money(pool.extraRate)}/h. Only hours actually used are invoiced, on the next
          monthly invoice. Approved hours end with the term on {dayLabel(pool.termEnd)}.
        </T>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Btn title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
        <Btn title="Approve" style={{ flex: 1 }} loading={saving} disabled={!valid || !agreed} onPress={() => onSave({ hours: h, reference: reference.trim() || undefined })} />
      </View>
    </Sheet>
  );
}

function PoolFormSheet({
  pool,
  tasks,
  saving,
  onSave,
  onClose,
}: {
  pool: TimeSheetPool | null;
  tasks: { id: string; taskNumber: string; title: string }[];
  saving: boolean;
  onSave: (body: TimeSheetPoolInput) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState(() => ({
    name: pool?.name ?? '',
    termStart: pool?.termStart ?? '',
    termEnd: pool?.termEnd ?? '',
    poolHours: String(pool?.poolHours ?? ''),
    monthlyHours: String(pool?.monthlyHours ?? ''),
    monthlyMax: String(pool?.monthlyMax ?? ''),
    monthlyAlertAt: String(pool?.monthlyAlertAt ?? ''),
    poolAlertAt: String(pool?.poolAlertAt ?? ''),
    extraRate: String(pool?.extraRate ?? ''),
  }));
  const [picked, setPicked] = useState<Record<string, string>>(() => Object.fromEntries((pool?.tasks ?? []).map((t) => [t.taskId, t.label ?? ''])));
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const n = (v: string) => parseFloat(v.replace(',', '.'));
  const nums = ['poolHours', 'monthlyHours', 'monthlyMax', 'monthlyAlertAt', 'poolAlertAt', 'extraRate'] as const;
  const ready =
    !!f.name.trim() &&
    !!f.termStart &&
    !!f.termEnd &&
    f.termEnd >= f.termStart &&
    nums.every((k) => Number.isFinite(n(f[k]))) &&
    n(f.monthlyHours) > 0 &&
    n(f.monthlyHours) <= n(f.monthlyMax) &&
    Object.keys(picked).length > 0;
  const num = (label: string, k: (typeof nums)[number], hint?: string) => (
    <View style={{ width: '48%' }}>
      <Label>{label}</Label>
      <Input value={f[k]} onChangeText={(v) => set({ [k]: v } as Partial<typeof f>)} keyboardType="decimal-pad" />
      {hint ? (
        <Muted size={11} style={{ marginTop: 3 }}>
          {hint}
        </Muted>
      ) : null}
    </View>
  );
  return (
    <Sheet open onClose={onClose}>
      <T w="s" size={17}>
        {pool ? 'Edit hour pool' : 'New hour pool'}
      </T>
      <Label>Name</Label>
      <Input value={f.name} onChangeText={(v) => set({ name: v })} placeholder="e.g. 3two1.com.au website" maxLength={120} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>Term start</Label>
          <DateRow value={f.termStart} onChange={(v) => set({ termStart: v })} clearable={false} placeholder="Start" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Term end</Label>
          <DateRow value={f.termEnd} onChange={(v) => set({ termEnd: v })} clearable={false} placeholder="End" min={f.termStart || undefined} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {num('Pool hours', 'poolHours')}
        {num('Monthly hours (h)', 'monthlyHours', 'Hours normally used in a month, e.g. 30')}
        {num('Max in a month (h)', 'monthlyMax', 'If needed, e.g. 80')}
        {num('Monthly alert at (h)', 'monthlyAlertAt')}
        {num('Pool alert at (h)', 'poolAlertAt')}
        {num('Extra-hour rate ($/h)', 'extraRate')}
      </View>
      <Label>Tasks that share this pool</Label>
      {tasks.length === 0 ? <Muted size={13}>This customer has no tasks yet.</Muted> : null}
      {tasks.map((t) => {
        const on = t.id in picked;
        return (
          <View key={t.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
            <Pressable
              onPress={() =>
                setPicked((p) => {
                  const next = { ...p };
                  if (on) delete next[t.id];
                  else next[t.id] = '';
                  return next;
                })
              }
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.green : colors.faint} />
              <T mono size={11.5} color={colors.muted}>
                {t.taskNumber}
              </T>
              <T size={14} style={{ flex: 1 }} numberOfLines={1}>
                {t.title}
              </T>
            </Pressable>
            {on ? (
              <Input value={picked[t.id]} onChangeText={(v) => setPicked((p) => ({ ...p, [t.id]: v }))} placeholder="Short label, e.g. Redesign" style={{ marginTop: 8, minHeight: 40 }} maxLength={60} />
            ) : null}
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Btn title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
        <Btn
          title={pool ? 'Save pool' : 'Create pool'}
          style={{ flex: 1 }}
          loading={saving}
          disabled={!ready}
          onPress={() =>
            onSave({
              name: f.name.trim(),
              termStart: f.termStart,
              termEnd: f.termEnd,
              poolHours: n(f.poolHours),
              monthlyHours: n(f.monthlyHours),
              monthlyMax: n(f.monthlyMax),
              monthlyAlertAt: n(f.monthlyAlertAt),
              poolAlertAt: n(f.poolAlertAt),
              extraRate: n(f.extraRate),
              tasks: Object.entries(picked).map(([taskId, label]) => ({ taskId, label: label.trim() || null })),
            })
          }
        />
      </View>
    </Sheet>
  );
}
