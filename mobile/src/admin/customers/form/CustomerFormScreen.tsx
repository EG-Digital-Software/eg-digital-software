import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Bar, Btn, Card, ErrorBox, Eyebrow, Loading, Muted, Pill, Screen, T } from '../../../ui';
import { colors } from '../../../theme';
import { errorMessage } from '../../../api/client';
import type { PickedFile } from '../../../api/tasks';
import { customerFormApi, type AbnLookupResult } from '../../../api/admin/customerForm';
import { formatAbn, formatAcn } from '../../../lib/portal';
import { DEFAULT_COUNTRY } from './countries';
import { AddressFields } from './AddressFields';
import { CredentialSection } from './CredentialSection';
import { DocumentsSection } from './DocumentsSection';
import { ProductsSection } from './ProductsSection';
import {
  CheckRow,
  CountryField,
  Field,
  Input,
  PhoneField,
  PickerSheet,
  Section,
  Segmented,
  SelectField,
  SmallBtn,
  SubHead,
  Tile,
  st,
} from './fields';
import {
  ACCOUNT_STATUSES,
  BUSINESS_TYPES,
  DEFAULTS,
  EMPTY_DIRECTOR,
  EMPTY_IT_CONTACT,
  businessTypeLabel,
  clean,
  companyFieldsFor,
  fromCustomer,
  isValidAbn,
  progressOf,
  toPayload,
  toTitleCase,
  validate,
  type AddressValues,
  type DirectorValues,
  type Errors,
  type FormValues,
  type ItContactValues,
} from './model';

type SectionKey = 'credential' | 'company' | 'contact' | 'directors' | 'invoicing' | 'it' | 'products' | 'documents';

/** Which error paths belong to which section (for badges and auto-expanding). */
const SECTION_OF: [SectionKey, (path: string) => boolean][] = [
  ['credential', (p) => p.startsWith('credential.')],
  ['company', (p) => p.startsWith('companyIdentifiers.')],
  ['contact', (p) => p.startsWith('contact') || p.startsWith('authorized')],
  ['directors', (p) => p.startsWith('directors.')],
  ['invoicing', (p) => p.startsWith('billing') || p === 'creditScore'],
  ['it', (p) => p.startsWith('itContacts.')],
  ['products', (p) => p.startsWith('assignedProducts.')],
];
const sectionOf = (path: string): SectionKey | undefined => SECTION_OF.find(([, m]) => m(path))?.[0];

const SECTION_TITLE: Record<SectionKey, string> = {
  credential: 'Customer Credential',
  company: 'Company Information',
  contact: 'Contact Information',
  directors: 'Company C-Suite Details',
  invoicing: 'Invoicing Details',
  it: 'IT Details',
  products: 'Products',
  documents: 'Agreement Document',
};

const ALL_OPEN: Record<SectionKey, boolean> = {
  credential: true,
  company: true,
  contact: true,
  directors: true,
  invoicing: true,
  it: true,
  products: true,
  documents: true,
};

const emailProps = {
  keyboardType: 'email-address' as const,
  autoCapitalize: 'none' as const,
  autoCorrect: false,
  autoComplete: 'off' as const,
};

/**
 * Admin: add / edit a customer — a phone port of the web CustomerFormPage.
 * Route params: { clientId?: string } (none = new customer).
 */
