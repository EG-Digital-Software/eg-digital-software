import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

// ─── Swipe to reply ───────────────────────────────────────

const TRIGGER = 64;
const MAX_PULL = 96;

/**
 * Drag a message to the right to reply to it (like WhatsApp). Only a clearly
 * horizontal drag is taken, so scrolling the chat and long-press still work.
 */
export function SwipeToReply({ children, onReply, enabled = true }: { children: React.ReactNode; onReply: () => void; enabled?: boolean }) {
  const x = useRef(new Animated.Value(0)).current;
  const armed = useRef(false);
  const replyRef = useRef(onReply);
  replyRef.current = onReply;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => enabled && g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderGrant: () => {
          armed.current = false;
        },
        onPanResponderMove: (_e, g) => {
          // Resist past the trigger point so it feels like a pull.
          const d = Math.max(0, g.dx);
          const pulled = d < TRIGGER ? d : Math.min(MAX_PULL, TRIGGER + (d - TRIGGER) * 0.35);
          x.setValue(pulled);
          if (!armed.current && d >= TRIGGER) {
            armed.current = true;
            Vibration.vibrate(12);
          } else if (armed.current && d < TRIGGER) {
            armed.current = false;
          }
        },
        onPanResponderRelease: () => {
          if (armed.current) replyRef.current();
          armed.current = false;
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        },
        onPanResponderTerminate: () => {
          armed.current = false;
          Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [enabled, x]
  );

  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[
          sw.icon,
          {
            opacity: x.interpolate({ inputRange: [0, 24, TRIGGER], outputRange: [0, 0.4, 1], extrapolate: 'clamp' }),
            transform: [{ scale: x.interpolate({ inputRange: [0, TRIGGER], outputRange: [0.5, 1], extrapolate: 'clamp' }) }],
          },
        ]}
      >
        <Ionicons name="arrow-undo" size={18} color={colors.green} />
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

