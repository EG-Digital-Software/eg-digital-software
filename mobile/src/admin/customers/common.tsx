import React from 'react';
import { View, TextInput, Pressable, type StyleProp, type ViewStyle, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';
import { Muted, T, type IconName, type PillKind } from '../../ui';
import { colors, fonts } from '../../theme';
import type { AccountStatus, AdminAddress, AdminCustomer, AdminCustomerProduct, AdminDocument } from '../../api/admin/customers';

// Query keys (invalidate both after a change to one customer).
export const LIST_KEY = ['admin-customers', 'list'] as const;
export const customerKey = (clientId: string) => ['admin-customer', clientId] as const;

export const ACCOUNT_STATUS: Record<AccountStatus, { label: string; kind: PillKind }> = {
  ACTIVE: { label: 'Active', kind: 'ok' },
  ACTIVE_TRIAL: { label: 'Active-Trial', kind: 'on' },
  DORMANT: { label: 'Dormant', kind: 'warn' },
  SUSPENDED: { label: 'Suspended', kind: 'red' },
};

export const statusOf = (c: Pick<AdminCustomer, 'accountStatus' | 'accountStatusEffective'>) =>
  ACCOUNT_STATUS[c.accountStatusEffective ?? c.accountStatus] ?? ACCOUNT_STATUS.ACTIVE;

/** Principal address is the customer's real-world location; fall back to billing. */
export const primaryAddress = (c: Pick<AdminCustomer, 'addresses'>) =>
  c.addresses?.find((a) => a.type === 'PRINCIPAL') ?? c.addresses?.find((a) => a.type === 'BILLING');

/** Street, then locality, then country — the way the form collects it. */
export function addressText(a?: AdminAddress): string | null {
  if (!a) return null;
  const locality = [a.city, a.state, a.postcode].filter(Boolean).join(' ');
  const parts = [a.line1, a.line2, locality, a.country].map((p) => (p ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}

export const num = (v: unknown) => Number(v) || 0;

export function invoiceSummary(c: AdminCustomer): { label: string; kind: PillKind } {
  const invs = c.invoices ?? [];
  if (!invs.length) return { label: 'No invoices', kind: 'ns' };
  const outstanding = invs.filter((i) => num(i.total) > num(i.amountPaid)).length;
  return outstanding ? { label: `${outstanding} outstanding`, kind: 'warn' } : { label: 'Paid', kind: 'ok' };
}

// Company identifier labels by key (web's lib/company.ts, short form).
const ID_LABEL: Record<string, string> = {
  abn: 'ABN',
  acn: 'ACN',
  companyNumber: 'Company Number',
  vat: 'VAT Number',
  ein: 'EIN',
  stateOfIncorporation: 'State of Incorporation',
  cin: 'CIN',
  gstin: 'GSTIN',
  pan: 'PAN',
  nzbn: 'NZBN',
  gst: 'GST Number',
  bn: 'Business Number',
  gstHst: 'GST/HST Number',
  uen: 'UEN',
  hrb: 'Commercial Register No.',
  siren: 'SIREN',
  siret: 'SIRET',
  tradeLicense: 'Trade License Number',
  trn: 'TRN',
  registrationNumber: 'Company Registration Number',
  cro: 'CRO Number',
  taxId: 'Tax ID / VAT Number',
};
export const identifierLabel = (key: string) => ID_LABEL[key] ?? key;

// ─── Products / licences ──────────────────────────────────

export const cpUnits = (cp: AdminCustomerProduct) => (cp.unitHoursEnabled ? Number(cp.unitHours) || 0 : 1);
export const cpDiscount = (cp: AdminCustomerProduct) => Number(cp.discountPercent) || 0;
export const cpNet = (cp: AdminCustomerProduct) => (Number(cp.price) || 0) * (1 - cpDiscount(cp) / 100) * cpUnits(cp);
export const cpBasisSuffix = (cp: AdminCustomerProduct) =>
  cp.priceBasis === 'DAILY' ? ' / day' : cp.priceBasis === 'MONTHLY' ? ' / month' : '';
export function cpTotals(cp: AdminCustomerProduct) {
  const net = cpNet(cp);
  const rate = Number(cp.taxRate ?? 10) || 0;
  const gst = (cp.gstType ?? 'EXCLUSIVE') === 'INCLUSIVE' ? 0 : net * (rate / 100);
  return { net, gst, total: net + gst };
}

export interface LicenceGroup {
  key: string;
  items: AdminCustomerProduct[];
}

/** Products assigned together share one licence key — one group per key. */
export function licenceGroups(c: Pick<AdminCustomer, 'customerProducts'>): LicenceGroup[] {
  const map = new Map<string, AdminCustomerProduct[]>();
  for (const cp of c.customerProducts ?? []) {
    const key = cp.licence?.licenceKey ?? `__${cp.id}`;
    const arr = map.get(key);
    if (arr) arr.push(cp);
    else map.set(key, [cp]);
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }));
}

/** Days until expiry, 'Expired' when past, '—' when open-ended. */
export function daysLeft(expiryDate?: string | null): string {
  if (!expiryDate) return '—';
  const ms = new Date(expiryDate).getTime() - Date.now();
  if (Number.isNaN(ms)) return '—';
  const days = Math.ceil(ms / 86_400_000);
  return days > 0 ? String(days) : 'Expired';
}

// ─── Documents ────────────────────────────────────────────

export const isPdfDoc = (d: AdminDocument) => d.contentType === 'application/pdf' || /\.pdf$/i.test(d.fileName);

/** Fields still empty on a submitted copy, for the admin to fill (web lib/agreements). */
export function remainingFields(d: AdminDocument) {
  const fields = d.fields ?? [];
  if (d.status !== 'SUBMITTED' || !d.signedUrl || !fields.some((f) => f.filledBy)) return [];
  return fields.filter((f) => !f.filledBy);
}

export function docSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const DOC_STATUS: Record<string, { label: string; kind: PillKind }> = {
  APPROVED: { label: 'Approved', kind: 'ok' },
  SUBMITTED: { label: 'Submitted', kind: 'info' },
  REJECTED: { label: 'Not approved', kind: 'red' },
  AWAITING_CLIENT: { label: 'Awaiting client', kind: 'ns' },
  PENDING: { label: 'Awaiting client', kind: 'ns' },
};

/** A stored file path → full URL (the web's mediaUrl). */
export function fileUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL.replace(/\/api\/?$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
}

export const fmtDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';

// ─── Small UI bits ────────────────────────────────────────

/** Labelled text box in the app's input style. */
export function Field({
  label,
  hint,
  style,
  right,
  ...input
}: TextInputProps & { label: string; hint?: string; style?: StyleProp<ViewStyle>; right?: React.ReactNode }) {
  return (
    <View style={style}>
      <Muted size={12.5} w="s" style={{ marginBottom: 6 }}>
        {label}
      </Muted>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.input, borderRadius: 10, paddingHorizontal: 12 }}>
        <TextInput
          placeholderTextColor={colors.faint}
          {...input}
          style={{ flex: 1, minHeight: 46, fontFamily: fonts.medium, fontSize: 15, color: colors.fg, paddingVertical: 10 }}
        />
        {right}
      </View>
      {hint ? (
        <Muted size={12} style={{ marginTop: 4 }}>
          {hint}
        </Muted>
      ) : null}
    </View>
  );
}

