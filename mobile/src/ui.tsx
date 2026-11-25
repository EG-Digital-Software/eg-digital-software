import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  Image,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextProps,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, avatarFills, GUTTER } from './theme';
import { useAuth } from './context/AuthContext';
import { useNotificationCount } from './lib/portal';
import { initials } from './lib/format';

export type IconName = keyof typeof Ionicons.glyphMap;

// ─── Keyboard ─────────────────────────────────────────────

/**
 * Keyboard avoidance for every screen. 'padding' on both platforms: Android runs
 * edge-to-edge, so the window no longer shrinks for the keyboard by itself. The
 * view only pads by how much the keyboard actually overlaps it, so it never
 * doubles up when the system does resize.
 */
export function KeyboardSafe({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <KeyboardAvoidingView behavior="padding" style={[{ flex: 1 }, style]}>
      {children}
    </KeyboardAvoidingView>
  );
}

const RevealContext = React.createContext<() => void>(() => undefined);
/** Inside a Screen: scroll the focused box back above the keyboard (e.g. as a multiline box grows). */
export const useRevealFocused = () => React.useContext(RevealContext);

/** True while the on-screen keyboard is up. */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * Keeps the focused text box above the keyboard inside a ScrollView: when the
 * keyboard opens (or the box grows while typing) and the box sits under it, the
 * view scrolls just enough to show it with a small gap.
 */
export function useFocusedInputVisible() {
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const kbTop = useRef<number | null>(null);

  const reveal = () => {
    const input = TextInput.State.currentlyFocusedInput() as unknown as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;
    if (!input?.measureInWindow || kbTop.current === null) return;
    input.measureInWindow((_x, y, _w, h) => {
      const gap = 24;
      const overlap = y + h + gap - (kbTop.current ?? 0);
      if (overlap > 0) ref.current?.scrollTo({ y: offset.current + overlap, animated: true });
      else if (y < 100) ref.current?.scrollTo({ y: Math.max(0, offset.current + y - 120), animated: true });
    });
  };

  useEffect(() => {
    const onShow = (e: KeyboardEvent) => {
      kbTop.current = e.endCoordinates.screenY;
      // Let the keyboard-avoiding padding settle before measuring.
      setTimeout(reveal, Platform.OS === 'ios' ? 50 : 120);
    };
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const hide = Keyboard.addListener('keyboardDidHide', () => (kbTop.current = null));
    return () => {
      show.remove();
      hide.remove();
    };
    // reveal only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ref,
    /** Spread onto the ScrollView. */
    scrollProps: {
      ref,
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offset.current = e.nativeEvent.contentOffset.y;
      },
      scrollEventThrottle: 16,
      keyboardShouldPersistTaps: 'handled' as const,
      keyboardDismissMode: 'none' as const,
    },
    /** Call from a growing multiline input's onContentSizeChange. */
    reveal: () => setTimeout(reveal, 0),
  };
}

// ─── Text ─────────────────────────────────────────────────

type Weight = 'r' | 'm' | 's' | 'b';
const FAMILY: Record<Weight, string> = { r: fonts.regular, m: fonts.medium, s: fonts.semibold, b: fonts.bold };

export function T({
  w = 'r',
  size = 14,
  color = colors.fg,
  mono,
  style,
  ...rest
}: TextProps & { w?: Weight; size?: number; color?: string; mono?: boolean }) {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: mono ? fonts.mono : FAMILY[w], fontSize: size, color }, style]}
    />
  );
}

export const Muted = (p: React.ComponentProps<typeof T>) => <T color={colors.muted} {...p} />;

export function Eyebrow({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <T w="s" size={11} color={colors.muted} style={[{ letterSpacing: 1.8, textTransform: 'uppercase' }, style]}>
      {children}
    </T>
  );
}

// ─── Surfaces ─────────────────────────────────────────────

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export type PillKind = 'on' | 'ns' | 'ok' | 'warn' | 'info' | 'red';
const PILL: Record<PillKind, [string, string]> = {
  on: [colors.onBg, colors.onFg],
  ns: [colors.nsBg, colors.nsFg],
  ok: [colors.okBg, colors.okFg],
  warn: [colors.warnBg, colors.warnFg],
  info: [colors.infoBg, colors.infoFg],
  red: [colors.redBg, colors.redFg],
};

export function Pill({ kind, label, style }: { kind: PillKind; label: string; style?: StyleProp<ViewStyle> }) {
  const [bg, fg] = PILL[kind];
  return (
    <View style={[s.pill, { backgroundColor: bg }, style]}>
      <T w="s" size={12.5} color={fg} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

export function Btn({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'green' | 'dashed';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const v = {
    primary: { bg: colors.navy, fg: '#fff', border: colors.navy },
    ghost: { bg: '#fff', fg: colors.fg, border: colors.line },
    green: { bg: colors.greenSoft, fg: colors.okFg, border: colors.greenSoft },
    dashed: { bg: colors.greenTint, fg: colors.okFg, border: '#9FD9C2' },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: v.bg, borderColor: v.border, borderStyle: variant === 'dashed' ? 'dashed' : 'solid' },
        variant === 'dashed' && { borderRadius: 14 },
        (disabled || loading) && { opacity: 0.55 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={v.fg} /> : null}
          <T w="s" size={15} color={v.fg}>
            {title}
          </T>
        </>
      )}
    </Pressable>
  );
}

