import React from 'react';
import { View, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { feedbackApi, feedbackKeys, USE_LABELS, type Testimonial } from '../../api/admin/feedback';
import { errorMessage } from '../../api/client';
import { fmtDate } from '../../lib/portal';
import { colors } from '../../theme';
import { Btn, Card, EmptyCard, ErrorBox, Eyebrow, KV, Loading, Muted, Pill, Screen, T } from '../../ui';
import { PersonPhoto, T_STATUS, VideoButton, mmss, quoteLine } from './shared';

/** One testimonial: media, full answers, uses and admin actions. Params: { id }. */
export default function TestimonialDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const id: string = route.params?.id;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: feedbackKeys.testimonials, queryFn: feedbackApi.testimonials });
  const t = q.data?.find((x) => x.id === id);

  const feature = useMutation({
    mutationFn: (x: Testimonial) => feedbackApi.updateTestimonial(x.id, { featured: !x.featured }),
    onSuccess: (_d, x) => {
      void qc.invalidateQueries({ queryKey: feedbackKeys.testimonials });
      Alert.alert(x.featured ? 'Removed from website' : 'Featured on website');
    },
    onError: (e) => Alert.alert('Could not save', errorMessage(e)),
  });

  if (q.isLoading) {
    return (
      <Screen title="Testimonial" back>
        <Loading />
      </Screen>
    );
  }
  if (q.isError) {
    return (
      <Screen title="Testimonial" back>
        <ErrorBox message={errorMessage(q.error, 'Could not load the testimonial')} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  if (!t) {
    return (
      <Screen title="Testimonial" back>
        <EmptyCard icon="chatbubble-ellipses-outline" title="Testimonial not found" body="It may have been removed." />
      </Screen>
    );
  }

  const st = T_STATUS[t.status];
  const canFeature = t.status === 'APPROVED' && t.uses.includes('WEBSITE');
  const answers: [string, string | null][] = [
    ['What was the problem before?', t.problem],
    ['What changed for your business?', t.change],
    ['Would you recommend EG Eloma? Why?', t.recommend],
  ];

  const toggleFeature = () =>
    Alert.alert(
      t.featured ? 'Remove from website?' : 'Feature on website?',
      t.featured ? 'It will no longer appear in the website widget.' : 'It will appear in the website widget on elomagroup.org.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: t.featured ? 'Remove' : 'Feature', onPress: () => feature.mutate(t) },
      ]
    );

  return (
    <Screen title="Testimonial" back refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <PersonPhoto t={t} size={56} />
        <View style={{ flex: 1 }}>
          <T w="b" size={18}>
            {t.personName}
          </T>
          <Muted size={13}>
            {t.jobTitle ? `${t.jobTitle}, ` : ''}
            {t.companyName}
          </Muted>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        <Pill kind={st.kind} label={st.label} />
        {t.featured ? <Pill kind="info" label="★ On website" /> : null}
      </View>

      {t.videoUrl ? (
        <View style={{ marginTop: 16 }}>
          <VideoButton t={t} />
        </View>
      ) : null}

      <Eyebrow style={{ marginTop: 20, marginBottom: 8 }}>Quote</Eyebrow>
      <Card style={{ padding: 16 }}>
        <T size={15} style={{ lineHeight: 23 }}>
          “{t.quote}”
        </T>
      </Card>
      {t.pendingQuote ? (
        <Card style={{ padding: 14, marginTop: 10, backgroundColor: colors.warnBg, borderColor: colors.warnBg }}>
          <T w="s" size={12.5} color={colors.warnFg}>
            Our edit, awaiting the client
          </T>
          <T size={14} style={{ lineHeight: 21, marginTop: 4 }}>
            “{t.pendingQuote}”
          </T>
        </Card>
      ) : null}

      {answers.some(([, v]) => v) ? (
        <>
          <Eyebrow style={{ marginTop: 20, marginBottom: 8 }}>Their answers</Eyebrow>
          <Card style={{ padding: 16, gap: 12 }}>
            {answers
              .filter(([, v]) => v)
              .map(([label, v]) => (
                <View key={label}>
                  <Muted size={12.5}>{label}</Muted>
                  <T size={14} style={{ lineHeight: 21, marginTop: 2 }}>
                    {v}
                  </T>
                </View>
              ))}
          </Card>
        </>
      ) : null}

      <Eyebrow style={{ marginTop: 20, marginBottom: 8 }}>Allowed uses</Eyebrow>
      <Card style={{ padding: 16, gap: 8 }}>
        {t.uses.length === 0 ? (
          <Muted size={13}>No uses allowed</Muted>
        ) : (
          t.uses.map((u) => (
            <T key={u} size={14}>
              ✓ {USE_LABELS[u]}
            </T>
          ))
        )}
      </Card>

      <KV
        style={{ marginTop: 16 }}
        rows={[
          ['Service', t.service || 'No service tag'],
          ['Client ID', t.clientId, { mono: true }],
          ['Video length', t.videoUrl && t.videoSeconds != null ? mmss(t.videoSeconds) : null],
          ['Received', fmtDate(t.createdAt)],
          ['Updated', fmtDate(t.updatedAt)],
        ]}
      />

      {t.status !== 'WITHDRAWN' ? (
        <View style={{ gap: 10, marginTop: 18 }}>
          <Btn
            title="Copy quote"
            icon="copy-outline"
            variant="ghost"
            onPress={async () => {
              await Clipboard.setStringAsync(quoteLine(t));
              Alert.alert('Copied', 'Quote copied to the clipboard.');
            }}
          />
          <Btn title="Edit" icon="create-outline" variant="ghost" onPress={() => nav.navigate('FeedbackTestimonialEdit', { id: t.id })} />
          {canFeature ? (
            <Btn
              title={t.featured ? 'Remove from website' : 'Feature on website'}
              icon={t.featured ? 'star' : 'star-outline'}
              variant={t.featured ? 'green' : 'primary'}
              loading={feature.isPending}
              onPress={toggleFeature}
            />
          ) : null}
        </View>
      ) : (
        <Muted size={13} style={{ marginTop: 18, textAlign: 'center' }}>
          The client withdrew this testimonial. It can't be used.
        </Muted>
      )}
    </Screen>
  );
}
