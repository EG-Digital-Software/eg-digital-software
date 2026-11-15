import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  WORLDLINE_WEBHOOK_URL,
  paymentsApi,
  type PaymentProviderName,
  type PaymentSettings,
  type PaymentSettingsInput,
} from '../../api/admin/billing';
import { errorMessage } from '../../api/client';
import { colors } from '../../theme';
import { Btn, Card, ErrorBox, Loading, Muted, Screen, SectionHead, Sheet, SheetOption, T, Toggle } from '../../ui';
import { Field, Input, Seg, SelectBox, digitsOnly } from './shared';

interface Form {
  provider: PaymentProviderName;
  publishableKey: string;
  secretKey: string;
  worldlineEnvironment: 'live' | 'test';
  worldlineMerchantId: string;
  worldlineApiKeyId: string;
  worldlineApiSecret: string;
  worldlineWebhookKeyId: string;
  worldlineWebhookSecret: string;
  cardPaymentsEnabled: boolean;
  upiEnabled: boolean;
  upiId: string;
  bankTransferEnabled: boolean;
  bankName: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
  payInstructions: string;
}

const PROVIDERS: { value: PaymentProviderName; label: string }[] = [
  { value: 'worldline', label: 'ANZ Worldline (Global Online Pay)' },
  { value: 'mock', label: 'Mock (development)' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'razorpay', label: 'Razorpay' },
];

const LIMITS: Partial<Record<keyof Form, number>> = {
  publishableKey: 255,
  secretKey: 255,
  worldlineMerchantId: 60,
  worldlineApiKeyId: 120,
  worldlineApiSecret: 255,
  worldlineWebhookKeyId: 120,
  worldlineWebhookSecret: 255,
  upiId: 120,
  bankName: 120,
  accountName: 120,
  bsb: 6,
  accountNumber: 10,
  payInstructions: 2000,
};

/** Secret keys stay blank — the API only reports that one is saved. */
const fromSettings = (d: PaymentSettings): Form => ({
  provider: d.provider,
  publishableKey: d.publishableKey ?? '',
  secretKey: '',
  worldlineEnvironment: d.worldlineEnvironment ?? 'live',
  worldlineMerchantId: d.worldlineMerchantId ?? '',
  worldlineApiKeyId: d.worldlineApiKeyId ?? '',
  worldlineApiSecret: '',
  worldlineWebhookKeyId: d.worldlineWebhookKeyId ?? '',
  worldlineWebhookSecret: '',
  cardPaymentsEnabled: d.cardPaymentsEnabled,
  upiEnabled: d.upiEnabled,
  upiId: d.upiId ?? '',
  bankTransferEnabled: d.bankTransferEnabled,
  bankName: d.bankName ?? '',
  accountName: d.accountName ?? '',
  bsb: d.bsb ?? '',
  accountNumber: d.accountNumber ?? '',
  payInstructions: d.payInstructions ?? '',
});

