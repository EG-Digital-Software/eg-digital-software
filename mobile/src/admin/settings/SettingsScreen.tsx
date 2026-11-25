import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../../api/client';
import { settingsApi, type OrganisationSettings } from '../../api/admin/settings';
import { Btn, Card, ErrorBox, Loading, Muted, Screen, T } from '../../ui';
import { colors } from '../../theme';
import { CountryField, Field, Input, PhoneField, Section, StateField } from '../customers/form/fields';
import { DEFAULT_COUNTRY, countryCodeByName, countryName } from '../customers/form/countries';
import { subdivisionsOf } from '../customers/form/subdivisions';
import { toTitleCase } from '../customers/form/model';

/** Form state: every field a string; country is the ISO code (sent as its name). */
interface FormValues {
  companyName: string;
  legalName: string;
  abn: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  billingEmail: string;
  supportEmail: string;
  phone: string;
  phoneCountry: string;
  disputeWindowDays: string;
}
type Errors = Partial<Record<keyof FormValues, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fromData(d: OrganisationSettings): FormValues {
  return {
    companyName: d.companyName ?? '',
    legalName: d.legalName ?? '',
    abn: d.abn ?? '',
    website: d.website ?? '',
    addressLine1: d.addressLine1 ?? '',
    addressLine2: d.addressLine2 ?? '',
    city: d.city ?? '',
    state: d.state ?? '',
    postcode: d.postcode ?? '',
    country: countryCodeByName(d.country),
    billingEmail: d.billingEmail ?? '',
    supportEmail: d.supportEmail ?? '',
    phone: d.phone ?? '',
    phoneCountry: d.phoneCountry || DEFAULT_COUNTRY,
    disputeWindowDays: d.disputeWindowDays != null ? String(d.disputeWindowDays) : '',
  };
}

/** Same rules as the web zod schema. */
function validate(v: FormValues): Errors {
  const e: Errors = {};
  if (!v.companyName.trim()) e.companyName = 'Required';
  else if (v.companyName.length > 120) e.companyName = 'Max 120 characters';
  if (v.legalName.length > 160) e.legalName = 'Max 160 characters';
  const abn = v.abn.replace(/\D/g, '');
  if (abn.length !== 0 && abn.length !== 11) e.abn = 'ABN must be 11 digits';
  if (v.website.length > 200) e.website = 'Max 200 characters';
  if (v.billingEmail.trim() && !EMAIL_RE.test(v.billingEmail.trim())) e.billingEmail = 'Enter a valid email';
  if (v.supportEmail.trim() && !EMAIL_RE.test(v.supportEmail.trim())) e.supportEmail = 'Enter a valid email';
  if (v.disputeWindowDays.trim()) {
    const n = Number(v.disputeWindowDays);
    if (!Number.isInteger(n) || n < 0 || n > 365) e.disputeWindowDays = 'Must be a whole number of days between 0 and 365';
  }
  return e;
}

/**
 * Organisation settings — the issuing entity printed on every tax invoice and
 * the pay page (port of the web SettingsPage). Access PINs open as a sub-screen.
 */
