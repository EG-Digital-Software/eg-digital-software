import React, { useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import { View, Pressable, StyleSheet } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Bird, T, useKeyboardVisible, type IconName } from './ui';
import { colors } from './theme';

export type TabMeta = Record<string, { label: string; icon: IconName; iconOn: IconName }>;

/** The raised EG Eloma logo in the middle of the bar (web portal dock); opens the menu. */
export type CenterButton = { onPress: () => void; open?: boolean };

/** Material 3 navigation bar from the design: pill indicator + count badges, logo in the middle. */
export function TabBar({
  state,
  navigation,
  tabs,
  badges = {},
  center,
}: BottomTabBarProps & { tabs: TabMeta; badges?: Record<string, [number, string]>; center?: CenterButton }) {
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();
  const [width, setWidth] = useState(0);
  // Out of the way while typing, so it never sits between the box and the keyboard.
  if (keyboardUp) return null;
  const split = Math.ceil(state.routes.length / 2);
  const items = state.routes.map((route, i) => {
        const meta = tabs[route.name]!;
        const on = state.index === i;
        const [count, badgeColor] = badges[route.name] ?? [0, colors.red];
        const press = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!on && !e.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable key={route.key} onPress={press} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <View style={[styles.ind, on && { backgroundColor: colors.greenIndicator }]}>
              <Ionicons name={on ? meta.iconOn : meta.icon} size={22} color={on ? colors.navy : colors.nsFg} />
            </View>
            {count > 0 ? (
              <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                <T w="b" size={10} color="#fff">
                  {count > 99 ? '99+' : count}
                </T>
              </View>
            ) : null}
            <T w="s" size={12} color={on ? colors.navy : colors.nsFg} numberOfLines={1}>
              {meta.label}
            </T>
          </Pressable>
        );
  });
  return (
    <View
      style={[styles.nav, center && { borderTopWidth: 0 }, { paddingBottom: Math.max(insets.bottom, 10) }]}
      onLayout={center ? (e) => setWidth(e.nativeEvent.layout.width) : undefined}
    >
      {center && width ? <NotchLine width={width} /> : null}
      {center ? items.slice(0, split) : items}
      {center ? (
        <View style={styles.fabSlot}>
          <Pressable
            onPress={center.onPress}
            style={({ pressed }) => [styles.fab, center.open && { backgroundColor: colors.greenSoft }, pressed && { transform: [{ scale: 0.94 }] }]}
            accessibilityRole="button"
            accessibilityLabel="Menu"
            accessibilityState={{ expanded: !!center.open }}
          >
            <Bird size={30} />
          </Pressable>
        </View>
      ) : null}
      {center ? items.slice(split) : null}
    </View>
  );
}

// The bar's top line dips into a half circle under the logo.
const NOTCH_R = 37; // logo radius (29) + gap
const NOTCH_CY = 9; // logo centre, from the top of the bar
const NOTCH_EASE = 8;

function NotchLine({ width }: { width: number }) {
  const cx = width / 2;
  const y = 0.5;
  const l = cx - NOTCH_R;
  const r = cx + NOTCH_R;
  const d =
    `M0 ${y} H${l - NOTCH_EASE} Q${l} ${y} ${l} ${NOTCH_CY}` +
    ` A${NOTCH_R} ${NOTCH_R} 0 0 0 ${r} ${NOTCH_CY}` +
    ` Q${r} ${y} ${r + NOTCH_EASE} ${y} H${width}`;
  return (
    <Svg pointerEvents="none" width={width} height={NOTCH_CY + NOTCH_R + 2} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Path d={d} stroke={colors.line} strokeWidth={1} fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', paddingTop: 10, paddingHorizontal: 4, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line },
  item: { flex: 1, alignItems: 'center', gap: 4, minWidth: 0 },
  fabSlot: { width: 72, alignItems: 'center' },
  // Raised round logo button, as the web dock's centre button.
  fab: {
    width: 58,
    height: 58,
    marginTop: -30,
    borderRadius: 29,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(45,185,138,0.55)',
    shadowColor: '#178A63',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  // Fully rounded pill (Material 3 active indicator), never a box.
  ind: {
    width: 64,
    height: 32,
    borderRadius: 999,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    left: '50%',
    marginLeft: 6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
