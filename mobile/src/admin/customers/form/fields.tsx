import React, { useMemo, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Muted, SearchField, Sheet, T, Toggle, type IconName } from '../../../ui';
import { colors, fonts } from '../../../theme';
import { COUNTRIES, DEFAULT_COUNTRY, countryByCode, flagEmoji } from './countries';
import { subdivisionsOf } from './subdivisions';
import { PHONE_DIGITS } from './model';

// ─── Section card ─────────────────────────────────────────

export function Section({
  icon,
  title,
  description,
  open,
  onToggle,
  errorCount = 0,
  children,
}: {
  icon: IconName;
  title: string;
  description?: string;
  open: boolean;
  onToggle: () => void;
  errorCount?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={st.section}>
      <Pressable onPress={onToggle} style={st.sectionHead} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={st.sectionIcon}>
          <Ionicons name={icon} size={18} color={colors.green} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w="s" size={16}>
            {title}
          </T>
          {description ? (
            <Muted size={12.5} style={{ marginTop: 2, lineHeight: 17 }}>
              {description}
            </Muted>
          ) : null}
        </View>
        {errorCount > 0 ? (
          <View style={st.errBadge}>
            <T w="b" size={11} color={colors.redFg}>
              {errorCount}
            </T>
          </View>
        ) : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.faint} />
      </Pressable>
      {open ? <View style={st.sectionBody}>{children}</View> : null}
    </View>
  );
}

/** A labelled sub-group inside a section (e.g. "Principal Address"). */
export function SubHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={st.subHead}>
      <T w="s" size={14} style={{ flex: 1 }}>
        {title}
      </T>
      {right}
    </View>
  );
}

/** A bordered tile for one repeatable row (director, IT contact, product). */
export function Tile({ title, onRemove, children }: { title: string; onRemove?: () => void; children: React.ReactNode }) {
  return (
    <View style={st.tile}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
        <T w="s" size={14} style={{ flex: 1 }}>
          {title}
        </T>
        {onRemove ? (
          <Pressable onPress={onRemove} hitSlop={8} style={st.removeBtn} accessibilityLabel={`Remove ${title}`}>
            <Ionicons name="trash-outline" size={15} color={colors.redFg} />
            <T w="s" size={12.5} color={colors.redFg}>
              Remove
            </T>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

// ─── Field + inputs ───────────────────────────────────────

export function Field({
  label,
  error,
  hint,
  children,
  style,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ marginTop: 14 }, style]}>
      <T w="s" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>
        {label}
      </T>
      {children}
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
          <Ionicons name="alert-circle" size={13} color={colors.red} />
          <T size={12} color={colors.redFg} style={{ flex: 1 }}>
            {error}
          </T>
        </View>
      ) : hint ? (
        <Muted size={12} style={{ marginTop: 5, lineHeight: 16 }}>
          {hint}
        </Muted>
      ) : null}
    </View>
  );
}

export function Input({ invalid, disabled, style, ...rest }: TextInputProps & { invalid?: boolean; disabled?: boolean }) {
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      editable={!disabled && rest.editable !== false}
      {...rest}
      style={[st.input, invalid && st.inputBad, disabled && st.inputOff, style]}
    />
  );
}

/** Looks like an input; opens a picker. */
export function SelectBox({
  label,
  placeholder,
  onPress,
  disabled,
  invalid,
  left,
}: {
  label?: string | null;
  placeholder?: string;
  onPress: () => void;
  disabled?: boolean;
  invalid?: boolean;
  left?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[st.input, st.select, invalid && st.inputBad, disabled && st.inputOff]}
      accessibilityRole="button"
    >
      {left}
      <T w="m" size={15} color={label ? colors.fg : colors.faint} style={{ flex: 1 }} numberOfLines={1}>
        {label || placeholder || 'Select…'}
      </T>
      <Ionicons name="chevron-down" size={16} color={colors.muted} />
    </Pressable>
  );
}

export function CheckRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable onPress={() => !disabled && onChange(!value)} style={st.checkRow}>
      <T w="m" size={14} style={{ flex: 1 }}>
        {label}
      </T>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </Pressable>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View style={st.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[st.segItem, on && st.segOn]}>
            <T w="s" size={14} color={on ? colors.greenChipText : colors.muted}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small outlined action button (lookups, "Add trading name", …). */
export function SmallBtn({
  title,
  icon,
  onPress,
  loading,
  disabled,
  tone = 'default',
  style,
}: {
  title: string;
  icon?: IconName;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'green';
  style?: StyleProp<ViewStyle>;
}) {
  const fg = tone === 'green' ? colors.okFg : colors.fg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [st.smallBtn, tone === 'green' && st.smallBtnGreen, (disabled || loading) && { opacity: 0.55 }, pressed && { opacity: 0.8 }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <T w="s" size={13} color={fg}>
        {title}
      </T>
    </Pressable>
  );
}

// ─── Picker sheet ─────────────────────────────────────────

export interface PickOption {
  value: string;
  label: string;
  right?: string;
  left?: string;
}