export default function SettingsScreen() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'organisation'], queryFn: settingsApi.getOrganisation });
  const [form, setForm] = useState<FormValues | null>(null);
  const [initial, setInitial] = useState<FormValues | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [open, setOpen] = useState({ org: true, address: true, contact: true, regional: false });

  // Reset the form whenever fresh data arrives (and nothing is being edited).
  useEffect(() => {
    if (!q.data) return;
    const v = fromData(q.data);
    setInitial(v);
    setForm((cur) => (cur && initial && JSON.stringify(cur) !== JSON.stringify(initial) ? cur : v));
    // initial is read only to keep unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const dirty = useMemo(() => !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);

  const save = useMutation({
    mutationFn: (body: Partial<OrganisationSettings>) => settingsApi.updateOrganisation(body),
    onSuccess: (data) => {
      const v = fromData(data);
      setInitial(v);
      setForm(v);
      qc.setQueryData(['admin', 'organisation'], data);
      void qc.invalidateQueries({ queryKey: ['admin', 'organisation'] });
      // Invoices print these details, so refresh their cached copy too.
      void qc.invalidateQueries({ queryKey: ['public-organisation'] });
      Alert.alert('Saved', 'Organisation settings saved');
    },
    onError: (e) => Alert.alert('Could not save settings', errorMessage(e, 'Could not save settings')),
  });

  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => {
    setForm((f) => (f ? { ...f, [k]: val } : f));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const onSave = () => {
    if (!form) return;
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) {
      setOpen((o) => ({
        ...o,
        org: o.org || !!(e.companyName || e.legalName || e.abn || e.website),
        contact: o.contact || !!(e.billingEmail || e.supportEmail || e.disputeWindowDays),
      }));
      Alert.alert('Check the form', 'Some fields need fixing before saving.');
      return;
    }
    const { disputeWindowDays, country, ...rest } = form;
    save.mutate({
      ...rest,
      country: countryName(country) || 'Australia',
      disputeWindowDays: disputeWindowDays.trim() ? Number(disputeWindowDays) : undefined,
    });
  };

  const setCountry = (code: string) => {
    if (!form) return;
    // Drop a state that doesn't belong to the new country's list.
    const subs = subdivisionsOf(code);
    const keepState = !form.state || subs.length === 0 || subs.some((x) => x.value === form.state);
    setForm({ ...form, country: code, ...(keepState ? {} : { state: '' }) });
  };

  const count = (keys: (keyof FormValues)[]) => keys.filter((k) => errors[k]).length;

  return (
    <Screen title="Settings" back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Muted size={13} style={{ marginHorizontal: 2, lineHeight: 19 }}>
        Your organisation's details — these print on every tax invoice and the pay page.
      </Muted>

      {q.isLoading ? (
        <Loading />
      ) : q.isError || !form || !q.data ? (
        <View style={{ marginTop: 14 }}>
          <ErrorBox message={errorMessage(q.error, 'Could not load settings')} onRetry={() => void q.refetch()} />
        </View>
      ) : (
        <>
          <Section
            icon="business-outline"
            title="Organisation"
            open={open.org}
            onToggle={() => setOpen((o) => ({ ...o, org: !o.org }))}
            errorCount={count(['companyName', 'legalName', 'abn', 'website'])}
          >
            <Field label="Company Name" error={errors.companyName}>
              <Input value={form.companyName} onChangeText={(t) => set('companyName', toTitleCase(t))} invalid={!!errors.companyName} maxLength={120} />
            </Field>
            <Field label="Legal / Registered Name" error={errors.legalName} hint="Shown as the issuing entity on invoices">
              <Input value={form.legalName} onChangeText={(t) => set('legalName', toTitleCase(t))} placeholder="EG Eloma" maxLength={160} />
            </Field>
            <Field label="ABN" error={errors.abn} hint="11 digits">
              <Input
                value={form.abn}
                onChangeText={(t) => set('abn', t)}
                placeholder="76 593 175 012"
                maxLength={14}
                keyboardType="number-pad"
                invalid={!!errors.abn}
              />
            </Field>
            <Field label="Website" error={errors.website}>
              <Input
                value={form.website}
                onChangeText={(t) => set('website', t)}
                placeholder="https://egdigital.com.au"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                maxLength={200}
              />
            </Field>
          </Section>

          <Section icon="location-outline" title="Trading Address" open={open.address} onToggle={() => setOpen((o) => ({ ...o, address: !o.address }))}>
            <Field label="Street Address">
              <Input value={form.addressLine1} onChangeText={(t) => set('addressLine1', toTitleCase(t))} placeholder="Address line 1" maxLength={160} />
            </Field>
            <Input
              value={form.addressLine2}
              onChangeText={(t) => set('addressLine2', toTitleCase(t))}
              placeholder="Address line 2 (optional)"
              maxLength={160}
              style={{ marginTop: 8 }}
            />
            <Field label="Country">
              <CountryField value={form.country} onChange={setCountry} />
            </Field>
            <Field label="City">
              <Input value={form.city} onChangeText={(t) => set('city', toTitleCase(t))} maxLength={80} />
            </Field>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="State" style={{ flex: 1.4 }}>
                <StateField country={form.country} value={form.state} onChange={(v) => set('state', v)} />
              </Field>
              <Field label="Postcode" style={{ flex: 1 }}>
                <Input
                  value={form.postcode}
                  onChangeText={(t) => set('postcode', t)}
                  maxLength={10}
                  keyboardType={form.country === 'AU' ? 'number-pad' : 'default'}
                />
              </Field>
            </View>
          </Section>

          <Section
            icon="mail-outline"
            title="Contact"
            description="Where customers reach you about invoices and support"
            open={open.contact}
            onToggle={() => setOpen((o) => ({ ...o, contact: !o.contact }))}
            errorCount={count(['billingEmail', 'supportEmail', 'disputeWindowDays'])}
          >
            <Field label="Billing Email" error={errors.billingEmail}>
              <Input
                value={form.billingEmail}
                onChangeText={(t) => set('billingEmail', t.trim())}
                placeholder="connect@egdigital.com.au"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                invalid={!!errors.billingEmail}
              />
            </Field>
            <Field label="Support Email" error={errors.supportEmail}>
              <Input
                value={form.supportEmail}
                onChangeText={(t) => set('supportEmail', t.trim())}
                placeholder="support@egdigital.com.au"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                invalid={!!errors.supportEmail}
              />
            </Field>
            <Field label="Phone">
              <PhoneField
                country={form.phoneCountry}
                onCountryChange={(c) => set('phoneCountry', c)}
                value={form.phone}
                onChange={(d) => set('phone', d)}
              />
            </Field>
            <Field
              label="Invoice Dispute Window"
              error={errors.disputeWindowDays}
              hint="Days customers have to raise a dispute — printed on the invoice"
            >
              <Input
                value={form.disputeWindowDays}
                onChangeText={(t) => set('disputeWindowDays', t.replace(/\D/g, ''))}
                maxLength={3}
                keyboardType="number-pad"
                invalid={!!errors.disputeWindowDays}
              />
            </Field>
          </Section>

          <Section
            icon="shield-checkmark-outline"
            title="Regional"
            description="Locale and currency are set per environment and apply platform-wide"
            open={open.regional}
            onToggle={() => setOpen((o) => ({ ...o, regional: !o.regional }))}
          >
            <Field label="Locale" hint="Set via DEFAULT_LOCALE">
              <Input value={q.data.locale} disabled />
            </Field>
            <Field label="Currency" hint="Set via DEFAULT_CURRENCY">
              <Input value={q.data.currency} disabled />
            </Field>
          </Section>

          <Btn
            title="Save changes"
            icon="save-outline"
            onPress={onSave}
            loading={save.isPending}
            disabled={!dirty}
            style={{ marginTop: 18 }}
          />
          {dirty ? (
            <Btn
              title="Discard changes"
              variant="ghost"
              onPress={() => {
                setForm(initial);
                setErrors({});
              }}
              style={{ marginTop: 10 }}
            />
          ) : null}
        </>
      )}

      <Card onPress={() => nav.navigate('SettingsAccessPins')} style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="key-outline" size={18} color={colors.green} />
        </View>
        <View style={{ flex: 1 }}>
          <T w="s" size={15}>
            Access PINs
          </T>
          <Muted size={12.5} style={{ marginTop: 2 }}>
            Everyone's 6-digit PIN for opening a task's Access Point tab
          </Muted>
        </View>
        <Pressable hitSlop={8} onPress={() => nav.navigate('SettingsAccessPins')}>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </Pressable>
      </Card>
    </Screen>
  );
}
