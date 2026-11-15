import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { adminCustomersApi, type AdminCustomer } from '../../api/admin/customers';
import { fmtDate } from '../../lib/portal';
import { Btn, Chips, Muted, Sheet, T } from '../../ui';
import { colors } from '../../theme';
import { Field, LIST_KEY, SheetTitle, customerKey } from './common';

const PRESETS = [1, 3, 6, 12, 24];
const MAX_MONTHS = 60;

/** End date a renewal of `months` would reach — mirrors the server rule. */
function renewalEnd(current: string | null | undefined, months: number): Date {
  const now = new Date();
  const from = current && new Date(current) > now ? new Date(current) : now;
  const until = new Date(from);
  until.setMonth(until.getMonth() + months);
  return until;
}

/** "Renew account": ACTIVE for the chosen months; a running renewal is extended. */
export function RenewSheet({ customer, open, onClose }: { customer: AdminCustomer; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [months, setMonths] = useState('12');
  const [custom, setCustom] = useState('');
  const chosen = custom ? Number(custom) : Number(months);
  const valid = Number.isInteger(chosen) && chosen >= 1 && chosen <= MAX_MONTHS;
  const running = !!customer.accountRenewedUntil && new Date(customer.accountRenewedUntil) > new Date();

  const renew = useMutation({
    mutationFn: () => adminCustomersApi.renew(customer.clientId, chosen),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: customerKey(customer.clientId) });
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      setCustom('');
      onClose();
      Alert.alert('Account renewed', `Active until ${fmtDate(res.accountRenewedUntil)}.`);
    },
    onError: (e) => Alert.alert('Could not renew the account', errorMessage(e)),
  });

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetTitle
        title="Renew account"
        body={`The account will be set to Active for the period you choose${
          running ? `, extending the current renewal (active until ${fmtDate(customer.accountRenewedUntil)})` : ''
        }.`}
      />
      <Muted size={12.5} w="s" style={{ marginTop: 10, marginBottom: 8 }}>
        Renew for
      </Muted>
      <Chips
        options={PRESETS.map((m) => ({ value: String(m), label: `${m} ${m === 1 ? 'month' : 'months'}` }))}
        value={custom ? '' : months}
        onChange={(v) => {
          setMonths(v);
          setCustom('');
        }}
      />
      <Field
        label={`Or enter months (1–${MAX_MONTHS})`}
        value={custom}
        onChangeText={(v) => setCustom(v.replace(/\D/g, ''))}
        placeholder="e.g. 18"
        keyboardType="number-pad"
        maxLength={2}
        style={{ marginTop: 14 }}
        hint={custom && !valid ? `Enter a whole number between 1 and ${MAX_MONTHS}.` : undefined}
      />
      {valid ? (
        <View style={{ marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: colors.soft2 }}>
          <T size={13.5}>
            Account will be{' '}
            <T w="s" size={13.5} color={colors.okFg}>
              Active
            </T>{' '}
            until <T w="s" size={13.5}>{fmtDate(renewalEnd(customer.accountRenewedUntil, chosen).toISOString())}</T>
          </T>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Btn title="Cancel" variant="ghost" onPress={onClose} disabled={renew.isPending} style={{ flex: 1 }} />
        <Btn
          title={`Renew ${valid ? chosen : '—'} ${chosen === 1 ? 'month' : 'months'}`}
          onPress={() => renew.mutate()}
          disabled={!valid}
          loading={renew.isPending}
          style={{ flex: 1.4 }}
        />
      </View>
    </Sheet>
  );
}
