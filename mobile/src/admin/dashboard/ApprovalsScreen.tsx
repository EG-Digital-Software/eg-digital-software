import React, { useState } from 'react';
import { Alert, View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import {
  approvalsApi,
  type ApprovalStatus,
  type PendingUser,
  type RegistrationRole,
  type TimeSheetRequest,
  type TimeSheetTab,
} from '../../api/admin/dashboard';
import { useAuth } from '../../context/AuthContext';
import { fmtDate } from '../../lib/portal';
import {
  Avatar,
  Btn,
  Card,
  Chips,
  EmptyCard,
  ErrorBox,
  Loading,
  Muted,
  Pill,
  Screen,
  SearchField,
  Sheet,
  T,
  s as ui,
  type IconName,
  type PillKind,
} from '../../ui';
import { colors } from '../../theme';
import { dayLabel, Field, hoursLabel, monthLabel, rangeLabel, Segs, useDebounced } from './common';
import { AddEmployeeSheet, EditEmployeeSheet, EmployeePasswordSheet } from './employeeSheets';

type View_ = 'registrations' | 'timesheet';

const ROLE: Record<RegistrationRole, { label: string; kind: PillKind; fill: string }> = {
  CLIENT: { label: 'Customer', kind: 'on', fill: '#7FF0C2' },
  SUPPLIER: { label: 'Supplier', kind: 'warn', fill: '#FFCB80' },
  EMPLOYEE: { label: 'Team', kind: 'info', fill: '#9FE2FF' },
};

const STATUS: Record<ApprovalStatus, { label: string; kind: PillKind }> = {
  APPROVED: { label: 'Approved', kind: 'ok' },
  PENDING: { label: 'Pending', kind: 'warn' },
  REJECTED: { label: 'Rejected', kind: 'red' },
};

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

const PAGE = 20;

/** Approvals: sign-up requests, and Time Sheet entries over a pool's monthly maximum. */
export default function ApprovalsScreen() {
  const route = useRoute<any>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const qc = useQueryClient();
  const initialRole: RegistrationRole | '' = route.params?.role ?? '';
  const [view, setView] = useState<View_>(route.params?.view === 'timesheet' || !isAdmin ? 'timesheet' : 'registrations');
  const [refreshing, setRefreshing] = useState(false);

  const tsPending = useQuery({
    queryKey: ['admin-approvals', 'timesheet', 'ADMIN_PENDING'],
    queryFn: () => approvalsApi.timeSheetRequests('ADMIN_PENDING'),
    refetchInterval: 30_000,
  });
  const regPending = useQuery({
    queryKey: ['admin-approvals', 'count'],
    queryFn: approvalsApi.pendingCount,
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const refresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['admin-approvals'] });
    setRefreshing(false);
  };

  return (
    <Screen title="Approvals" back refreshing={refreshing} onRefresh={refresh}>
      {isAdmin ? (
        <Segs
          options={[
            { value: 'registrations', label: 'Registrations', badge: regPending.data || undefined },
            { value: 'timesheet', label: 'Time Sheet', badge: tsPending.data?.length || undefined },
          ]}
          value={view}
          onChange={setView}
        />
      ) : null}
      <Muted size={13} style={{ marginTop: 12, lineHeight: 19 }}>
        {view === 'timesheet'
          ? "Time logged by the team over a pool's monthly maximum. Approve it to count the hours and send it to the client."
          : 'Review Customer and Team sign-up requests, and manage access after the fact.'}
      </Muted>
      {view === 'registrations' && isAdmin ? <Registrations initialRole={initialRole} /> : <TimeSheetRequests />}
    </Screen>
  );
}

// ─── Registrations ────────────────────────────────────────