const sw = StyleSheet.create({
  icon: {
    position: 'absolute',
    left: 4,
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Emoji panel ──────────────────────────────────────────

const CATEGORIES: { key: string; icon: keyof typeof Ionicons.glyphMap; emojis: string }[] = [
  {
    key: 'smileys',
    icon: 'happy-outline',
    emojis:
      '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖',
  },
  {
    key: 'gestures',
    icon: 'hand-left-outline',
    emojis:
      '👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 👀 👁️ 🧠 🫶 🙋 🙆 🙅 🤷 🤦 💁 🙇 👨‍💻 👩‍💻 🧑‍💼 👨‍🎨 👩‍🎨 🕺 💃',
  },
  {
    key: 'hearts',
    icon: 'heart-outline',
    emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💯 💢 💥 💫 💦 💨 🕳️ 💬 🗨️ 💭 💤',
  },
  {
    key: 'nature',
    icon: 'leaf-outline',
    emojis:
      '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🐠 🐬 🐳 🦈 🐊 🦒 🐘 🌵 🌲 🌳 🌴 🌱 🌿 🍀 🍁 🍂 🌷 🌹 🌺 🌸 🌼 🌻 🌞 🌝 🌚 🌙 ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☀️ ⛅ ☁️ 🌧️ ⛈️ ❄️ ☃️ 🌊',
  },
  {
    key: 'food',
    icon: 'cafe-outline',
    emojis:
      '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥕 🌽 🌶️ 🥔 🥐 🍞 🧀 🥚 🍳 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥗 🍝 🍜 🍣 🍱 🍤 🍦 🍩 🍪 🎂 🍰 🧁 🍫 🍿 ☕ 🍵 🧃 🥤 🍺 🍻 🥂 🍷 🍸 🍹 🍾',
  },
  {
    key: 'activity',
    icon: 'football-outline',
    emojis:
      '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🏏 🏑 ⛳ 🏹 🎣 🥊 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 🎯 🎳 🎮 🧩 🚗 🚕 🚌 🚓 🚑 🚒 🚚 ✈️ 🚀 🛳️ 🏠 🏢 🏬 🏝️ 🗺️ 🎉 🎊 🎈 🎁',
  },
  {
    key: 'objects',
    icon: 'bulb-outline',
    emojis:
      '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 💿 📷 📸 📹 🎥 📞 ☎️ 📺 📻 ⏰ ⏳ 💡 🔦 🔋 🔌 💰 💵 💳 🧾 💎 🛠️ 🔧 🔨 ⚙️ 🔒 🔓 🔑 📦 📫 📮 ✉️ 📧 📨 📩 📝 📄 📃 📑 📊 📈 📉 🗒️ 📅 📆 🗓️ 📇 📋 📁 📂 📌 📍 📎 🖇️ 📏 📐 ✂️ 🖊️ ✏️ 🔍 🔎',
  },
  {
    key: 'symbols',
    icon: 'checkmark-done-outline',
    emojis:
      '✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ➗ ✖️ ❓ ❔ ❕ ❗ ‼️ ⁉️ ⚠️ 🚫 ⛔ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🔶 🔷 🔺 🔻 ▶️ ⏸️ ⏹️ ⏺️ ⏭️ ⏮️ 🔁 🔂 🔄 🆕 🆗 🆙 🆒 🆓 🔝 🔜 ™️ ©️ ®️ #️⃣ *️⃣ 0️⃣ 1️⃣ 2️⃣ 3️⃣ 🔟',
  },
];

const RECENT_KEY = 'eg:emoji:recent';
const RECENT_MAX = 32;
const COLS = 8;

/** Emoji picker shown in place of the keyboard, with a "recently used" row. */
export function EmojiPanel({ onPick, onBackspace, height, bottomInset }: { onPick: (e: string) => void; onBackspace: () => void; height: number; bottomInset: number }) {
  const [recent, setRecent] = useState<string[]>([]);
  const [cat, setCat] = useState<string>('smileys');

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        const list = raw ? (JSON.parse(raw) as string[]) : [];
        setRecent(list);
        if (list.length) setCat('recent');
      })
      .catch(() => undefined);
  }, []);

  const pick = (e: string) => {
    onPick(e);
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, RECENT_MAX);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => undefined);
  };

  const list = cat === 'recent' ? recent : (CATEGORIES.find((c) => c.key === cat)?.emojis.split(' ') ?? []);

  return (
    <View style={[em.panel, { height: height + bottomInset, paddingBottom: bottomInset }]}>
      <View style={em.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }} style={{ flex: 1 }}>
          {recent.length ? (
            <Tab icon="time-outline" on={cat === 'recent'} onPress={() => setCat('recent')} />
          ) : null}
          {CATEGORIES.map((c) => (
            <Tab key={c.key} icon={c.icon} on={cat === c.key} onPress={() => setCat(c.key)} />
          ))}
        </ScrollView>
        <Pressable onPress={onBackspace} onLongPress={onBackspace} delayLongPress={300} hitSlop={6} style={em.back} accessibilityLabel="Delete">
          <Ionicons name="backspace-outline" size={22} color={colors.muted} />
        </Pressable>
      </View>
      <FlatList
        key={cat}
        data={list}
        numColumns={COLS}
        keyExtractor={(e, i) => `${e}-${i}`}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 8 }}
        initialNumToRender={48}
        renderItem={({ item }) => (
          <Pressable onPress={() => pick(item)} style={({ pressed }) => [em.cell, pressed && { backgroundColor: colors.soft }]}>
            <Text style={em.emoji}>{item}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function Tab({ icon, on, onPress }: { icon: keyof typeof Ionicons.glyphMap; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[em.tab, on && { backgroundColor: colors.greenChip }]} hitSlop={4}>
      <Ionicons name={icon} size={19} color={on ? colors.greenChipText : colors.muted} />
    </Pressable>
  );
}

const em = StyleSheet.create({
  panel: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line },
  tabs: { flexDirection: 'row', alignItems: 'center', height: 46, paddingLeft: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { width: 38, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 2 },
  back: { width: 48, height: 46, alignItems: 'center', justifyContent: 'center' },
  cell: { flex: 1 / COLS, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  emoji: { fontSize: 27 },
});

/** Remove the last character before `pos` — a whole emoji, including joined ones like 👍🏽, ❤️ or 👨‍💻. */
export function deleteBefore(text: string, pos: number): { text: string; pos: number } {
  if (pos <= 0) return { text, pos };
  const cps = Array.from(text.slice(0, pos));
  const isMod = (c?: string) => !!c && /[️⃣🏻-🏿]/u.test(c);
  const popOne = () => {
    let c = cps.pop();
    // Skin tones, variation selectors and keycaps sit after their base character.
    while (isMod(c) && cps.length) c = cps.pop();
  };
  popOne();
  // Zero-width-joined sequences: keep removing joined parts.
  while (cps.length && cps[cps.length - 1] === '‍') {
    cps.pop();
    popOne();
  }
  const kept = cps.join('');
  return { text: kept + text.slice(pos), pos: kept.length };
}