export function Chips<V extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[{ marginHorizontal: -GUTTER, flexGrow: 0 }, style]}
      contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER, paddingVertical: 2 }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.chip, on && s.chipOn]}>
            <T w="s" size={14} color={on ? colors.greenChipText : colors.muted}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
  style,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.search, style]}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={s.searchInput}
        autoCorrect={false}
        returnKeyType="search"
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10}>
          <Ionicons name="close-circle" size={18} color={colors.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Label/value rows separated by hairlines, inside a card. */
export function KV({
  rows,
  style,
}: {
  rows: ([string, string | null | undefined] | [string, string | null | undefined, { mono?: boolean }])[];
  style?: StyleProp<ViewStyle>;
}) {
  const shown = rows.filter((r) => r[1] !== null && r[1] !== undefined && r[1] !== '');
  return (
    <Card style={style}>
      {shown.map(([label, value, opt], i) => (
        <View key={label} style={[s.kv, i > 0 && s.hair]}>
          <Muted size={14}>{label}</Muted>
          <T w="s" size={opt?.mono ? 12.5 : 14} mono={opt?.mono} style={{ flexShrink: 1, textAlign: 'right' }}>
            {value}
          </T>
        </View>
      ))}
    </Card>
  );
}

export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sh}>
      <T w="s" size={17}>
        {title}
      </T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <T w="s" size={13} color={colors.green}>
            {action}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Avatar({
  name,
  label,
  size = 30,
  fill,
  color = colors.navy,
  radius,
  style,
}: {
  name?: string;
  label?: string;
  size?: number;
  fill?: string;
  color?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const text = label ?? initials(name ?? '');
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: radius ?? size / 2, backgroundColor: fill ?? fillFor(name ?? text) },
        s.center,
        style,
      ]}
    >
      <T w="b" size={Math.max(10, size * 0.36)} color={color}>
        {text}
      </T>
    </View>
  );
}

export function fillFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return avatarFills[h % (avatarFills.length - 1)]!;
}

export function Bird({ size = 26, style }: { size?: number; style?: StyleProp<any> }) {
  return <Image source={require('../assets/eg-eloma-mark.png')} style={[{ width: size, height: size }, style]} resizeMode="contain" />;
}

export function Bar({ pct, style }: { pct: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.bar, style]}>
      <View style={[s.barFill, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
    </View>
  );
}

export type StepState = 'done' | 'now' | 'wait' | 'bad' | 'todo';
const STEP_COLOR: Record<StepState, string> = {
  done: colors.green2,
  now: '#E39B2E',
  wait: '#5B7FC7',
  bad: colors.red,
  todo: colors.line,
};

export function Steps({ steps, style }: { steps: { label: string; state: StepState }[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', gap: 6, marginTop: 12 }, style]}>
      {steps.map((st, i) => (
        <View key={i} style={{ flex: 1 }}>
          <View style={{ height: 4, borderRadius: 4, backgroundColor: STEP_COLOR[st.state], marginBottom: 6 }} />
          <T w={st.state === 'todo' ? 'r' : 's'} size={12} color={st.state === 'todo' ? colors.muted : colors.fg} style={{ lineHeight: 16 }}>
            {st.label}
          </T>
        </View>
      ))}
    </View>
  );
}

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      onPress={() => !disabled && onChange(!value)}
      style={[s.tgl, value && { backgroundColor: colors.green2 }, disabled && { opacity: 0.5 }]}
    >
      <View style={[s.knob, value && { transform: [{ translateX: 20 }] }]} />
    </Pressable>
  );
}

export function EmptyCard({ icon, title, body, style }: { icon: IconName; title: string; body?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Card style={[{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16 }, style]}>
      <View style={s.ring}>
        <Ionicons name={icon} size={24} color={colors.green} />
      </View>
      <T w="s" size={16} style={{ textAlign: 'center' }}>
        {title}
      </T>
      {body ? (
        <Muted size={13} style={{ textAlign: 'center', marginTop: 4, lineHeight: 20 }}>
          {body}
        </Muted>
      ) : null}
    </Card>
  );
}

export function Loading() {
  return (
    <View style={[s.center, { paddingVertical: 48 }]}>
      <ActivityIndicator color={colors.navy} />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ padding: 16, alignItems: 'center', gap: 10 }}>
      <Ionicons name="cloud-offline-outline" size={24} color={colors.muted} />
      <Muted size={14} style={{ textAlign: 'center' }}>
        {message}
      </Muted>
      {onRetry ? <Btn title="Try again" variant="ghost" onPress={onRetry} style={{ alignSelf: 'stretch' }} /> : null}
    </Card>
  );
}

