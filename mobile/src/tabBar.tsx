import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { T, useKeyboardVisible, type IconName } from './ui';
import { colors } from './theme';

export type TabMeta = Record<string, { label: string; icon: IconName; iconOn: IconName }>;

/** Material 3 navigation bar from the design: pill indicator + count badges. */
export function TabBar({
  state,
  navigation,
  tabs,
  badges = {},
}: BottomTabBarProps & { tabs: TabMeta; badges?: Record<string, [number, string]> }) {
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();
  // Out of the way while typing, so it never sits between the box and the keyboard.
  if (keyboardUp) return null;
  return (
    <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, i) => {
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
      })}
    </View>
  );
}


const styles = StyleSheet.create({
  nav: { flexDirection: 'row', paddingTop: 10, paddingHorizontal: 4, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line },
  item: { flex: 1, alignItems: 'center', gap: 4, minWidth: 0 },
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