function Registrations({ initialRole }: { initialRole: RegistrationRole | '' }) {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialRole ? 'ALL' : 'PENDING');
  const [role, setRole] = useState<RegistrationRole | ''>(initialRole);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const [acting, setActing] = useState<PendingUser | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PendingUser | null>(null);
  const [pw, setPw] = useState<PendingUser | null>(null);

  const status = tab === 'ALL' ? undefined : tab;
  const q = useInfiniteQuery({
    queryKey: ['admin-approvals', 'registrations', { status, role, search: debounced }],
    queryFn: ({ pageParam }) => approvalsApi.registrations({ page: pageParam, pageSize: PAGE, status, role, search: debounced }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-approvals'] });

  const approve = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: () => {
      invalidate();
      Alert.alert('Account approved', 'The user can now sign in.');
    },
    onError: (e) => Alert.alert('Not approved', errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      invalidate();
      Alert.alert('Access revoked', 'They can no longer sign in. You can re-approve them later.');
    },
    onError: (e) => Alert.alert('Not rejected', errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => approvalsApi.remove(id),
    onSuccess: () => {
      invalidate();
      Alert.alert('Account deleted');
    },
    onError: (e) => Alert.alert('Not deleted', errorMessage(e)),
  });

  const confirmReject = (u: PendingUser) => {
    const name = `${u.firstName} ${u.lastName} (${u.email})`;
    const revoke = u.approvalStatus === 'APPROVED';
    Alert.alert(
      revoke ? 'Revoke access?' : 'Reject this request?',
      revoke
        ? `${name} will be signed out of the ${ROLE[u.role].label.toLowerCase()} portal and blocked from signing in again. You can re-approve them later.`
        : `${name} will not be able to sign in. You can re-approve them later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: revoke ? 'Revoke access' : 'Reject', style: 'destructive', onPress: () => reject.mutate(u.id) },
      ]
    );
  };

  const confirmDelete = (u: PendingUser) =>
    Alert.alert(
      'Delete this account?',
      `${u.firstName} ${u.lastName} (${u.email}) will be permanently deleted and can never sign in again. This cannot be undone.${
        u.role === 'CLIENT' ? ' Their company record, invoices and products are kept — only the login is removed.' : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete permanently', style: 'destructive', onPress: () => remove.mutate(u.id) },
      ]
    );

  const first = q.data?.pages[0];
  const counts = first?.meta.counts;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = first?.meta.total ?? 0;
  const filtered = !!(debounced || role);
  const busyId = (approve.isPending && approve.variables) || (reject.isPending && reject.variables) || (remove.isPending && remove.variables) || null;

  const actions = (u: PendingUser): { icon: IconName; label: string; red?: boolean; run: () => void }[] => {
    const out: { icon: IconName; label: string; red?: boolean; run: () => void }[] = [];
    if (u.approvalStatus === 'PENDING') {
      out.push({ icon: 'checkmark-circle-outline', label: 'Approve', run: () => approve.mutate(u.id) });
      out.push({ icon: 'close-circle-outline', label: 'Reject', run: () => confirmReject(u) });
    }
    if (u.approvalStatus === 'APPROVED') out.push({ icon: 'remove-circle-outline', label: 'Revoke access', run: () => confirmReject(u) });
    if (u.approvalStatus === 'REJECTED') out.push({ icon: 'refresh-outline', label: 'Re-approve', run: () => approve.mutate(u.id) });
    if (u.role === 'EMPLOYEE') {
      out.push({ icon: 'create-outline', label: 'Edit profile', run: () => setEditing(u) });
      out.push({ icon: 'key-outline', label: 'View or reset password', run: () => setPw(u) });
    }
    if (u.customer?.clientId) {
      const clientId = u.customer.clientId;
      out.push({ icon: 'business-outline', label: 'Open customer', run: () => nav.navigate('CustomerDetail', { clientId }) });
    }
    out.push({ icon: 'trash-outline', label: 'Delete account', red: true, run: () => confirmDelete(u) });
    return out;
  };

  return (
    <>
      <Btn title="Add employee" icon="person-add-outline" variant="dashed" onPress={() => setAdding(true)} style={{ marginTop: 14 }} />

      <View style={st.tiles}>
        {[
          { label: 'Pending', value: counts?.PENDING, color: colors.warnFg },
          { label: 'Approved', value: counts?.APPROVED, color: colors.okFg },
          { label: 'Rejected', value: counts?.REJECTED, color: colors.redFg },
        ].map((x) => (
          <Card key={x.label} style={st.tile}>
            <Muted w="s" size={11} style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {x.label}
            </Muted>
            <T w="b" size={24} color={x.color} style={{ marginTop: 4 }}>
              {x.value ?? '–'}
            </T>
          </Card>
        ))}
      </View>

      <Chips
        style={{ marginTop: 14 }}
        options={(
          [
            { value: 'PENDING', label: 'Pending' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
            { value: 'ALL', label: 'All' },
          ] as { value: Tab; label: string }[]
        ).map((t) => ({
          value: t.value,
          label: t.value !== 'ALL' && counts?.[t.value] ? `${t.label} ${counts[t.value]}` : t.label,
        }))}
        value={tab}
        onChange={setTab}
      />
      <SearchField value={search} onChangeText={setSearch} placeholder="Search by name or email…" style={{ marginTop: 12 }} />
      <Segs
        style={{ marginTop: 10 }}
        options={[
          { value: '' as const, label: 'All portals' },
          { value: 'CLIENT' as const, label: 'Customer' },
          { value: 'EMPLOYEE' as const, label: 'Team' },
        ]}
        value={role}
        onChange={setRole}
      />

      {tab === 'PENDING' && !!counts?.PENDING ? (
        <Pill
          kind="warn"
          label={`${counts.PENDING} ${counts.PENDING === 1 ? 'request' : 'requests'} awaiting review`}
          style={{ marginTop: 14 }}
        />
      ) : null}

      <View style={{ marginTop: 14, gap: 10 }}>
        {q.isError ? (
          <ErrorBox message={errorMessage(q.error, 'Could not load registrations')} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Loading />
        ) : !items.length ? (
          <>
            <EmptyCard
              icon="shield-checkmark-outline"
              title={filtered ? 'No matching requests' : 'Nothing here'}
              body={
                filtered
                  ? 'No request matches this search or portal filter.'
                  : tab === 'PENDING'
                    ? 'New sign-up requests will appear here for approval.'
                    : `No ${tab === 'ALL' ? '' : `${tab.toLowerCase()} `}requests yet.`
              }
            />
            {filtered ? (
              <Btn
                title="Clear filters"
                variant="ghost"
                onPress={() => {
                  setSearch('');
                  setRole('');
                }}
              />
            ) : null}
          </>
        ) : (
          <>
            {items.map((u) => (
              <RegistrationCard
                key={u.id}
                u={u}
                busy={busyId === u.id}
                onMore={() => setActing(u)}
                onApprove={() => approve.mutate(u.id)}
                onReject={() => confirmReject(u)}
              />
            ))}
            <Muted size={12} style={{ textAlign: 'center', marginTop: 4 }}>
              Showing {items.length} of {total}
            </Muted>
            {q.hasNextPage ? (
              <Btn title="Load more" variant="ghost" onPress={() => q.fetchNextPage()} loading={q.isFetchingNextPage} />
            ) : null}
          </>
        )}
      </View>

      <Sheet open={!!acting} onClose={() => setActing(null)}>
        {acting ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <Avatar name={`${acting.firstName} ${acting.lastName}`} size={42} fill={ROLE[acting.role]?.fill} />
              <View style={{ flex: 1 }}>
                <T w="s" size={16} numberOfLines={1}>
                  {acting.firstName} {acting.lastName}
                </T>
                <Muted size={13} numberOfLines={1}>
                  {acting.email}
                </Muted>
              </View>
            </View>
            {actions(acting).map((a) => (
              <Pressable
                key={a.label}
                onPress={() => {
                  setActing(null);
                  // Let this sheet slide away before a dialog or another sheet opens.
                  setTimeout(a.run, 350);
                }}
                style={({ pressed }) => [ui.opt, pressed && { backgroundColor: colors.soft2 }]}
              >
                <Ionicons name={a.icon} size={20} color={a.red ? colors.redFg : colors.fg} />
                <T w="s" size={14.5} color={a.red ? colors.redFg : colors.fg} style={{ flex: 1 }}>
                  {a.label}
                </T>
              </Pressable>
            ))}
          </>
        ) : null}
      </Sheet>

      <AddEmployeeSheet open={adding} onClose={() => setAdding(false)} onDone={invalidate} />
      <EditEmployeeSheet user={editing} onClose={() => setEditing(null)} onDone={invalidate} />
      <EmployeePasswordSheet user={pw} onClose={() => setPw(null)} />
    </>
  );
}

function RegistrationCard({
  u,
  busy,
  onMore,
  onApprove,
  onReject,
}: {
  u: PendingUser;
  busy: boolean;
  onMore: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const role = ROLE[u.role] ?? ROLE.CLIENT;
  const status = STATUS[u.approvalStatus] ?? STATUS.PENDING;
  return (
    <Card onPress={onMore} style={{ padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Avatar name={`${u.firstName} ${u.lastName}`} size={40} fill={role.fill} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w="s" size={15} numberOfLines={1}>
            {u.firstName} {u.lastName}
          </T>
          <Muted size={12.5} numberOfLines={1}>
            {u.email}
          </Muted>
          {u.designation ? (
            <T w="s" size={12} color={colors.infoFg} numberOfLines={1}>
              {u.designation}
            </T>
          ) : null}
        </View>
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.faint} />
      </View>
      <View style={st.pills}>
        <Pill kind={role.kind} label={role.label} style={st.pill} />
        <Pill kind={status.kind} label={status.label} style={st.pill} />
        {u.customer?.clientId ? <Pill kind="ns" label={u.customer.clientId} style={st.pill} /> : null}
        <Muted size={12} style={{ marginLeft: 'auto' }}>
          {fmtDate(u.createdAt)}
        </Muted>
      </View>
      {u.approvalStatus === 'PENDING' ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Btn title="Approve" icon="checkmark" onPress={onApprove} loading={busy} style={st.smallBtn} />
          <Btn title="Reject" icon="close" variant="ghost" onPress={onReject} disabled={busy} style={st.smallBtn} />
        </View>
      ) : null}
    </Card>
  );
}

// ─── Time Sheet requests ──────────────────────────────────

const CLIENT_STATUS: Record<string, { label: string; kind: PillKind }> = {
  PENDING: { label: 'With the client', kind: 'warn' },
  APPROVED: { label: 'Client approved', kind: 'ok' },
  REJECTED: { label: 'Client rejected', kind: 'red' },
};

function TimeSheetRequests() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TimeSheetTab>('ADMIN_PENDING');
  const [rejecting, setRejecting] = useState<TimeSheetRequest | null>(null);
  const [reason, setReason] = useState('');

  const q = useQuery({
    queryKey: ['admin-approvals', 'timesheet', tab],
    queryFn: () => approvalsApi.timeSheetRequests(tab),
    refetchInterval: 30_000,
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; decision: 'APPROVED' | 'REJECTED'; reason?: string }) =>
      approvalsApi.decideTimeSheet(v.id, { decision: v.decision, reason: v.reason }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['admin-approvals'] });
      // Open task screens pick up the new entry status too.
      qc.invalidateQueries({ queryKey: ['admin-tasks'] });
      setRejecting(null);
      setReason('');
      Alert.alert(
        v.decision === 'APPROVED' ? 'Approved' : 'Request rejected',
        v.decision === 'APPROVED' ? 'Sent to the client for approval.' : 'The team member will see your reason.'
      );
    },
    onError: (e) => Alert.alert('Not saved', errorMessage(e)),
  });

  const submitReject = () => {
    const r = rejecting;
    const why = reason.trim();
    if (!r || !why) return;
    Alert.alert('Reject this request?', `${r.requestId} — ${hoursLabel(r.hours)} by ${r.authorName}. The team member sees your reason.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => decide.mutate({ id: r.id, decision: 'REJECTED', reason: why }) },
    ]);
  };

  const list = q.data ?? [];

  return (
    <>
      <Chips
        style={{ marginTop: 14 }}
        options={[
          { value: 'ADMIN_PENDING' as const, label: 'Pending' },
          { value: 'ADMIN_APPROVED' as const, label: 'Approved' },
          { value: 'ADMIN_REJECTED' as const, label: 'Rejected' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <View style={{ marginTop: 14, gap: 10 }}>
        {q.isError ? (
          <ErrorBox message={errorMessage(q.error, 'Could not load Time Sheet requests')} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Loading />
        ) : !list.length ? (
          <EmptyCard
            icon="time-outline"
            title="Nothing here"
            body={
              tab === 'ADMIN_PENDING'
                ? 'Time Sheet requests over the monthly maximum will appear here for approval.'
                : tab === 'ADMIN_APPROVED'
                  ? 'Requests you approve are listed here, with what the client decided.'
                  : 'No rejected Time Sheet requests.'
            }
          />
        ) : (
          list.map((r) => {
            const after = r.monthUsed + r.hours;
            const busy = decide.isPending && decide.variables?.id === r.id;
            const client = CLIENT_STATUS[r.status];
            return (
              <Card key={r.id} style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <Pressable
                    style={{ flex: 1, minWidth: 0 }}
                    onPress={() => r.clientId && nav.navigate('CustomerDetail', { clientId: r.clientId })}
                  >
                    <T w="s" size={15} numberOfLines={1}>
                      {r.customerName}
                    </T>
                    <Muted size={12} numberOfLines={1}>
                      <T mono size={11} color={colors.muted}>
                        {r.clientId}
                      </T>{' '}
                      · {r.poolName}
                    </Muted>
                  </Pressable>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T w="b" size={18}>
                      {r.hours.toFixed(2)}
                    </T>
                    <Muted size={11}>hours</Muted>
                  </View>
                </View>

                <T size={14} style={{ marginTop: 10, lineHeight: 20 }}>
                  {r.description || '—'}
                </T>
                <Muted size={12} style={{ marginTop: 4 }}>
                  {[r.category, r.priority, r.staff, `by ${r.authorName}`].filter(Boolean).join(' · ')}
                </Muted>

                <View style={st.facts}>
                  <Fact label="Request" value={r.requestId || '—'} mono />
                  <Fact
                    label="Task"
                    value={[r.taskNumber, r.taskTitle].filter(Boolean).join(' · ') || '—'}
                    // Older API builds send no taskId: open the customer's task board instead.
                    onPress={
                      !r.clientId
                        ? undefined
                        : r.taskId
                          ? () => nav.navigate('AdminTask', { clientId: r.clientId, taskId: r.taskId })
                          : () => nav.navigate('AdminTaskBoard', { clientId: r.clientId, companyName: r.customerName })
                    }
                  />
                  <Fact label="Work date" value={rangeLabel(r.date, r.endDate)} />
                  <Fact label="Month" value={`${monthLabel(r.month)} · ${hoursLabel(r.monthUsed)} used → ${hoursLabel(after)}`} />
                </View>
                <T w="s" size={12.5} color={colors.redFg} style={{ marginTop: 6 }}>
                  {hoursLabel(Math.max(0, after - r.monthlyMax))} over the {r.monthlyMax} h maximum
                </T>

                <Muted size={12} style={{ marginTop: 8 }}>
                  {tab === 'ADMIN_PENDING'
                    ? `Requested ${fmtDate(r.createdAt)}`
                    : `${tab === 'ADMIN_APPROVED' ? 'Approved' : 'Rejected'} ${r.adminDecidedAt ? dayLabel(r.adminDecidedAt) : '—'}${
                        r.adminDecidedBy ? ` by ${r.adminDecidedBy}` : ''
                      }`}
                </Muted>

                {tab === 'ADMIN_REJECTED' && r.rejectReason ? (
                  <T size={12.5} color={colors.redFg} style={{ marginTop: 6 }}>
                    Reason: {r.rejectReason}
                    {r.decidedBy ? ` — ${r.decidedBy}` : ''}
                  </T>
                ) : null}

                {tab === 'ADMIN_APPROVED' ? (
                  <View style={{ marginTop: 8, gap: 4 }}>
                    {client ? <Pill kind={client.kind} label={client.label} /> : null}
                    {r.status === 'REJECTED' && r.rejectReason ? (
                      <T size={12.5} color={colors.redFg}>
                        Reason: {r.rejectReason}
                      </T>
                    ) : null}
                  </View>
                ) : null}

                {tab === 'ADMIN_PENDING' ? (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <Btn
                      title="Approve"
                      icon="checkmark"
                      onPress={() => decide.mutate({ id: r.id, decision: 'APPROVED' })}
                      loading={busy && decide.variables?.decision === 'APPROVED'}
                      disabled={busy}
                      style={st.smallBtn}
                    />
                    <Btn
                      title="Reject"
                      icon="close"
                      variant="ghost"
                      disabled={busy}
                      onPress={() => {
                        setReason('');
                        setRejecting(r);
                      }}
                      style={st.smallBtn}
                    />
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </View>

      <Sheet open={!!rejecting} onClose={() => setRejecting(null)}>
        {rejecting ? (
          <>
            <T w="s" size={18}>
              Reject Time Sheet request
            </T>
            <Muted size={13} style={{ marginTop: 4, lineHeight: 19 }}>
              {rejecting.requestId} — {hoursLabel(rejecting.hours)} by {rejecting.authorName}. The team member sees your reason; the client is not
              asked.
            </Muted>
            <Field
              label="Why are you rejecting it?"
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={1000}
              autoFocus
              autoCorrect
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Btn title="Cancel" variant="ghost" onPress={() => setRejecting(null)} disabled={decide.isPending} style={{ flex: 1 }} />
              <Btn title="Reject" onPress={submitReject} disabled={!reason.trim()} loading={decide.isPending} style={{ flex: 1, backgroundColor: colors.red, borderColor: colors.red }} />
            </View>
          </>
        ) : null}
      </Sheet>
    </>
  );
}

function Fact({ label, value, mono, onPress }: { label: string; value: string; mono?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <Muted size={12.5} style={{ width: 78 }}>
        {label}
      </Muted>
      <T w="m" size={mono ? 12 : 13} mono={mono} color={onPress ? colors.green : colors.fg} style={{ flex: 1 }}>
        {value}
      </T>
      {onPress ? <Ionicons name="chevron-forward" size={14} color={colors.faint} /> : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tile: { flex: 1, padding: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 },
  pill: { height: 24, paddingHorizontal: 8 },
  smallBtn: { flex: 1, minHeight: 42 },
  facts: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 4 },
});