// ─── Bottom sheet ─────────────────────────────────────────

export function Sheet({
  open,
  onClose,
  children,
  scroll = true,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const kb = useFocusedInputVisible();
  const keyboard = useKeyboardVisible();
  const body = scroll ? (
    <ScrollView {...kb.scrollProps} contentContainerStyle={{ paddingBottom: 8 }}>
      {children}
    </ScrollView>
  ) : (
    children
  );
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardSafe>
        <Pressable style={s.scrim} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: keyboard ? 12 : Math.max(insets.bottom, 12) + 16 }]}>
          <View style={s.grab} />
          {body}
        </View>
      </KeyboardSafe>
    </Modal>
  );
}

export function SheetOption({
  title,
  right,
  selected,
  onPress,
  chevron,
}: {
  title: string;
  right?: string;
  selected?: boolean;
  onPress: () => void;
  chevron?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[s.opt, selected && { borderColor: colors.green2, backgroundColor: colors.greenTint }]}>
      <T w="s" size={14} style={{ flex: 1 }}>
        {title}
      </T>
      {right ? (
        <T mono size={11} color={colors.muted}>
          {right}
        </T>
      ) : null}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={colors.faint} /> : null}
    </Pressable>
  );
}

// ─── App bar + screen shell ───────────────────────────────

export function AppBar({ title, back }: { title: string; back?: boolean }) {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const unread = useNotificationCount();
  const me = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email : '';
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line, zIndex: 5 }}>
      <View style={s.abar}>
        {back ? (
          <Pressable style={s.ibtn} onPress={() => nav.goBack()} accessibilityLabel="Back" hitSlop={4}>
            <Ionicons name="arrow-back" size={22} color={colors.fg} />
          </Pressable>
        ) : (
          <Bird size={28} style={{ marginRight: 4 }} />
        )}
        <T w="s" size={20} style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </T>
        <Pressable style={s.ibtn} onPress={() => nav.navigate('Notifications')} accessibilityLabel="Notifications">
          <Ionicons name="notifications-outline" size={22} color={colors.fg} />
          {unread > 0 ? <View style={s.dotb} /> : null}
        </Pressable>
        <Pressable
          onPress={() => nav.navigate('Profile')}
          accessibilityLabel="Your profile"
          style={{ marginRight: 6 }}
        >
          <Avatar name={me} size={34} fill={colors.navy} color="#fff" />
        </Pressable>
      </View>
      <AdminBanner />
    </View>
  );
}

function AdminBanner() {
  const { admin, exitCustomer } = useAuth();
  if (!admin) return null;
  return (
    <View style={s.banner}>
      <Ionicons name={admin.edit ? 'create-outline' : 'eye-outline'} size={14} color={colors.warnFg} />
      <T w="s" size={12} color={colors.warnFg} style={{ flex: 1 }} numberOfLines={1}>
        Admin {admin.edit ? 'acting as' : 'viewing'} {admin.companyName}
      </T>
      <Pressable onPress={exitCustomer} hitSlop={8}>
        <T w="b" size={12} color={colors.warnFg}>
          Back to admin
        </T>
      </Pressable>
    </View>
  );
}

export function Screen({
  title,
  back,
  children,
  refreshing,
  onRefresh,
  padBottom = 32,
}: {
  title: string;
  back?: boolean;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  padBottom?: number;
}) {
  const kb = useFocusedInputVisible();
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppBar title={title} back={back} />
      <KeyboardSafe>
        <ScrollView
          {...kb.scrollProps}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: padBottom }}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.navy} /> : undefined}
        >
          <RevealContext.Provider value={kb.reveal}>{children}</RevealContext.Provider>
        </ScrollView>
      </KeyboardSafe>
    </View>
  );
}

export const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    shadowColor: colors.navy,
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 0,
  },
  hair: { borderTopWidth: 1, borderTopColor: colors.line },
  pill: { height: 28, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  btn: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.greenChip, borderColor: colors.greenChip },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.input,
  },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.fg, paddingVertical: 10 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 12, paddingHorizontal: 16 },
  sh: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 10, marginHorizontal: 2 },
  bar: { height: 6, borderRadius: 6, backgroundColor: colors.track, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6, backgroundColor: colors.green2 },
  tgl: { width: 50, height: 30, borderRadius: 15, backgroundColor: '#D5DCE5', justifyContent: 'center' },
  knob: {
    position: 'absolute',
    left: 3,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: colors.navy,
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  ring: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,35,64,0.35)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '82%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: GUTTER,
    paddingTop: 10,
  },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D5DCE5', alignSelf: 'center', marginBottom: 12 },
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
  abar: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 8 },
  ibtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dotb: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: '#fff',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.warnBg,
  },
});
