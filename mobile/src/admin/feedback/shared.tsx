import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReviewStatus, Testimonial, TestimonialStatus } from '../../api/admin/feedback';
import { useFileViewer, type ViewerFile } from '../../lib/fileViewer';
import { colors } from '../../theme';
import { Avatar, Card, Eyebrow, Muted, T, type PillKind } from '../../ui';

export const REVIEW_STATUS: Record<ReviewStatus, { kind: PillKind; label: string }> = {
  NEW: { kind: 'warn', label: 'With our team' },
  PUBLISHED: { kind: 'ok', label: 'Published' },
  HIDDEN: { kind: 'ns', label: 'Hidden' },
};

export const T_STATUS: Record<TestimonialStatus, { kind: PillKind; label: string }> = {
  APPROVED: { kind: 'ok', label: 'Approved' },
  WITH_CUSTOMER: { kind: 'warn', label: 'With customer' },
  WITHDRAWN: { kind: 'ns', label: 'Withdrawn' },
};

const STAR = '#D97706';

/** Read-only star row. */
export function Stars({ n, size = 15 }: { n: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= n ? 'star' : 'star-outline'} size={size} color={i <= n ? STAR : colors.faint} />
      ))}
    </View>
  );
}

/** Rounded-square initials (web Monogram). */
export const Monogram = ({ name, size = 40 }: { name: string; size?: number }) => (
  <Avatar name={name} size={size} radius={12} fill={colors.greenSoft} color={colors.green} />
);

/** Stat tile in a 2-column grid. */
export function StatTile({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <Card style={{ width: '48%', flexGrow: 1, padding: 14 }}>
      <Eyebrow style={{ fontSize: 10, letterSpacing: 1.2 }}>{label}</Eyebrow>
      <T w="b" size={20} color={color} style={{ marginTop: 6 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      <Muted size={12} numberOfLines={1}>
        {sub}
      </Muted>
    </Card>
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const quoteLine = (t: Testimonial) =>
  `“${t.quote}” — ${t.personName}${t.jobTitle ? `, ${t.jobTitle}` : ''}, ${t.companyName}`;

const VIDEO_TYPES: Record<string, string> = { webm: 'video/webm', mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/mp4' };

/** Viewer entry for a testimonial video (browser recordings are usually webm). */
export function videoFile(t: Testimonial): ViewerFile {
  const url = t.videoUrl ?? '';
  const ext = (url.split('?')[0]!.split('.').pop() ?? '').toLowerCase();
  return { url, name: `${t.personName} video`, contentType: VIDEO_TYPES[ext] ?? 'video/mp4' };
}

export const mmss = (sec: number | null) => (sec == null ? '' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);

/** Person photo (tap to enlarge) or initials. */
export function PersonPhoto({ t, size = 40 }: { t: Testimonial; size?: number }) {
  const open = useFileViewer();
  if (!t.photoUrl) return <Monogram name={t.personName} size={size} />;
  return (
    <Pressable
      onPress={() => open([{ url: t.photoUrl!, name: `${t.personName} photo`, contentType: 'image/jpeg' }])}
      accessibilityLabel="View photo"
    >
      <Image source={{ uri: t.photoUrl }} style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.soft }} />
    </Pressable>
  );
}

/** Tappable row that opens the testimonial video in the in-app viewer. */
export function VideoButton({ t }: { t: Testimonial }) {
  const open = useFileViewer();
  if (!t.videoUrl) return null;
  return (
    <Pressable
      onPress={() => open([videoFile(t)])}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 12,
          borderRadius: 12,
          backgroundColor: colors.navy,
        },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityLabel="Play video"
    >
      <Ionicons name="play-circle" size={28} color="#fff" />
      <T w="s" size={14} color="#fff" style={{ flex: 1 }}>
        Play video testimonial
      </T>
      {t.videoSeconds != null ? (
        <T mono size={12} color="#C3CEDD">
          {mmss(t.videoSeconds)}
        </T>
      ) : null}
    </Pressable>
  );
}

/** Small tag chip. */
export function Tag({ label, icon }: { label: string; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 9,
        height: 26,
        borderRadius: 999,
        backgroundColor: colors.infoBg,
      }}
    >
      {icon ? <Ionicons name={icon} size={12} color={colors.infoFg} /> : null}
      <T w="s" size={12} color={colors.infoFg}>
        {label}
      </T>
    </View>
  );
}
