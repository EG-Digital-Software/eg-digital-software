import React, { useEffect, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, type StyleProp, type ViewStyle, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, Muted, useRevealFocused } from '../../ui';
import { colors, fonts } from '../../theme';

/** Value that settles `ms` after the last change (search boxes). */
export function useDebounced<V>(value: V, ms = 350): V {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Labelled text box for the sheets' forms. */
export function Field({
  label,
  hint,
  secure,
  style,
  ...rest
}: TextInputProps & { label: string; hint?: string; secure?: boolean; style?: StyleProp<ViewStyle> }) {
  const [show, setShow] = useState(false);
  const reveal = useRevealFocused();
  return (
    <View style={[{ marginTop: 12 }, style]}>
      <T w="s" size={13} style={{ marginBottom: 6, marginLeft: 2 }}>
        {label}
      </T>
      <View style={st.box}>
        <TextInput
          placeholderTextColor={colors.faint}
          autoCorrect={false}
          {...rest}
          secureTextEntry={secure && !show}
          onContentSizeChange={rest.multiline ? reveal : undefined}
          style={[st.input, rest.multiline && { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }]}
        />
        {secure ? (
          <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {hint ? (
        <Muted size={12} style={{ marginTop: 4, marginLeft: 2 }}>
          {hint}
        </Muted>
      ) : null}
    </View>
  );
}

/** Two-to-five way segmented control (web "segs"). */
export function Segs<V extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: V; label: string; badge?: number }[];
  value: V;
  onChange: (v: V) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[st.segs, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[st.seg, on && st.segOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <T w="s" size={13} color={on ? colors.fg : colors.muted} numberOfLines={1}>
              {o.label}
            </T>
            {o.badge ? (
              <View style={st.badge}>
                <T w="b" size={11} color="#fff">
                  {o.badge}
                </T>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** "+12.5%" / "-3%" with an arrow, coloured by direction. */
export function Delta({ value }: { value: number }) {
  const v = Number.isFinite(value) ? value : 0;
  const up = v > 0;
  const flat = v === 0;
  const color = flat ? colors.muted : up ? colors.okFg : colors.redFg;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {!flat ? <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={color} /> : null}
      <T w="s" size={12} color={color}>
        {`${Math.abs(v).toFixed(Math.abs(v) < 10 && !Number.isInteger(v) ? 1 : 0)}%`}
      </T>
    </View>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11" → "Nov 2026" */
export const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m ? `${MONTHS[m - 1]} ${y}` : month;
};
/** "2026-11-03" → "03 Nov 2026" */
export const dayLabel = (date: string) => {
  const [y, m, d] = date.slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1] ?? ''} ${y}`;
};
export const rangeLabel = (start: string, end: string) =>
  end && end !== start ? `${dayLabel(start)} – ${dayLabel(end)}` : dayLabel(start);
/** 2 → "2 h", 2.5 → "2.5 h" */
export const hoursLabel = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;

export const st = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.input,
  },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.fg, paddingVertical: 10 },
  segs: { flexDirection: 'row', backgroundColor: colors.soft, borderRadius: 12, padding: 4, gap: 4 },
  seg: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  segOn: {
    backgroundColor: '#fff',
    shadowColor: colors.navy,
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
