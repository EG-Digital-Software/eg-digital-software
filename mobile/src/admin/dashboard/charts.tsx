import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { T, Muted } from '../../ui';
import { colors } from '../../theme';

/**
 * Dashboard charts (react-native-svg), matching the web dashboard.
 */

/**
 * Area series like the web "Sales analytics" chart. Tap (or drag across) the
 * chart to read a point — the web tooltip; otherwise the period total shows.
 */
export function AreaChart({
  data,
  format,
  axis,
  height = 180,
  color = colors.green2,
}: {
  data: { label: string; value: number }[];
  /** Full value, shown for the selected point. */
  format: (v: number) => string;
  /** Short value for the axis. */
  axis: (v: number) => string;
  height?: number;
  color?: string;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const [w, setW] = useState(0);
  const max = Math.max(0, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);
  const picked = sel !== null && sel < data.length ? data[sel] : null;
  const last = data.length - 1;
  const mid = Math.floor(last / 2);

  const pad = 6;
  const h = height - pad * 2;
  const x = (i: number) => (last > 0 ? (i / last) * w : w / 2);
  const y = (v: number) => pad + (max > 0 ? h - (v / max) * h : h);
  const pts = data.map((d, i) => [x(i), y(d.value)] as const);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = pts.length ? `${line} L${x(last).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z` : '';

  const pickAt = (px: number) => {
    if (!data.length || w <= 0) return;
    const i = Math.round((Math.max(0, Math.min(w, px)) / w) * last);
    setSel(i);
  };

  return (
    <View>
      <View style={c.readout}>
        <View style={{ flex: 1 }}>
          <Muted size={12}>{picked ? picked.label : 'Total for the period'}</Muted>
          <T w="b" size={20} style={{ marginTop: 2 }}>
            {format(picked ? picked.value : total)}
          </T>
        </View>
        {picked ? (
          <Pressable onPress={() => setSel(null)} hitSlop={8}>
            <T w="s" size={12} color={colors.green}>
              Show total
            </T>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row' }}>
        <View style={[c.yaxis, { height }]}>
          <Muted size={10}>{axis(max)}</Muted>
          <Muted size={10}>{axis(max / 2)}</Muted>
          <Muted size={10}>0</Muted>
        </View>
        <View
          style={{ flex: 1, height }}
          onLayout={(e) => setW(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => false}
          onResponderGrant={(e) => pickAt(e.nativeEvent.locationX)}
          onResponderMove={(e) => pickAt(e.nativeEvent.locationX)}
          onResponderTerminationRequest={() => true}
        >
          {w > 0 ? (
            <Svg width={w} height={height}>
              <Defs>
                <LinearGradient id="dashFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                  <Stop offset="1" stopColor={color} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {[0, 0.5, 1].map((f) => (
                <Line key={f} x1={0} x2={w} y1={pad + f * h} y2={pad + f * h} stroke={colors.line} strokeDasharray="3 3" strokeWidth={1} />
              ))}
              {area ? <Path d={area} fill="url(#dashFill)" /> : null}
              {line ? <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
              {picked && sel !== null ? (
                <>
                  <Line x1={x(sel)} x2={x(sel)} y1={0} y2={height} stroke="#5B7FC7" strokeWidth={1} />
                  <Circle cx={x(sel)} cy={y(picked.value)} r={5} fill={colors.navy} stroke={color} strokeWidth={2} />
                </>
              ) : null}
            </Svg>
          ) : null}
        </View>
      </View>

      {data.length ? (
        <View style={c.xaxis}>
          <Muted size={10.5}>{data[0]!.label}</Muted>
          {last > 2 ? <Muted size={10.5}>{data[mid]!.label}</Muted> : null}
          {last > 0 ? <Muted size={10.5}>{data[last]!.label}</Muted> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Multi-segment donut (web Task overview) with a centre label. */
export function Donut({
  segments,
  size = 112,
  stroke = 10,
  children,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const sum = segments.reduce((n, s) => n + s.value, 0) || 1;
  const lens = segments.map((s) => (s.value / sum) * circ);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  const cx = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={cx} cy={cx} r={r} fill="none" stroke={colors.track} strokeWidth={stroke} />
        {segments.map((s, i) =>
          s.value > 0 ? (
            <Circle
              key={i}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${lens[i]} ${circ - lens[i]!}`}
              strokeDashoffset={-starts[i]!}
              strokeLinecap="round"
            />
          ) : null
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

/** Single-value progress ring (web "System health"). */
export function Ring({ pct, size = 64, stroke = 6, color = colors.green2 }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const cx = size / 2;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={cx} cy={cx} r={r} fill="none" stroke={colors.track} strokeWidth={stroke} />
      {p > 0 ? (
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(circ * p) / 100} ${circ}`}
        />
      ) : null}
    </Svg>
  );
}

const c = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, minHeight: 44 },
  yaxis: { width: 40, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6 },
  xaxis: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 40, marginTop: 6 },
});
