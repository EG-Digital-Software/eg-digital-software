import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Muted, Sheet, T } from '../ui';
import { colors } from '../theme';

/**
 * Native date / time pickers for the admin app.
 * Values are plain strings so they drop into existing form state:
 *   date → 'YYYY-MM-DD'   time → 'HH:MM' (24h)
 */

const pad = (n: number) => String(n).padStart(2, '0');
export const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toHm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 'YYYY-MM-DD' (or an ISO string) → local Date; falls back to today. */
export function fromYmd(v?: string | null): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}
/** 'HH:MM' → a Date today at that time; falls back to now. */
export function fromHm(v?: string | null): Date {
  const m = /^(\d{1,2}):(\d{2})/.exec(v ?? '');
  const d = new Date();
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

const fmtDate = (v: string) =>
  fromYmd(v).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (v: string) => fromHm(v).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });

type Mode = 'date' | 'time';

function usePicker(mode: Mode, value: string, onChange: (v: string) => void, min?: string, max?: string) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(new Date());
  const current = mode === 'date' ? fromYmd(value) : fromHm(value);
  const out = (d: Date) => (mode === 'date' ? toYmd(d) : toHm(d));
  const bounds = mode === 'date' ? { minimumDate: min ? fromYmd(min) : undefined, maximumDate: max ? fromYmd(max) : undefined } : {};

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode,
        is24Hour: false,
        ...bounds,
        onChange: (e: DateTimePickerEvent, d?: Date) => {
          if (e.type === 'set' && d) onChange(out(d));
        },
      });
    } else {
      setDraft(current);
      setIosOpen(true);
    }
  };

  const iosSheet = (
    <Sheet open={iosOpen} onClose={() => setIosOpen(false)} scroll={false}>
      <T w="s" size={17} style={{ marginBottom: 8 }}>
        {mode === 'date' ? 'Pick a date' : 'Pick a time'}
      </T>
      <DateTimePicker
        value={draft}
        mode={mode}
        display={mode === 'date' ? 'inline' : 'spinner'}
        {...bounds}
        onChange={(_e: DateTimePickerEvent, d?: Date) => d && setDraft(d)}
      />
      <Btn
        title="Done"
        onPress={() => {
          onChange(out(draft));
          setIosOpen(false);
        }}
        style={{ marginTop: 12 }}
      />
    </Sheet>
  );
  return { open, iosSheet };
}

interface FieldProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Show a clear (×) button when set. */
  clearable?: boolean;
  disabled?: boolean;
  error?: string;
  min?: string;
  max?: string;
}

function PickerField({ mode, label, value, onChange, placeholder, clearable, disabled, error, min, max }: FieldProps & { mode: Mode }) {
  const { open, iosSheet } = usePicker(mode, value, onChange, min, max);
  const shown = value ? (mode === 'date' ? fmtDate(value) : fmtTime(value)) : '';
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <T w="s" size={13} color={colors.muted}>
          {label}
        </T>
      ) : null}
      <Pressable
        onPress={disabled ? undefined : open}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          height: 50,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: error ? colors.red : colors.line,
          backgroundColor: disabled ? colors.track : '#fff',
          opacity: disabled ? 0.7 : 1,
        }}
        accessibilityRole="button"
        accessibilityLabel={label ?? (mode === 'date' ? 'Date' : 'Time')}
      >
        <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={18} color={colors.muted} />
        <T size={15} color={shown ? colors.fg : colors.muted} style={{ flex: 1 }}>
          {shown || placeholder || (mode === 'date' ? 'Pick a date' : 'Pick a time')}
        </T>
        {clearable && value && !disabled ? (
          <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityLabel="Clear">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </Pressable>
      {error ? (
        <Muted size={12} color={colors.red}>
          {error}
        </Muted>
      ) : null}
      {iosSheet}
    </View>
  );
}

/** Date field: value/onChange are 'YYYY-MM-DD' ('' = empty). */
export const DateField = (p: FieldProps) => <PickerField mode="date" {...p} />;
/** Time field: value/onChange are 'HH:MM' 24h ('' = empty). */
export const TimeField = (p: FieldProps) => <PickerField mode="time" {...p} />;
