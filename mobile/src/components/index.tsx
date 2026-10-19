import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme';
import { initials } from '../lib/format';

type IconName = keyof typeof Ionicons.glyphMap;

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
      {content}
    </Pressable>
  );
}

export function Badge({ label, fg, bg, icon }: { label: string; fg: string; bg: string; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={12} color={fg} />}
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, color = colors.accent }: { value: number; color?: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round(value * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: ViewStyle;
}) {
  const bg = {
    primary: colors.primary,
    secondary: colors.accentSoft,
    ghost: 'transparent',
    danger: colors.dangerSoft,
    success: colors.success,
  }[variant];
  const fg = { primary: '#fff', secondary: colors.primary, ghost: colors.primary, danger: colors.danger, success: '#fff' }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={typography.h2}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.link}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Row({ label, value, valueStyle, last }: { label: string; value: string; valueStyle?: TextStyle; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={[typography.body, styles.rowValue, valueStyle]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function Avatar({ name, url, size = 36, tone = 'soft' }: { name: string; url?: string | null; size?: number; tone?: 'soft' | 'solid' }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (url) return <Image source={{ uri: url }} style={[box, { backgroundColor: colors.border }]} />;
  return (
    <View style={[box, styles.avatar, tone === 'solid' && { backgroundColor: colors.primary }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }, tone === 'solid' && { color: '#fff' }]}>{initials(name)}</Text>
    </View>
  );
}

export function AvatarStack({ people, max = 3 }: { people: { name: string; avatarUrl?: string | null }[]; max?: number }) {
  if (!people.length) return null;
  return (
    <View style={{ flexDirection: 'row' }}>
      {people.slice(0, max).map((p, i) => (
        <View key={`${p.name}-${i}`} style={[styles.stackItem, i > 0 && { marginLeft: -8 }]}>
          <Avatar name={p.name} url={p.avatarUrl} size={26} />
        </View>
      ))}
      {people.length > max && (
        <View style={[styles.stackItem, styles.stackMore, { marginLeft: -8 }]}>
          <Text style={styles.stackMoreText}>+{people.length - max}</Text>
        </View>
      )}
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {o.label}
              {o.count !== undefined ? ` · ${o.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; dot?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segmentItem, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
            {o.dot && <View style={styles.dot} />}
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, message }: { icon?: IconName; title: string; message?: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.accent} />
      </View>
      <Text style={[typography.h3, { textAlign: 'center' }]}>{title}</Text>
      {message ? <Text style={[typography.caption, { textAlign: 'center', marginTop: 4 }]}>{message}</Text> : null}
    </View>
  );
}

export function LoadingView({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Text style={[typography.caption, { marginTop: spacing.sm }]}>{label}</Text> : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <EmptyState icon="cloud-offline-outline" title="Couldn't load" message={message ?? 'Please check your connection.'} />
      {onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: spacing.md }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  track: { height: 8, backgroundColor: colors.border, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  button: { paddingVertical: 14, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: 'center' },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttonText: { fontSize: 16, fontWeight: '600' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.sm },
  link: { color: colors.accent, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowValue: { fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  avatar: { backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.accent, fontWeight: '700' },
  stackItem: { borderRadius: 15, borderWidth: 2, borderColor: colors.surface },
  stackMore: { width: 30, height: 30, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stackMoreText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: '#fff' },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: spacing.md,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.sm + 2,
  },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.primary },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background },
});
