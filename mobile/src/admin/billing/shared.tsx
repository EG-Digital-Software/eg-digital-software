import React, { useEffect, useState } from 'react';
import { View, TextInput, Pressable, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { billingApi, type BillingCustomer, type InvoiceStatus, type PaymentStatus } from '../../api/admin/billing';
import { errorMessage } from '../../api/client';
import { colors, fonts } from '../../theme';
import { ErrorBox, Loading, Muted, SearchField, Sheet, SheetOption, T, useRevealFocused, type PillKind } from '../../ui';

export const INVOICE_STATUS: Record<InvoiceStatus, { kind: PillKind; label: string }> = {
  DRAFT: { kind: 'ns', label: 'Draft' },
  SENT: { kind: 'info', label: 'Sent' },
  PENDING: { kind: 'warn', label: 'Pending' },
  PARTIALLY_PAID: { kind: 'on', label: 'Partially paid' },
  PAID: { kind: 'ok', label: 'Paid' },
  OVERDUE: { kind: 'red', label: 'Overdue' },
  CANCELLED: { kind: 'ns', label: 'Cancelled' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, PillKind> = {
  SUCCESS: 'ok',
  PENDING: 'warn',
  FAILED: 'red',
  REFUNDED: 'ns',
  CANCELLED: 'ns',
};

/** "SUCCESS" → "Success". */
export const cap = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);

export const customerLabel = (c?: Partial<BillingCustomer> | null) =>
  c?.companyName || c?.tradingAs || c?.contactPerson || c?.clientId || 'Unknown customer';

/** Debounced copy of a value (search boxes). */
export function useDebounced<V>(value: V, ms = 350): V {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ─── Form controls ────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  children,
  style,
}: {
  label: string;
  hint?: string | null;
  error?: string | null;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ marginTop: 12 }, style]}>
      <T w="s" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>
        {label}
      </T>
      {children}
      {error ? (
        <T size={12} color={colors.redFg} style={{ marginTop: 4 }}>
          {error}
        </T>
      ) : hint ? (
        <Muted size={12} style={{ marginTop: 4, lineHeight: 17 }}>
          {hint}
        </Muted>
      ) : null}
    </View>
  );
}

export function Input({ style, multiline, ...rest }: TextInputProps) {
  const reveal = useRevealFocused();
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      multiline={multiline}
      onContentSizeChange={multiline ? reveal : undefined}
      {...rest}
      style={[
        {
          minHeight: 48,
          borderRadius: 12,
          backgroundColor: colors.input,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 10,
          fontFamily: fonts.medium,
          fontSize: 15,
          color: colors.fg,
          textAlignVertical: multiline ? 'top' : 'center',
        },
        rest.editable === false && { opacity: 0.55 },
        style,
      ]}
    />
  );
}

/** A read-only box that looks like an input (auto-filled values). */
export function ReadBox({ value, mono }: { value: string; mono?: boolean }) {
  return (
    <View style={{ minHeight: 48, borderRadius: 12, backgroundColor: colors.soft, paddingHorizontal: 14, justifyContent: 'center' }}>
      <T w="m" size={mono ? 13 : 15} mono={mono} color={colors.muted}>
        {value}
      </T>
    </View>
  );
}

/** A tappable box that opens a picker. */
export function SelectBox({
  value,
  placeholder,
  onPress,
  disabled,
  icon = 'chevron-down',
}: {
  value?: string | null;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          minHeight: 48,
          borderRadius: 12,
          backgroundColor: colors.input,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        disabled && { opacity: 0.55 },
        pressed && { opacity: 0.85 },
      ]}
    >
      <T w="m" size={15} color={value ? colors.fg : colors.faint} style={{ flex: 1 }} numberOfLines={1}>
        {value || placeholder}
      </T>
      <Ionicons name={icon} size={18} color={colors.muted} />
    </Pressable>
  );
}

/** Inline segmented choice (fits inside a card, unlike the full-bleed Chips). */
export function Seg<V extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, disabled && { opacity: 0.55 }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            style={{
              flexGrow: 1,
              minHeight: 42,
              paddingHorizontal: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: on ? colors.greenChip : colors.line,
              backgroundColor: on ? colors.greenChip : '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <T w="s" size={14} color={on ? colors.greenChipText : colors.muted}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Keep only digits and one dot — decimal keypad input. */
export const decimalOnly = (t: string) => {
  const clean = t.replace(/[^0-9.]/g, '');
  const i = clean.indexOf('.');
  return i < 0 ? clean : clean.slice(0, i + 1) + clean.slice(i + 1).replace(/\./g, '');
};
export const digitsOnly = (t: string) => t.replace(/\D/g, '');

// ─── Customer picker ──────────────────────────────────────

export function CustomerPickerSheet({
  open,
  onClose,
  onPick,
  selected,
  activeOnly,
  allOption,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (c: BillingCustomer | null) => void;
  selected?: string;
  /** Only active customers (the invoice form, as on the web). */
  activeOnly?: boolean;
  /** Offer "All clients" (the list filter). */
  allOption?: boolean;
}) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const list = useQuery({
    queryKey: ['admin-billing', 'customers', activeOnly ? 'active' : 'all', q],
    queryFn: () => billingApi.customers(q || undefined, activeOnly ? 'ACTIVE' : undefined),
    enabled: open,
    staleTime: 60_000,
  });
  return (
    <Sheet open={open} onClose={onClose}>
      <T w="s" size={17} style={{ marginBottom: 10 }}>
        {allOption ? 'Filter by client' : 'Choose customer'}
      </T>
      <SearchField value={search} onChangeText={setSearch} placeholder="Company, contact or Customer ID" />
      {allOption ? <SheetOption title="All clients" selected={!selected} onPress={() => onPick(null)} /> : null}
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <View style={{ marginTop: 10 }}>
          <ErrorBox message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        </View>
      ) : (list.data ?? []).length === 0 ? (
        <Muted size={14} style={{ textAlign: 'center', paddingVertical: 24 }}>
          No customers match.
        </Muted>
      ) : (
        (list.data ?? []).map((c) => (
          <SheetOption
            key={c.id}
            title={customerLabel(c)}
            right={c.clientId}
            selected={c.clientId === selected}
            onPress={() => onPick(c)}
          />
        ))
      )}
    </Sheet>
  );
}
