import React, { useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Muted, Pill, T, Eyebrow, s as ui } from '../../ui';
import { colors } from '../../theme';
import { HOME_TZ } from '../../lib/portal';

const DAY = 86_400_000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Victorian public holidays (Business Victoria) — the same list the web
// dashboard hard-codes (frontend/src/components/client/PublicHolidays.tsx).
// [date, name, substitute?, date TBC?]
const HOLIDAYS: [string, string, boolean?, boolean?][] = [
  ['2026-12-25', 'Christmas Day'],
  ['2026-12-26', 'Boxing Day'],
  ['2026-12-28', 'Boxing Day', true],
  ['2027-01-01', 'New Year’s Day'],
  ['2027-01-26', 'Australia Day'],
  ['2027-03-08', 'Labour Day'],
  ['2027-03-26', 'Good Friday'],
  ['2027-03-27', 'Saturday before Easter Sunday'],
  ['2027-03-28', 'Easter Sunday'],
  ['2027-03-29', 'Easter Monday'],
  ['2027-04-25', 'ANZAC Day'],
  ['2027-06-14', 'King’s Birthday'],
  ['2027-09-24', 'Friday before the AFL Grand Final', false, true],
  ['2027-11-02', 'Melbourne Cup'],
  ['2027-12-25', 'Christmas Day'],
  ['2027-12-26', 'Boxing Day'],
  ['2027-12-27', 'Christmas Day', true],
  ['2027-12-28', 'Boxing Day', true],
];

const utcDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

/** Today's date in Melbourne, as UTC midnight. */
function melbourneToday() {
  try {
    const o: Record<string, string> = {};
    new Intl.DateTimeFormat('en-AU', { timeZone: HOME_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
      .forEach((p) => (o[p.type] = p.value));
    return Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day));
  } catch {
    const d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
}

function upcoming(today: number) {
  return HOLIDAYS.map(([iso, name, sub, tbc]) => {
    const t = utcDay(iso);
    const d = new Date(t);
    return {
      t,
      name,
      sub: !!sub,
      date: tbc
        ? 'Late Sep 2027 · date TBC'
        : `${WD[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    };
  }).filter((h) => h.t >= today);
}

/** "Melbourne office holidays" card, as on the web dashboard. */
export function HolidaysCard() {
  const [all, setAll] = useState(false);
  const today = melbourneToday();
  const hols = upcoming(today);
  const next = hols[0];
  const nextDays = next ? Math.round((next.t - today) / DAY) : 0;
  const list = all ? hols.slice(1) : hols.slice(1, 6);

  return (
    <Card style={{ padding: 16, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="calendar-outline" size={20} color={colors.infoFg} />
        </View>
        <View style={{ flex: 1 }}>
          <T w="s" size={16}>
            Melbourne office holidays
          </T>
          <Muted size={12}>Victorian public holidays</Muted>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.greenTint, gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow>Next holiday</Eyebrow>
          <T w="s" size={15} style={{ marginTop: 4 }}>
            {next?.name ?? 'No upcoming holidays listed'}
          </T>
          {next ? <Muted size={12.5}>{next.date}</Muted> : null}
        </View>
        {next ? (
          <View style={{ alignItems: 'flex-end' }}>
            <T w="b" size={26} color={colors.green}>
              {nextDays === 0 ? 'Today' : nextDays}
            </T>
            <Muted size={11.5}>{nextDays === 0 ? 'office closed' : nextDays === 1 ? 'day away' : 'days away'}</Muted>
          </View>
        ) : null}
      </View>

      {list.map((h, i) => (
        <View key={h.t + h.name} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }, i > 0 && ui.hair]}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <T size={14}>{h.name}</T>
            {h.sub ? <Pill kind="ns" label="substitute" style={{ height: 20, paddingHorizontal: 6 }} /> : null}
          </View>
          <Muted size={12.5}>{h.date}</Muted>
        </View>
      ))}

      {hols.length > 6 ? (
        <Pressable onPress={() => setAll((v) => !v)} hitSlop={6} style={{ marginTop: 6 }}>
          <T w="s" size={13} color={colors.green}>
            {all ? 'Show fewer' : `Show all ${hols.length - 1} upcoming`}
          </T>
        </Pressable>
      ) : null}
      <Muted size={11.5} style={{ marginTop: 10, lineHeight: 17 }}>
        The Melbourne office is closed on these days. Plan task due dates and client follow-ups around them.
      </Muted>
      <Pressable onPress={() => Linking.openURL('https://business.vic.gov.au/business-information/public-holidays')} hitSlop={6}>
        <T size={11.5} color={colors.green} style={{ marginTop: 4 }}>
          Source: Business Victoria ↗
        </T>
      </Pressable>
    </Card>
  );
}
