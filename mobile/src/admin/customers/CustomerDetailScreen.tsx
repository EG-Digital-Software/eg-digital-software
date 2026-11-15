import React, { useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import { adminCustomersApi, businessTypesLabel, customerName } from '../../api/admin/customers';
import { useAuth } from '../../context/AuthContext';
import { fmtDate } from '../../lib/portal';
import { Avatar, Btn, Card, Chips, ErrorBox, Loading, Muted, Pill, Screen, Sheet, SheetOption, T, Toggle, type IconName } from '../../ui';
import { colors } from '../../theme';
import { LIST_KEY, SheetTitle, customerKey, primaryAddress, statusOf } from './common';
import { HistorySection, InvoicesSection, OverviewSection } from './sections';
import { AgreementsSection } from './AgreementsSection';
import { ProductsSection } from './ProductsSection';
import { CredentialsSection } from './CredentialsSection';
import { RenewSheet } from './RenewSheet';

type Tab = 'overview' | 'agreements' | 'products' | 'invoices' | 'logins' | 'history';

/** Admin customer detail (web CustomerDetailPage). Route: CustomerDetail { clientId }. */
export default function CustomerDetailScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const { openCustomer } = useAuth();
  const clientId: string = route.params?.clientId;
  const [tab, setTab] = useState<Tab>((route.params?.tab as Tab) ?? 'overview');
  const [renewOpen, setRenewOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalEdit, setPortalEdit] = useState(false);
  const [opening, setOpening] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);

  const q = useQuery({
    queryKey: customerKey(clientId),
    queryFn: () => adminCustomersApi.get(clientId),
    // Keep agreement status in step with the client without a manual refresh.
    refetchInterval: 15_000,
  });
  const c = q.data;

  const employees = useQuery({ queryKey: ['admin-customers', 'employees'], queryFn: adminCustomersApi.employees, enabled: managerOpen });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: customerKey(clientId) });
    void qc.invalidateQueries({ queryKey: LIST_KEY });
  };

  const assignManager = useMutation({
    mutationFn: (accountManagerId: string) => adminCustomersApi.update(clientId, { accountManagerId }),
    onSuccess: () => {
      invalidate();
      setManagerOpen(false);
    },
    onError: (e) => Alert.alert('Could not update the account manager', errorMessage(e)),
  });

  const archive = useMutation({
    mutationFn: () => adminCustomersApi.archive(clientId),
    onSuccess: () => {
      invalidate();
      Alert.alert('Customer archived');
    },
    onError: (e) => Alert.alert('Could not archive', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => adminCustomersApi.remove(clientId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.removeQueries({ queryKey: customerKey(clientId) });
      Alert.alert('Customer permanently deleted');
      nav.goBack();
    },
    onError: (e) => Alert.alert('Could not delete', errorMessage(e)),
  });

  const viewAsClient = async () => {
    if (!c) return;
    setOpening(true);
    try {
      await openCustomer(c.clientId, customerName(c), portalEdit);
      setPortalOpen(false);
    } catch (e) {
      Alert.alert('Could not open this customer', errorMessage(e));
    } finally {
      setOpening(false);
    }
  };

  if (q.isLoading) {
    return (
      <Screen title="Customer" back>
        <Loading />
      </Screen>
    );
  }
  if (q.isError || !c) {
    return (
      <Screen title="Customer" back>
        <ErrorBox message={errorMessage(q.error, 'Could not load this customer')} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }

  const name = customerName(c);
  const st = statusOf(c);
  const here = primaryAddress(c);
  const docs = c.documents?.length ?? 0;
  const awaiting = c.documents?.filter((d) => d.status === 'SUBMITTED').length ?? 0;
  const renewedUntil = c.accountRenewedUntil && new Date(c.accountRenewedUntil) > new Date() ? c.accountRenewedUntil : null;
  const manager = c.accountManager ? `${c.accountManager.firstName} ${c.accountManager.lastName ?? ''}`.trim() : null;

  const tabs: { value: Tab; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'agreements', label: `Agreements${docs ? ` · ${docs}` : ''}${awaiting ? ' •' : ''}` },
    { value: 'products', label: `Products${c.customerProducts?.length ? ` · ${c.customerProducts.length}` : ''}` },
    { value: 'invoices', label: `Invoices${c.invoices?.length ? ` · ${c.invoices.length}` : ''}` },
    { value: 'logins', label: 'Logins' },
    { value: 'history', label: 'History' },
  ];

  const confirmArchive = () =>
    Alert.alert('Archive customer?', `${name} will be archived. Their invoices and records are preserved.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => archive.mutate() },
    ]);
  const confirmDelete = () =>
    Alert.alert(
      'Delete customer permanently?',
      `${name} and all its data — addresses, directors and assigned products — will be permanently deleted. This cannot be undone. A customer with invoices can't be deleted; archive it instead.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete permanently', style: 'destructive', onPress: () => remove.mutate() },
      ]
    );

  return (
    <Screen title={name} back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {/* Profile */}
      <Card style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Avatar name={name} size={56} radius={16} fill={colors.navy} color="#fff" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w="b" size={19}>
              {name}
            </T>
            <T mono size={12} color={colors.muted} style={{ marginTop: 2 }} selectable>
              {c.clientId}
            </T>
            {c.tradingAs && c.tradingAs !== c.companyName ? <Muted size={12.5}>Trading as {c.tradingAs}</Muted> : null}
          </View>
          {c.creditScore != null ? (
            <View
              style={{
                alignItems: 'center',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: c.creditScore >= 500 ? '#9FD9C2' : '#F3B6BB',
                alignSelf: 'flex-start',
              }}
            >
              <Muted size={10}>Credit</Muted>
              <T w="b" size={18} color={c.creditScore >= 500 ? colors.okFg : colors.redFg}>
                {c.creditScore}
              </T>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          <Pill kind={st.kind} label={st.label} />
          {c.status === 'ARCHIVED' ? <Pill kind="ns" label="Archived" /> : null}
          {c.businessType ? <Pill kind="ns" label={businessTypesLabel(c.businessType)} /> : null}
          {!c.authorized ? <Pill kind="info" label="Authorised rep" /> : null}
        </View>

        <View style={{ marginTop: 10, gap: 4 }}>
          {c.contactEmail ? <InfoLine icon="mail-outline" text={c.contactEmail} /> : null}
          {c.contactMobile ? <InfoLine icon="call-outline" text={c.contactMobile} /> : null}
          {here?.city ? <InfoLine icon="location-outline" text={[here.city, here.country].filter(Boolean).join(', ')} /> : null}
          {renewedUntil ? <InfoLine icon="refresh-outline" text={`Renewed until ${fmtDate(renewedUntil)}`} /> : null}
        </View>

        <Pressable
          onPress={() => setManagerOpen(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }}
        >
          <Ionicons name="people-outline" size={16} color={colors.muted} />
          <Muted size={13} style={{ flex: 1 }}>
            Account manager
          </Muted>
          <T w="s" size={13.5} color={manager ? colors.fg : colors.muted}>
            {manager ?? 'Unassigned'}
          </T>
          <Ionicons name="chevron-forward" size={16} color={colors.faint} />
        </Pressable>
      </Card>

      {/* Actions */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <ActionTile icon="list-outline" label="Tasks" onPress={() => nav.navigate('AdminTaskBoard', { clientId, companyName: name })} />
        <ActionTile icon="receipt-outline" label="New invoice" onPress={() => nav.navigate('InvoiceForm', { clientId })} />
        <ActionTile icon="create-outline" label="Edit" onPress={() => nav.navigate('CustomerForm', { clientId })} />
        <ActionTile icon="eye-outline" label="View as client" onPress={() => setPortalOpen(true)} />
        <ActionTile icon="refresh-outline" label="Renew" onPress={() => setRenewOpen(true)} />
      </View>

      <Chips<Tab> options={tabs} value={tab} onChange={setTab} style={{ marginTop: 16, marginBottom: 12 }} />

      {tab === 'overview' ? <OverviewSection c={c} /> : null}
      {tab === 'agreements' ? <AgreementsSection c={c} /> : null}
      {tab === 'products' ? <ProductsSection c={c} /> : null}
      {tab === 'invoices' ? <InvoicesSection c={c} /> : null}
      {tab === 'logins' ? <CredentialsSection clientId={clientId} /> : null}
      {tab === 'history' ? <HistorySection clientId={clientId} /> : null}

      {tab === 'overview' ? (
        <Card style={{ padding: 16, marginTop: 16, borderColor: '#F3B6BB' }}>
          <T w="s" size={15}>
            Danger zone
          </T>
          <Muted size={12.5} style={{ marginTop: 4 }}>
            Archiving keeps invoices and records. A permanent delete cannot be undone.
          </Muted>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {c.status !== 'ARCHIVED' ? (
              <Btn title="Archive" variant="ghost" onPress={confirmArchive} loading={archive.isPending} style={{ flex: 1, minHeight: 44 }} />
            ) : null}
            <Btn title="Delete" variant="ghost" icon="trash-outline" onPress={confirmDelete} loading={remove.isPending} style={{ flex: 1, minHeight: 44 }} />
          </View>
        </Card>
      ) : null}

      <RenewSheet customer={c} open={renewOpen} onClose={() => setRenewOpen(false)} />

      {/* View as client */}
      <Sheet open={portalOpen} onClose={() => setPortalOpen(false)}>
        <SheetTitle title="View as client" body={`Open ${name}'s portal without their password.`} />
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <T w="s" size={14}>
              Allow changes
            </T>
            <Muted size={12.5}>Off: view only. On: messages, notes and signatures are made as the customer.</Muted>
          </View>
          <Toggle value={portalEdit} onChange={setPortalEdit} />
        </Card>
        <Btn
          title={portalEdit ? 'Open and allow changes' : 'Open view only'}
          icon="eye-outline"
          onPress={() => void viewAsClient()}
          loading={opening}
          style={{ marginTop: 16 }}
        />
      </Sheet>

      {/* Account manager */}
      <Sheet open={managerOpen} onClose={() => setManagerOpen(false)}>
        <SheetTitle title="Account manager" body="Assign a team member to this client." />
        {employees.isLoading ? (
          <Loading />
        ) : employees.isError ? (
          <ErrorBox message={errorMessage(employees.error)} onRetry={() => void employees.refetch()} />
        ) : (
          <>
            <SheetOption title="Unassigned" selected={!c.accountManagerId} onPress={() => assignManager.mutate('')} />
            {(employees.data ?? []).map((emp) => (
              <SheetOption
                key={emp.id}
                title={`${emp.firstName} ${emp.lastName ?? ''}`.trim()}
                right={emp.designation ?? undefined}
                selected={c.accountManagerId === emp.id}
                onPress={() => assignManager.mutate(emp.id)}
              />
            ))}
          </>
        )}
      </Sheet>
    </Screen>
  );
}

function InfoLine({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={icon} size={14} color={colors.muted} />
      <Muted size={13} style={{ flex: 1 }} numberOfLines={1} selectable>
        {text}
      </Muted>
    </View>
  );
}

function ActionTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: '30%',
        minHeight: 64,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.soft : '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 8,
      })}
    >
      <Ionicons name={icon} size={20} color={colors.green} />
      <T w="s" size={12.5}>
        {label}
      </T>
    </Pressable>
  );
}