/** A label + value block (detail grids). Hidden when the value is empty unless `always`. */
export function Detail({ label, value, mono, always }: { label: string; value?: string | null; mono?: boolean; always?: boolean }) {
  if (!value && !always) return null;
  return (
    <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
      <Muted size={12.5}>{label}</Muted>
      <T w="s" size={14} mono={mono} style={{ marginTop: 3 }} selectable>
        {value || '—'}
      </T>
    </View>
  );
}

/** Card section title with an icon. */
export function CardTitle({ icon, title, right }: { icon: IconName; title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={colors.green} />
      </View>
      <T w="s" size={16} style={{ flex: 1 }}>
        {title}
      </T>
      {right}
    </View>
  );
}

/** Small round icon button. */
export function IconBtn({
  icon,
  onPress,
  color = colors.muted,
  label,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.soft : 'transparent',
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}

/** Two-option segmented picker. */
export function Segment<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 42,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: on ? colors.greenChip : colors.line,
              backgroundColor: on ? colors.greenChip : '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 6,
            }}
          >
            <T w="s" size={13.5} color={on ? colors.greenChipText : colors.muted} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SheetTitle({ title, body }: { title: string; body?: string }) {
  return (
    <View style={{ marginBottom: 6 }}>
      <T w="s" size={18}>
        {title}
      </T>
      {body ? (
        <Muted size={13} style={{ marginTop: 4, lineHeight: 19 }}>
          {body}
        </Muted>
      ) : null}
    </View>
  );
}
