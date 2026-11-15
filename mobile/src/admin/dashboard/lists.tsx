import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { LicenceRow, LowStockRow } from '../../api/admin/dashboard';
import { LICENCE_PILL, fmtDate } from '../../lib/portal';
import { Card, Muted, Pill, T, s as ui } from '../../ui';
import { colors } from '../../theme';

const daysText = (d: number | null) =>
  d === null ? 'No expiry' : d < 0 ? `Expired ${Math.abs(d)} day${d === -1 ? '' : 's'} ago` : d === 0 ? 'Expires today' : `${d} day${d === 1 ? '' : 's'} left`;

/** Licences expiring within 30 days, expired or suspended. Tapping opens the customer. */
export function LicenceList({ rows }: { rows: LicenceRow[] }) {
  const nav = useNavigation<any>();
  return (
    <Card>
      {rows.map((r, i) => {
        const pill = LICENCE_PILL[r.status] ?? { kind: 'ns' as const, label: r.status };
        return (
          <Pressable
            key={r.id}
            onPress={() => nav.navigate('CustomerDetail', { clientId: r.clientId })}
            style={({ pressed }) => [{ padding: 14, gap: 4 }, i > 0 && ui.hair, pressed && { backgroundColor: colors.soft2 }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T w="s" size={14.5} style={{ flex: 1 }} numberOfLines={1}>
                {r.product}
              </T>
              <Pill kind={pill.kind} label={pill.label} />
            </View>
            <Muted size={13} numberOfLines={1}>
              {r.customer} · <T mono size={11.5} color={colors.muted}>{r.clientId}</T>
            </Muted>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <T mono size={11.5} color={colors.faint} numberOfLines={1} style={{ flex: 1 }}>
                {r.licence}
              </T>
              <T w="s" size={12.5} color={r.daysRemaining !== null && r.daysRemaining < 0 ? colors.redFg : colors.warnFg}>
                {r.expiryDate ? `${fmtDate(r.expiryDate)} · ${daysText(r.daysRemaining)}` : daysText(r.daysRemaining)}
              </T>
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

/** Active products at or under their low-stock threshold. */
export function LowStockList({ rows }: { rows: LowStockRow[] }) {
  return (
    <Card>
      {rows.map((p, i) => {
        const out = p.status === 'OUT_OF_STOCK';
        return (
          <View key={p.id} style={[{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, i > 0 && ui.hair]}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: out ? colors.redBg : colors.warnBg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cube-outline" size={18} color={out ? colors.redFg : colors.warnFg} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w="s" size={14.5} numberOfLines={1}>
                {p.name}
              </T>
              <T mono size={11.5} color={colors.muted} numberOfLines={1}>
                {p.sku}
              </T>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Pill kind={out ? 'red' : 'warn'} label={out ? 'Out of stock' : 'Low'} />
              <Muted size={12}>
                {p.available} left · min {p.threshold}
              </Muted>
            </View>
          </View>
        );
      })}
    </Card>
  );
}