/** Payment settings (admin only): gateway, card, UPI, bank transfer and pay-page note. */
export default function PaymentSettingsScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-payments', 'settings'], queryFn: paymentsApi.settings, refetchOnWindowFocus: false });
  const [form, setForm] = useState<Form | null>(null);
  const [providerSheet, setProviderSheet] = useState(false);

  useEffect(() => {
    if (q.data) setForm(fromSettings(q.data));
  }, [q.data]);

  const dirty = useMemo(() => !!form && !!q.data && JSON.stringify(form) !== JSON.stringify(fromSettings(q.data)), [form, q.data]);

  const save = useMutation({
    mutationFn: (body: PaymentSettingsInput) => paymentsApi.updateSettings(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-payments', 'settings'] });
      Alert.alert('Payment settings saved');
    },
    onError: (e) => Alert.alert('Could not save settings', errorMessage(e)),
  });
  const test = useMutation({
    mutationFn: paymentsApi.testWorldline,
    onSuccess: (r) =>
      r.ok
        ? Alert.alert('Connected', `Connected to ANZ Worldline (${r.environment}) as ${r.merchantId}`)
        : Alert.alert('Worldline test failed', `Worldline answered "${r.result ?? 'unknown'}"`),
    onError: (e) => Alert.alert('Could not reach ANZ Worldline', errorMessage(e)),
  });

  if (q.isLoading || (q.data && !form)) {
    return (
      <Screen title="Payment settings" back>
        <Loading />
      </Screen>
    );
  }
  if (q.isError || !q.data || !form) {
    return (
      <Screen title="Payment settings" back>
        <ErrorBox message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }

  const d = q.data;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const text = (k: keyof Form) => ({
    value: form[k] as string,
    onChangeText: (t: string) => set(k, t as never),
    maxLength: LIMITS[k],
    autoCorrect: false,
  });

  const onSave = () => {
    const body: PaymentSettingsInput = { ...form };
    if (!form.secretKey) delete body.secretKey;
    if (!form.worldlineApiSecret) delete body.worldlineApiSecret;
    if (!form.worldlineWebhookSecret) delete body.worldlineWebhookSecret;
    Alert.alert('Save payment settings?', 'These apply straight away to every invoice and the customer pay page.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: () => save.mutate(body) },
    ]);
  };

  const saveBtn = <Btn title="Save changes" icon="save-outline" onPress={onSave} loading={save.isPending} disabled={!dirty} />;

  return (
    <Screen title="Payment settings" back padBottom={48}>
      <Muted size={13.5} style={{ lineHeight: 20 }}>
        Configure your payment gateway and bank transfer details. These appear on invoices and the pay page. Card surcharges are not
        charged — they are banned in Australia from 1 October 2026.
      </Muted>

      {/* Gateway */}
      <SectionHead title="Payment gateway" />
      <Card style={{ padding: 16, paddingTop: 4 }}>
        <Field label="Provider">
          <SelectBox value={PROVIDERS.find((p) => p.value === form.provider)?.label} placeholder="Provider" onPress={() => setProviderSheet(true)} />
        </Field>
        {form.provider === 'worldline' ? (
          <>
            <Field label="Environment">
              <Seg
                value={form.worldlineEnvironment}
                onChange={(v) => set('worldlineEnvironment', v)}
                options={[
                  { value: 'live', label: 'Live — real payments' },
                  { value: 'test', label: 'Test (pre-production)' },
                ]}
              />
            </Field>
            <Field label="Merchant ID (PSPID)" hint="Top of the Merchant Portal">
              <Input {...text('worldlineMerchantId')} autoCapitalize="none" placeholder="e.g. EGEloma" />
            </Field>
            <Field label="API Key ID" hint="Developer › Payment API">
              <Input {...text('worldlineApiKeyId')} autoCapitalize="none" />
            </Field>
            <Field label="API Secret" hint={d.hasWorldlineApiSecret ? `Saved · ends ••${d.worldlineApiSecretLast4}` : 'Not set'}>
              <Input
                {...text('worldlineApiSecret')}
                secureTextEntry
                autoCapitalize="none"
                placeholder={d.hasWorldlineApiSecret ? 'Leave blank to keep current' : ''}
              />
            </Field>
            <Field label="Webhook Key ID" hint="Developer › Webhooks">
              <Input {...text('worldlineWebhookKeyId')} autoCapitalize="none" />
            </Field>
            <Field label="Webhook Secret" hint={d.hasWorldlineWebhookSecret ? `Saved · ends ••${d.worldlineWebhookSecretLast4}` : 'Not set'}>
              <Input
                {...text('worldlineWebhookSecret')}
                secureTextEntry
                autoCapitalize="none"
                placeholder={d.hasWorldlineWebhookSecret ? 'Leave blank to keep current' : ''}
              />
            </Field>
            <Field label="Webhook URL" hint="Add this under Developer › Webhooks › Add webhook endpoint in the Worldline Merchant Portal.">
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(WORLDLINE_WEBHOOK_URL);
                  Alert.alert('Webhook URL copied');
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, backgroundColor: colors.soft, padding: 12 }}
              >
                <T mono size={11.5} style={{ flex: 1 }} selectable>
                  {WORLDLINE_WEBHOOK_URL}
                </T>
                <Ionicons name="copy-outline" size={18} color={colors.muted} />
              </Pressable>
            </Field>
            <View style={{ marginTop: 14, gap: 10 }}>
              {d.worldlineReady ? (
                <View style={{ backgroundColor: colors.okBg, borderRadius: 10, padding: 10 }}>
                  <T w="s" size={12.5} color={colors.okFg}>
                    Card payments go through ANZ Worldline
                  </T>
                </View>
              ) : (
                <View style={{ backgroundColor: colors.redBg, borderRadius: 10, padding: 10 }}>
                  <T w="s" size={12.5} color={colors.redFg}>
                    Enter the PSPID, API Key ID and API Secret, then save
                  </T>
                </View>
              )}
              <Btn
                title={dirty ? 'Test connection (save first)' : 'Test connection'}
                icon="flash-outline"
                variant="ghost"
                disabled={!d.worldlineReady || dirty}
                loading={test.isPending}
                onPress={() => test.mutate()}
              />
            </View>
          </>
        ) : (
          <>
            <Field label="Publishable / public key">
              <Input {...text('publishableKey')} autoCapitalize="none" placeholder={form.provider === 'razorpay' ? 'rzp_live_…' : 'pk_live_…'} />
            </Field>
            <Field label="Secret key" hint={d.hasSecretKey ? `Saved · ends ••${d.secretKeyLast4}` : 'Not set'}>
              <Input
                {...text('secretKey')}
                secureTextEntry
                autoCapitalize="none"
                placeholder={d.hasSecretKey ? 'Leave blank to keep current' : 'sk_live_…'}
              />
            </Field>
          </>
        )}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.muted} style={{ marginTop: 2 }} />
          <Muted size={12} style={{ flex: 1, lineHeight: 17 }}>
            Secret keys are stored securely and never shown again after saving. Live charges require a real gateway; “Mock” simulates
            payments for testing.
          </Muted>
        </View>
      </Card>

      {/* Card payments */}
      <SectionHead title="Card payments" />
      <ToggleCard
        label="Accept card payments"
        body="Show card options (Visa, Mastercard, Amex, Google Pay) on invoices and the pay page."
        value={form.cardPaymentsEnabled}
        onChange={(v) => set('cardPaymentsEnabled', v)}
      />

      {/* UPI */}
      <SectionHead title="UPI / Google Pay" />
      <ToggleCard
        label="Accept UPI / Google Pay / PhonePe"
        body="Show a UPI option (with QR + intent link) on invoices and the pay page."
        value={form.upiEnabled}
        onChange={(v) => set('upiEnabled', v)}
      >
        <Field label="UPI ID (VPA)" hint="e.g. egdigital@okhdfcbank">
          <Input {...text('upiId')} autoCapitalize="none" keyboardType="email-address" editable={form.upiEnabled} placeholder="yourbusiness@okhdfcbank" />
        </Field>
      </ToggleCard>

      {/* Bank transfer */}
      <SectionHead title="Bank transfer (EFT)" />
      <ToggleCard
        label="Offer bank transfer"
        body="Display these account details on invoices and the pay page for direct deposit."
        value={form.bankTransferEnabled}
        onChange={(v) => set('bankTransferEnabled', v)}
      >
        <Field label="Account name">
          <Input {...text('accountName')} autoCapitalize="words" editable={form.bankTransferEnabled} placeholder="EG Eloma" />
        </Field>
        <Field label="Bank name">
          <Input {...text('bankName')} autoCapitalize="words" editable={form.bankTransferEnabled} placeholder="e.g. Commonwealth Bank" />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="BSB" style={{ flex: 1 }}>
            <Input
              {...text('bsb')}
              onChangeText={(t) => set('bsb', digitsOnly(t))}
              keyboardType="number-pad"
              editable={form.bankTransferEnabled}
              placeholder="000000"
            />
          </Field>
          <Field label="Account number" style={{ flex: 1.4 }}>
            <Input
              {...text('accountNumber')}
              onChangeText={(t) => set('accountNumber', digitsOnly(t))}
              keyboardType="number-pad"
              editable={form.bankTransferEnabled}
              placeholder="12345678"
            />
          </Field>
        </View>
      </ToggleCard>

      {/* Instructions */}
      <SectionHead title="Payment instructions / note" />
      <Card style={{ padding: 16, paddingTop: 4 }}>
        <Field label="Note shown on invoice & pay page">
          <Input
            {...text('payInstructions')}
            autoCorrect
            multiline
            style={{ minHeight: 96 }}
            placeholder="e.g. Please use your invoice number as the payment reference."
          />
        </Field>
      </Card>

      <View style={{ marginTop: 20 }}>{saveBtn}</View>

      <Sheet open={providerSheet} onClose={() => setProviderSheet(false)}>
        <T w="s" size={17}>
          Provider
        </T>
        {PROVIDERS.map((p) => (
          <SheetOption
            key={p.value}
            title={p.label}
            selected={p.value === form.provider}
            onPress={() => {
              set('provider', p.value);
              setProviderSheet(false);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

function ToggleCard({
  label,
  body,
  value,
  onChange,
  children,
}: {
  label: string;
  body: string;
  value: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <Card style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <T w="s" size={14.5}>
            {label}
          </T>
          <Muted size={12.5} style={{ marginTop: 2, lineHeight: 18 }}>
            {body}
          </Muted>
        </View>
        <Toggle value={value} onChange={onChange} />
      </View>
      {children}
    </Card>
  );
}