export function PickerSheet({
  open,
  onClose,
  title,
  options,
  value,
  onPick,
  searchable,
  searchPlaceholder = 'Search…',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: PickOption[];
  value?: string;
  onPick: (v: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState('');
  const { height } = useWindowDimensions();
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return options;
    return options.filter((o) => o.label.toLowerCase().includes(t) || o.value.toLowerCase().includes(t) || (o.right ?? '').replace('+', '').startsWith(t.replace('+', '')));
  }, [q, options]);
  const close = () => {
    setQ('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} scroll={false}>
      <T w="s" size={17} style={{ marginBottom: 6 }}>
        {title}
      </T>
      {searchable ? <SearchField value={q} onChangeText={setQ} placeholder={searchPlaceholder} style={{ marginBottom: 4 }} /> : null}
      <FlatList
        data={shown}
        keyExtractor={(o) => o.value}
        keyboardShouldPersistTaps="handled"
        style={{ flexShrink: 1, maxHeight: height * 0.6 }}
        contentContainerStyle={{ paddingBottom: 8 }}
        initialNumToRender={20}
        ListEmptyComponent={
          <Muted size={14} style={{ paddingVertical: 16, textAlign: 'center' }}>
            No match
          </Muted>
        }
        renderItem={({ item }) => {
          const on = item.value === value;
          return (
            <Pressable
              onPress={() => {
                onPick(item.value);
                close();
              }}
              style={[st.opt, on && { borderColor: colors.green2, backgroundColor: colors.greenTint }]}
            >
              {item.left ? <T size={18}>{item.left}</T> : null}
              <T w="s" size={14} style={{ flex: 1 }} numberOfLines={2}>
                {item.label}
              </T>
              {item.right ? (
                <T mono size={11} color={colors.muted}>
                  {item.right}
                </T>
              ) : null}
              {on ? <Ionicons name="checkmark" size={18} color={colors.green} /> : null}
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

/** A SelectBox wired to a PickerSheet. */
export function SelectField({
  value,
  options,
  onChange,
  title,
  placeholder,
  disabled,
  invalid,
  searchable,
}: {
  value: string;
  options: PickOption[];
  onChange: (v: string) => void;
  title: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <SelectBox
        label={current ? current.label : value || null}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        disabled={disabled}
        invalid={invalid}
      />
      <PickerSheet open={open} onClose={() => setOpen(false)} title={title} options={options} value={value} onPick={onChange} searchable={searchable} />
    </>
  );
}

// ─── Country, phone, state ────────────────────────────────

const COUNTRY_OPTIONS: PickOption[] = COUNTRIES.map((c) => ({ value: c.code, label: c.name, left: flagEmoji(c.code), right: c.dial }));

export function CountryField({ value, onChange, disabled }: { value: string; onChange: (code: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const c = countryByCode(value) ?? countryByCode(DEFAULT_COUNTRY)!;
  return (
    <>
      <SelectBox label={c.name} left={<T size={18}>{flagEmoji(c.code)}</T>} onPress={() => setOpen(true)} disabled={disabled} />
      <PickerSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Country"
        options={COUNTRY_OPTIONS}
        value={c.code}
        onPick={onChange}
        searchable
        searchPlaceholder="Search country…"
      />
    </>
  );
}

/** Group a national number for display ("0412345678" -> "0412 345 678"). Stored digits-only. */
function groupDigits(d: string): string {
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

/** Dial-code picker + national number (digits only, max 10) — like the web PhoneInput. */
export function PhoneField({
  country,
  onCountryChange,
  value,
  onChange,
  invalid,
  disabled,
}: {
  country: string;
  onCountryChange: (code: string) => void;
  value: string;
  onChange: (digits: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const c = countryByCode(country) ?? countryByCode(DEFAULT_COUNTRY)!;
  return (
    <View style={[st.phone, invalid && st.inputBad, disabled && st.inputOff]}>
      <Pressable onPress={() => setOpen(true)} disabled={disabled} style={st.dial} accessibilityLabel="Country dial code">
        <T size={16}>{flagEmoji(c.code)}</T>
        <T w="s" size={14}>
          {c.dial}
        </T>
        <Ionicons name="chevron-down" size={13} color={colors.muted} />
      </Pressable>
      <TextInput
        value={groupDigits(value ?? '')}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, PHONE_DIGITS))}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        placeholder="400 000 000"
        placeholderTextColor={colors.faint}
        editable={!disabled}
        style={st.phoneInput}
      />
      <PickerSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Dial code"
        options={COUNTRY_OPTIONS}
        value={c.code}
        onPick={onCountryChange}
        searchable
        searchPlaceholder="Search country or code…"
      />
    </View>
  );
}

/** State dropdown when the country has a known list; free text otherwise. */
export function StateField({ country, value, onChange, disabled }: { country: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const subs = subdivisionsOf(country);
  if (subs.length === 0) {
    return <Input value={value} onChangeText={onChange} disabled={disabled} autoCapitalize="words" />;
  }
  // A stored value that isn't in the list (legacy data) stays selectable.
  const options: PickOption[] = [
    ...(value && !subs.some((x) => x.value === value) ? [{ value, label: value }] : []),
    ...subs.map((x) => ({ value: x.value, label: x.label })),
  ];
  return <SelectField value={value} options={options} onChange={onChange} title="State" placeholder="Select state…" disabled={disabled} searchable={options.length > 12} />;
}

export const st = StyleSheet.create({
  section: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    marginTop: 14,
    overflow: 'hidden',
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  sectionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.line },
  errBadge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.redBg, alignItems: 'center', justifyContent: 'center' },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  tile: { marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.soft2 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: '#8C99AB',
    backgroundColor: colors.soft,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.fg,
  },
  inputBad: { borderBottomColor: colors.red, backgroundColor: '#FFF6F7' },
  inputOff: { opacity: 0.55 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingVertical: 4 },
  seg: { flexDirection: 'row', gap: 8 },
  segItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segOn: { backgroundColor: colors.greenChip, borderColor: colors.greenChip },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
  },
  smallBtnGreen: { backgroundColor: colors.greenSoft, borderColor: colors.greenSoft },
  phone: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 50,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: '#8C99AB',
    backgroundColor: colors.soft,
  },
  dial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  phoneInput: { flex: 1, paddingHorizontal: 12, fontFamily: fonts.medium, fontSize: 15, color: colors.fg },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    marginTop: 8,
  },
});