export default function CustomerFormScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const clientId: string | undefined = route.params?.clientId || undefined;
  const isEdit = !!clientId;
  const qc = useQueryClient();

  // ── Data ──
  const existingQ = useQuery({
    queryKey: ['admin-customer-form', clientId],
    queryFn: () => customerFormApi.get(clientId!),
    enabled: isEdit,
  });
  const existing = existingQ.data;
  const nextIdQ = useQuery({
    queryKey: ['admin-customer-form', 'next-client-id'],
    queryFn: customerFormApi.nextClientId,
    enabled: !isEdit,
  });
  const productsQ = useQuery({
    queryKey: ['admin-customer-form', 'products'],
    queryFn: customerFormApi.activeProducts,
    enabled: !isEdit,
  });
  const teamQ = useQuery({
    queryKey: ['admin-customer-form', 'team'],
    queryFn: customerFormApi.teamMembers,
  });

  // ── Form state ──
  const [v, setV] = useState<FormValues>(DEFAULTS);
  const [submitted, setSubmitted] = useState(false);
  const [open, setOpen] = useState(ALL_OPEN);
  const [staged, setStaged] = useState<PickedFile[]>([]);
  const loaded = useRef(false);
  const initialManager = useRef('');

  useEffect(() => {
    if (!existing || loaded.current) return;
    loaded.current = true;
    initialManager.current = existing.accountManagerId ?? '';
    setV(fromCustomer(existing));
  }, [existing]);

  const patch = (p: Partial<FormValues>) => setV((prev) => ({ ...prev, ...p }));
  const setAddr = (key: 'principalAddress' | 'billingAddress', p: Partial<AddressValues>) =>
    setV((prev) => ({ ...prev, [key]: { ...prev[key], ...p } }));
  const setDirector = (i: number, p: Partial<DirectorValues>) =>
    setV((prev) => ({ ...prev, directors: prev.directors.map((d, j) => (j === i ? { ...d, ...p } : d)) }));
  const setIt = (i: number, p: Partial<ItContactValues>) =>
    setV((prev) => ({ ...prev, itContacts: prev.itContacts.map((c, j) => (j === i ? { ...c, ...p } : c)) }));
  const setIdent = (key: string, value: string) =>
    setV((prev) => ({ ...prev, companyIdentifiers: { ...prev.companyIdentifiers, [key]: value } }));
  const toggle = (k: SectionKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  // "Same as Contact Info" mirrors the contact person into Director 1.
  useEffect(() => {
    if (!v.sameAsContactInfo) return;
    const parts = v.contactPerson.split(' ');
    setV((prev) => ({
      ...prev,
      directors: prev.directors.map((d, i) =>
        i === 0
          ? {
              firstName: parts[0] || '',
              middleName: '',
              lastName: parts.slice(1).join(' '),
              email: prev.contactEmail,
              contactNumber: prev.contactMobile,
              contactNumberCountry: prev.contactMobileCountry || DEFAULT_COUNTRY,
            }
          : d
      ),
    }));
  }, [v.sameAsContactInfo, v.contactPerson, v.contactEmail, v.contactMobile, v.contactMobileCountry]);

  // Errors show after the first save attempt, then update live.
  const errors: Errors = useMemo(() => (submitted ? validate(v, isEdit) : {}), [submitted, v, isEdit]);
  const countFor = (k: SectionKey) => Object.keys(errors).filter((p) => sectionOf(p) === k).length;
  const progress = progressOf(v);

  // ── ABN lookup + "Fetch from CreditorWatch" ──
  const [abnLooking, setAbnLooking] = useState(false);
  const [abnResult, setAbnResult] = useState<AbnLookupResult | null>(null);
  const [addrFetching, setAddrFetching] = useState(false);
  const abnDigits = (v.companyIdentifiers.abn ?? '').replace(/\D/g, '');

  const abnReady = () => {
    if (isValidAbn(abnDigits)) return true;
    Alert.alert(
      'Check the ABN',
      abnDigits.length === 11 ? 'That ABN fails its check digits — retype it and try again.' : 'Enter all 11 digits of the ABN first.'
    );
    return false;
  };

  /** Fill Company Information from the Australian Business Register. */
  const lookupAbn = async () => {
    if (!abnReady()) return;
    setAbnLooking(true);
    try {
      const found = await customerFormApi.lookupAbn(abnDigits);
      setAbnResult(found);
      setV((prev) => ({
        ...prev,
        companyIdentifiers: {
          ...prev.companyIdentifiers,
          ...(found.abn ? { abn: formatAbn(found.abn) } : {}),
          ...(found.acn ? { acn: formatAcn(found.acn) } : {}),
        },
        ...(found.entityName ? { companyName: toTitleCase(found.entityName) } : {}),
        ...(found.businessNames?.length ? { tradingNames: found.businessNames.map(toTitleCase) } : {}),
        // The ABR only covers Australian entities, so the country is a given.
        principalAddress: { ...prev.principalAddress, country: 'AU', ...(found.postcode ? { postcode: found.postcode } : {}) },
      }));
      if (found.abnStatus && found.abnStatus.toLowerCase() !== 'active') {
        Alert.alert('ABN not active', `This ABN is ${found.abnStatus.toLowerCase()} on the register.`);
      }
    } catch (e) {
      setAbnResult(null);
      Alert.alert('Could not look that ABN up', errorMessage(e));
    } finally {
      setAbnLooking(false);
    }
  };

  /** Fill the Principal Address's postcode / city / country via the ABN (as the web does). */
  const fetchPrincipal = async () => {
    if (!abnReady()) return;
    setAddrFetching(true);
    try {
      const found = await customerFormApi.lookupAbn(abnDigits);
      setAddr('principalAddress', { country: 'AU', ...(found.postcode ? { postcode: found.postcode } : {}) });
      let city = '';
      if (found.postcode) {
        try {
          const [hit] = await customerFormApi.searchAddresses([found.postcode, found.state, 'Australia'].filter(Boolean).join(' '), 'AU');
          if (hit?.city) {
            city = hit.city;
            setAddr('principalAddress', { city: hit.city });
          }
        } catch {
          // The city is a bonus — the postcode is already in.
        }
      }
      if (!found.postcode) Alert.alert('No address found', 'CreditorWatch returned no address for this ABN — enter it manually.');
      else
        Alert.alert(
          'Address filled',
          `Filled from CreditorWatch (${[city, found.state, found.postcode].filter(Boolean).join(' ')}) — add the street line manually.`
        );
    } catch (e) {
      Alert.alert('Could not fetch the address from CreditorWatch', errorMessage(e));
    } finally {
      setAddrFetching(false);
    }
  };

  // ── Business types (several presets and/or custom, stored comma-separated) ──
  const businessTypes = v.businessType
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const setBusinessTypes = (arr: string[]) => patch({ businessType: Array.from(new Set(arr)).join(', ') });
  const [btCustom, setBtCustom] = useState('');
  const [btOpen, setBtOpen] = useState(false);
  const addCustomBt = () => {
    if (!btCustom.trim()) return;
    setBusinessTypes([...businessTypes, btCustom.trim()]);
    setBtCustom('');
  };

  // ── Save ──
  const save = useMutation({
    mutationFn: async () => {
      const payload = toPayload(v, { isEdit, initialManagerId: initialManager.current });
      const saved = isEdit ? await customerFormApi.update(clientId!, payload) : await customerFormApi.create(payload);
      const target = saved?.clientId ?? clientId!;
      // Upload staged agreement documents now that the customer exists.
      let uploadError: string | null = null;
      for (const f of staged) {
        try {
          await customerFormApi.uploadDocument(target, f);
        } catch (e) {
          uploadError = errorMessage(e);
          break;
        }
      }
      return { target, uploadError };
    },
    onSuccess: async ({ target, uploadError }) => {
      setStaged([]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-customers'] }),
        qc.invalidateQueries({ queryKey: ['admin-customer'] }),
        qc.invalidateQueries({ queryKey: ['admin-customer-form'] }),
        qc.invalidateQueries({ queryKey: ['admin-dashboard'] }),
      ]);
      if (uploadError) Alert.alert('Saved, but a document did not upload', uploadError);
      if (isEdit) nav.goBack();
      else nav.replace('CustomerDetail', { clientId: target });
    },
    onError: (e) => Alert.alert(isEdit ? 'Could not save changes' : 'Could not create customer', errorMessage(e)),
  });

  const onSave = () => {
    setSubmitted(true);
    const errs = validate(v, isEdit);
    const keys = Object.keys(errs);
    if (keys.length) {
      // Expand every section holding a problem so the messages are visible.
      setOpen((o) => {
        const next = { ...o };
        keys.forEach((k) => {
          const sec = sectionOf(k);
          if (sec) next[sec] = true;
        });
        return next;
      });
      Alert.alert('Check the form', `${keys.length} field${keys.length === 1 ? ' needs' : 's need'} attention — they are marked in red.`);
      return;
    }
    save.mutate();
  };

  // ── Render ──
  const title = isEdit ? 'Edit customer' : 'Add customer';
  if (isEdit && existingQ.isLoading) {
    return (
      <Screen title={title} back>
        <Loading />
      </Screen>
    );
  }
  if (isEdit && existingQ.error && !existing) {
    return (
      <Screen title={title} back>
        <ErrorBox message={errorMessage(existingQ.error, 'Could not load this customer')} onRetry={() => existingQ.refetch()} />
      </Screen>
    );
  }

  const companyFields = companyFieldsFor(v.registrationCountry);
  const err = (path: string) => errors[path];
  const errorSections = Array.from(new Set(Object.keys(errors).map(sectionOf).filter(Boolean))) as SectionKey[];
  const teamOptions = [
    { value: '', label: 'Unassigned' },
    ...(teamQ.data ?? []).map((m) => ({
      value: m.id,
      label: `${[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || 'Team member'}${m.designation ? ` — ${m.designation}` : ''}`,
    })),
  ];

  return (
    <Screen title={title} back padBottom={40}>
      {/* Header + completion meter */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 }}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Customers</Eyebrow>
          <T w="b" size={22} style={{ marginTop: 4 }}>
            {title}
          </T>
          <Muted size={13} style={{ marginTop: 2 }}>
            {isEdit ? `Update the record for ${existing?.clientId ?? clientId}.` : 'Create a new client record.'}
          </Muted>
        </View>
        <Pill kind={isEdit ? 'info' : 'ok'} label={isEdit ? 'Editing' : 'New record'} />
      </View>
      <Card style={{ padding: 14, marginTop: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <Eyebrow>Your progress</Eyebrow>
          <T w="b" size={17} color={colors.green}>
            {progress}%{' '}
            <T size={12.5} color={colors.muted}>
              to complete
            </T>
          </T>
        </View>
        <Bar pct={progress} />
      </Card>

      {/* ── Customer Credential (admin) ── */}
      <CredentialSection
        email={v.credential.email}
        password={v.credential.password}
        onEmail={(email) => setV((p) => ({ ...p, credential: { ...p.credential, email } }))}
        onPassword={(password) => setV((p) => ({ ...p, credential: { ...p.credential, password } }))}
        emailError={err('credential.email')}
        passwordError={err('credential.password')}
        isEdit={isEdit}
        clientId={clientId}
        hasCredential={existing?.hasCredential}
        open={open.credential}
        onToggle={() => toggle('credential')}
      />

      {/* ── Company Information ── */}
      <Section icon="business-outline" title="Company Information" open={open.company} onToggle={() => toggle('company')} errorCount={countFor('company')}>
        <Field label="Registration Country" hint="The company identifiers below depend on this">
          <CountryField value={v.registrationCountry} onChange={(c) => patch({ registrationCountry: c })} />
        </Field>
        {companyFields.map((f) => {
          const e = err(`companyIdentifiers.${f.key}`);
          const value = v.companyIdentifiers[f.key] ?? '';
          return (
            <Field key={f.key} label={f.label} hint={f.hint} error={e}>
              {f.lookup ? (
                <View style={{ gap: 8 }}>
                  <Input
                    value={value}
                    onChangeText={(t) => setIdent(f.key, clean('abn', t))}
                    maxLength={f.maxLength ? f.maxLength + 3 : undefined}
                    placeholder="51 824 753 556"
                    keyboardType="number-pad"
                    invalid={!!e}
                  />
                  <SmallBtn title={abnLooking ? 'Looking up…' : 'ABN Lookup'} icon="search" onPress={lookupAbn} loading={abnLooking} tone="green" style={{ alignSelf: 'flex-start' }} />
                </View>
              ) : (
                <Input
                  value={value}
                  onChangeText={(t) => setIdent(f.key, clean(f.kind, t))}
                  maxLength={f.maxLength}
                  keyboardType={f.kind === 'int' ? 'number-pad' : 'default'}
                  autoCapitalize={f.kind === 'alnum' ? 'characters' : 'words'}
                  autoCorrect={false}
                  invalid={!!e}
                />
              )}
            </Field>
          );
        })}

        {abnResult ? (
          <View style={[st.tile, { backgroundColor: colors.greenTint, borderColor: colors.greenSoft }]}>
            <T w="s" size={14}>
              From the Business Register
            </T>
            {(
              [
                ['ABN status', abnResult.abnStatus],
                ['Entity type', abnResult.entityTypeName],
                ['State', abnResult.state],
                ['GST registered from', abnResult.gstFrom],
              ] as const
            )
              .filter(([, val]) => !!val)
              .map(([label, val]) => (
                <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
                  <Muted size={13}>{label}</Muted>
                  <T w="s" size={13} style={{ flexShrink: 1, textAlign: 'right' }}>
                    {val}
                  </T>
                </View>
              ))}
            <Muted size={12} style={{ marginTop: 10, lineHeight: 17 }}>
              The register publishes only the postcode and state of the main address — add the street and suburb below.
            </Muted>
          </View>
        ) : null}

        <Field label="Business Name">
          <Input value={v.companyName} onChangeText={(t) => patch({ companyName: toTitleCase(t) })} />
        </Field>

        <Field
          label="Trading As"
          hint={v.tradingNames.length > 1 ? `${v.tradingNames.length} trading names — the first is the primary` : undefined}
        >
          <View style={{ gap: 8 }}>
            {v.tradingNames.map((name, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Input
                  value={name}
                  placeholder={i === 0 ? 'Primary trading name' : `Trading name ${i + 1}`}
                  onChangeText={(t) => setV((p) => ({ ...p, tradingNames: p.tradingNames.map((n, j) => (j === i ? toTitleCase(t) : n)) }))}
                  style={{ flex: 1 }}
                />
                {v.tradingNames.length > 1 ? (
                  <Pressable
                    hitSlop={8}
                    accessibilityLabel={`Remove trading name ${i + 1}`}
                    onPress={() => setV((p) => ({ ...p, tradingNames: p.tradingNames.filter((_, j) => j !== i) }))}
                  >
                    <Ionicons name="trash-outline" size={19} color={colors.redFg} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            <SmallBtn title="Add trading name" icon="add" onPress={() => setV((p) => ({ ...p, tradingNames: [...p.tradingNames, ''] }))} style={{ alignSelf: 'flex-start' }} />
          </View>
        </Field>

        <Field label="Business Type" hint="Select one or more; add a custom type if needed">
          {businessTypes.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {businessTypes.map((bt) => (
                <Pressable
                  key={bt}
                  onPress={() => setBusinessTypes(businessTypes.filter((x) => x !== bt))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.greenChip }}
                  accessibilityLabel={`Remove ${businessTypeLabel(bt)}`}
                >
                  <T w="s" size={12.5} color={colors.greenChipText}>
                    {businessTypeLabel(bt)}
                  </T>
                  <Ionicons name="close" size={14} color={colors.greenChipText} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <SmallBtn title="Add business type" icon="add" onPress={() => setBtOpen(true)} style={{ alignSelf: 'flex-start' }} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Input
              value={btCustom}
              onChangeText={(t) => setBtCustom(toTitleCase(t))}
              placeholder="Or add a custom business type"
              onSubmitEditing={addCustomBt}
              returnKeyType="done"
              maxLength={60}
              style={{ flex: 1 }}
            />
            <SmallBtn title="Add" icon="add" onPress={addCustomBt} disabled={!btCustom.trim()} style={{ alignSelf: 'center' }} />
          </View>
          <PickerSheet
            open={btOpen}
            onClose={() => setBtOpen(false)}
            title="Add business type"
            options={BUSINESS_TYPES.filter((t) => !businessTypes.includes(t.value))}
            onPick={(val) => setBusinessTypes([...businessTypes, val])}
          />
        </Field>

        <Field label="Customer ID" hint="Generated automatically — unique per customer">
          <Input
            value={isEdit ? existing?.clientId ?? '' : nextIdQ.data ?? ''}
            placeholder="Auto-generated"
            editable={false}
            style={{ backgroundColor: colors.track }}
          />
        </Field>

        <Field label="Account Manager" hint="The team member who looks after this client">
          <SelectField
            value={v.accountManagerId}
            options={teamOptions}
            onChange={(id) => patch({ accountManagerId: id })}
            title="Account manager"
            placeholder={teamQ.isLoading ? 'Loading team…' : 'Unassigned'}
            searchable={teamOptions.length > 8}
          />
        </Field>

        {/* Principal Address */}
        <SubHead
          title="Principal Address"
          right={<SmallBtn title={addrFetching ? 'Fetching…' : 'Fetch from CreditorWatch'} icon="search" onPress={fetchPrincipal} loading={addrFetching} />}
        />
        <Muted size={12} style={{ marginTop: 6, lineHeight: 17 }}>
          Fills postcode, suburb and country from CreditorWatch (via ABN) — add the street line yourself, or enter the whole address
          manually below.
        </Muted>
        <AddressFields value={v.principalAddress} onChange={(p) => setAddr('principalAddress', p)} />

        {/* Billing Address */}
        <SubHead title="Billing Address" />
        <CheckRow label="Same as principal address" value={v.sameAsPrincipal} onChange={(x) => patch({ sameAsPrincipal: x })} />
        {v.sameAsPrincipal ? (
          <Muted size={12.5} style={{ marginTop: 6 }}>
            Invoices go to the principal address.
          </Muted>
        ) : (
          <AddressFields value={v.billingAddress} onChange={(p) => setAddr('billingAddress', p)} />
        )}
      </Section>

      {/* ── Contact Information ── */}
      <Section icon="person-circle-outline" title="Contact Information" open={open.contact} onToggle={() => toggle('contact')} errorCount={countFor('contact')}>
        <Field label="Contact Name">
          <Input value={v.contactPerson} onChangeText={(t) => patch({ contactPerson: toTitleCase(clean('letters', t)) })} autoComplete="name" />
        </Field>
        <Field label="Contact Email" error={err('contactEmail')}>
          <Input {...emailProps} value={v.contactEmail} onChangeText={(t) => patch({ contactEmail: clean('email', t) })} invalid={!!err('contactEmail')} />
        </Field>
        <Field label="Contact Mobile" error={err('contactMobile')}>
          <PhoneField
            country={v.contactMobileCountry}
            onCountryChange={(c) => patch({ contactMobileCountry: c })}
            value={v.contactMobile}
            onChange={(d) => patch({ contactMobile: d })}
            invalid={!!err('contactMobile')}
          />
        </Field>
        <Field label="Contact Position">
          <Input value={v.contactPosition} placeholder="e.g. Operations Manager" onChangeText={(t) => patch({ contactPosition: toTitleCase(t) })} />
        </Field>
        <Field label="Authorised">
          <Segmented
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes' },
            ]}
            value={v.authorized}
            onChange={(a) => patch({ authorized: a })}
          />
        </Field>

        {v.authorized === 'no' ? (
          <>
            <SubHead title="Authorised Representative" />
            <Field label="Authorised Person" error={err('authorizedPerson')}>
              <Input value={v.authorizedPerson} onChangeText={(t) => patch({ authorizedPerson: toTitleCase(clean('letters', t)) })} />
            </Field>
            <Field label="Authorised Email" error={err('authorizedEmail')}>
              <Input {...emailProps} value={v.authorizedEmail} onChangeText={(t) => patch({ authorizedEmail: clean('email', t) })} invalid={!!err('authorizedEmail')} />
            </Field>
            <Field label="Authorised Mobile" error={err('authorizedMobile')}>
              <PhoneField
                country={v.authorizedMobileCountry}
                onCountryChange={(c) => patch({ authorizedMobileCountry: c })}
                value={v.authorizedMobile}
                onChange={(d) => patch({ authorizedMobile: d })}
                invalid={!!err('authorizedMobile')}
              />
            </Field>
          </>
        ) : null}
      </Section>

      {/* ── Company C-Suite Details ── */}
      <Section
        icon="people-outline"
        title="Company C-Suite Details"
        description="Every director we may need to contact about this account."
        open={open.directors}
        onToggle={() => toggle('directors')}
        errorCount={countFor('directors')}
      >
        <CheckRow
          label="Same as Contact Info"
          value={v.sameAsContactInfo}
          onChange={(on) =>
            setV((p) => ({
              ...p,
              sameAsContactInfo: on,
              // Unticking clears Director 1 again (country kept), like the web form.
              directors: on
                ? p.directors
                : p.directors.map((d, i) => (i === 0 ? { ...d, firstName: '', middleName: '', lastName: '', email: '', contactNumber: '' } : d)),
            }))
          }
        />
        {v.directors.map((d, i) => {
          const e = (k: keyof DirectorValues) => err(`directors.${i}.${k}`);
          return (
            <Tile
              key={i}
              title={`Director ${i + 1}`}
              onRemove={v.directors.length > 1 ? () => setV((p) => ({ ...p, directors: p.directors.filter((_, j) => j !== i) })) : undefined}
            >
              <Field label="First Name" error={e('firstName')}>
                <Input value={d.firstName} placeholder="First name" onChangeText={(t) => setDirector(i, { firstName: toTitleCase(clean('letters', t)) })} invalid={!!e('firstName')} />
              </Field>
              <Field label="Middle Name" error={e('middleName')}>
                <Input
                  value={d.middleName}
                  placeholder="Middle name (optional)"
                  onChangeText={(t) => setDirector(i, { middleName: toTitleCase(clean('letters', t)) })}
                  invalid={!!e('middleName')}
                />
              </Field>
              <Field label="Last Name" error={e('lastName')}>
                <Input value={d.lastName} placeholder="Last name" onChangeText={(t) => setDirector(i, { lastName: toTitleCase(clean('letters', t)) })} invalid={!!e('lastName')} />
              </Field>
              <Field label="Director Email Address" error={e('email')}>
                <Input
                  {...emailProps}
                  value={d.email}
                  placeholder="director@example.com"
                  onChangeText={(t) => setDirector(i, { email: clean('email', t) })}
                  invalid={!!e('email')}
                />
              </Field>
              <Field label="Director Contact Number" error={e('contactNumber')}>
                <PhoneField
                  country={d.contactNumberCountry}
                  onCountryChange={(c) => setDirector(i, { contactNumberCountry: c })}
                  value={d.contactNumber}
                  onChange={(n) => setDirector(i, { contactNumber: n })}
                  invalid={!!e('contactNumber')}
                />
              </Field>
            </Tile>
          );
        })}
        <Btn
          title="Add More Director"
          icon="add"
          variant="dashed"
          onPress={() => setV((p) => ({ ...p, directors: [...p.directors, { ...EMPTY_DIRECTOR }] }))}
          style={{ marginTop: 14 }}
        />
        <Muted size={12} style={{ marginTop: 8 }}>
          A director is saved once it has an email address.
        </Muted>
      </Section>

      {/* ── Invoicing Details ── */}
      <Section
        icon="receipt-outline"
        title="Invoicing Details"
        description="Invoices and payment reminders are sent to the accounts contact"
        open={open.invoicing}
        onToggle={() => toggle('invoicing')}
        errorCount={countFor('invoicing')}
      >
        <Field label="Accounts Person Name">
          <Input value={v.billingContactPerson} onChangeText={(t) => patch({ billingContactPerson: toTitleCase(clean('letters', t)) })} />
        </Field>
        <Field label="Accounts Person Mobile" error={err('billingContactNumber')}>
          <PhoneField
            country={v.billingContactNumberCountry}
            onCountryChange={(c) => patch({ billingContactNumberCountry: c })}
            value={v.billingContactNumber}
            onChange={(d) => patch({ billingContactNumber: d })}
            invalid={!!err('billingContactNumber')}
          />
        </Field>
        <Field label="Accounts Person Email" error={err('billingEmail')}>
          <Input {...emailProps} value={v.billingEmail} onChangeText={(t) => patch({ billingEmail: clean('email', t) })} invalid={!!err('billingEmail')} />
        </Field>
        <Field label="Credit Score" error={err('creditScore')} hint="0 – 1200">
          <Input
            value={v.creditScore}
            placeholder="0 – 1200"
            maxLength={4}
            keyboardType="number-pad"
            onChangeText={(t) => patch({ creditScore: clean('int', t) })}
            invalid={!!err('creditScore')}
          />
        </Field>
        <Field label="Account Status" hint="Active auto-marks as Dormant after 6 months without an invoice; pin Dormant or Suspended to override">
          <SelectField
            value={v.accountStatus}
            options={ACCOUNT_STATUSES.map((x) => ({ value: x.value, label: x.label }))}
            onChange={(x) => patch({ accountStatus: x as FormValues['accountStatus'] })}
            title="Account status"
          />
        </Field>
      </Section>

      {/* ── IT Details ── */}
      <Section
        icon="server-outline"
        title="IT Details"
        description="Technical contacts for this customer — add as many as you need."
        open={open.it}
        onToggle={() => toggle('it')}
        errorCount={countFor('it')}
      >
        {v.itContacts.map((c, i) => {
          const e = (k: keyof ItContactValues) => err(`itContacts.${i}.${k}`);
          return (
            <Tile
              key={i}
              title={`IT Contact ${i + 1}`}
              onRemove={v.itContacts.length > 1 ? () => setV((p) => ({ ...p, itContacts: p.itContacts.filter((_, j) => j !== i) })) : undefined}
            >
              <Field label="Name">
                <Input value={c.name} placeholder="Full name" onChangeText={(t) => setIt(i, { name: toTitleCase(t) })} />
              </Field>
              <Field label="Email" error={e('email')}>
                <Input {...emailProps} value={c.email} placeholder="name@example.com" onChangeText={(t) => setIt(i, { email: clean('email', t) })} invalid={!!e('email')} />
              </Field>
              <Field label="Phone Number" error={e('phone')}>
                <PhoneField
                  country={c.phoneCountry}
                  onCountryChange={(x) => setIt(i, { phoneCountry: x })}
                  value={c.phone}
                  onChange={(n) => setIt(i, { phone: n })}
                  invalid={!!e('phone')}
                />
              </Field>
            </Tile>
          );
        })}
        <Btn
          title="Add"
          icon="add"
          variant="dashed"
          onPress={() => setV((p) => ({ ...p, itContacts: [...p.itContacts, { ...EMPTY_IT_CONTACT }] }))}
          style={{ marginTop: 14 }}
        />
      </Section>

      {/* ── Products (assigned at creation; managed later from the detail screen) ── */}
      {!isEdit ? (
        <ProductsSection
          rows={v.assignedProducts}
          products={productsQ.data ?? []}
          onChange={(rows) => patch({ assignedProducts: rows })}
          errors={errors}
          open={open.products}
          onToggle={() => toggle('products')}
        />
      ) : null}

      {/* ── Agreement Document ── */}
      <DocumentsSection
        clientId={clientId}
        existing={existing?.documents ?? []}
        staged={staged}
        onStaged={setStaged}
        open={open.documents}
        onToggle={() => toggle('documents')}
      />

      {/* ── Error summary + actions ── */}
      {errorSections.length ? (
        <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: colors.redBg, gap: 4 }}>
          <T w="s" size={13.5} color={colors.redFg}>
            Fix the fields marked in red in:
          </T>
          {errorSections.map((sec) => (
            <T key={sec} size={13} color={colors.redFg}>
              • {SECTION_TITLE[sec]} ({countFor(sec)})
            </T>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <Muted size={12.5} style={{ flex: 1 }}>
          {progress}% complete
        </Muted>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <Btn title="Cancel" variant="ghost" onPress={() => nav.goBack()} disabled={save.isPending} style={{ flex: 1 }} />
        <Btn title={isEdit ? 'Save changes' : 'Create customer'} onPress={onSave} loading={save.isPending} style={{ flex: 1.6 }} />
      </View>
    </Screen>
  );
}
