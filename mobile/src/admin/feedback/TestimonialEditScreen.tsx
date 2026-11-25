import React, { useState } from 'react';
import { View, Alert, Pressable } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { feedbackApi, feedbackKeys, type Testimonial, type TestimonialPatch } from '../../api/admin/feedback';
import { errorMessage } from '../../api/client';
import { colors } from '../../theme';
import { Btn, EmptyCard, ErrorBox, Loading, Muted, Screen, T } from '../../ui';
import { Field, Input } from '../billing/shared';

/** Edit a testimonial's service tag and wording. Params: { id }. */
export default function TestimonialEditScreen() {
  const route = useRoute<any>();
  const id: string = route.params?.id;
  const q = useQuery({ queryKey: feedbackKeys.testimonials, queryFn: feedbackApi.testimonials });
  const t = q.data?.find((x) => x.id === id);

  if (q.isLoading) {
    return (
      <Screen title="Edit testimonial" back>
        <Loading />
      </Screen>
    );
  }
  if (q.isError) {
    return (
      <Screen title="Edit testimonial" back>
        <ErrorBox message={errorMessage(q.error, 'Could not load the testimonial')} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  if (!t) {
    return (
      <Screen title="Edit testimonial" back>
        <EmptyCard icon="chatbubble-ellipses-outline" title="Testimonial not found" />
      </Screen>
    );
  }
  const services = Array.from(new Set((q.data ?? []).map((x) => x.service).filter((s): s is string => !!s))).sort();
  return <EditForm key={t.id} t={t} services={services} />;
}

function EditForm({ t, services }: { t: Testimonial; services: string[] }) {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const [service, setService] = useState(t.service ?? '');
  const [wording, setWording] = useState(t.pendingQuote ?? t.quote);
  const wordsChanged = wording.trim() !== (t.pendingQuote ?? t.quote);
  const term = service.trim().toLowerCase();
  const suggestions = services.filter((s) => s.toLowerCase() !== term && (!term || s.toLowerCase().includes(term))).slice(0, 8);

  const save = useMutation({
    mutationFn: (body: TestimonialPatch) => feedbackApi.updateTestimonial(t.id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: feedbackKeys.testimonials });
      Alert.alert(wordsChanged ? 'Edit sent to the client to approve' : 'Saved');
      nav.goBack();
    },
    onError: (e) => Alert.alert('Could not save', errorMessage(e)),
  });

  const submit = () => {
    const body: TestimonialPatch = { service: service.trim() || null, ...(wordsChanged ? { pendingQuote: wording.trim() } : {}) };
    if (!wordsChanged) return save.mutate(body);
    Alert.alert('Send edit to the client?', `${t.personName} will be asked to approve the new wording. Until then their original words stay in use.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send edit', onPress: () => save.mutate(body) },
    ]);
  };

  return (
    <Screen title="Edit testimonial" back>
      <T w="s" size={15}>
        {t.personName}, {t.companyName}
      </T>
      <Field label="Service tag">
        <Input value={service} onChangeText={setService} maxLength={120} placeholder="e.g. Microsoft 365" />
      </Field>
      {suggestions.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {suggestions.map((s) => (
            <Pressable
              key={s}
              onPress={() => setService(s)}
              style={{ paddingHorizontal: 10, height: 30, borderRadius: 999, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' }}
            >
              <T w="s" size={12.5} color={colors.muted}>
                {s}
              </T>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Field label="Wording">
        <Input value={wording} onChangeText={setWording} maxLength={4000} multiline style={{ minHeight: 150 }} />
      </Field>
      <Muted size={12.5} style={{ marginTop: 10, lineHeight: 18 }}>
        Changed wording goes back to {t.personName} to approve. Until then the client's original words stay in use and it can't be featured.
      </Muted>
      <Btn
        title={wordsChanged ? 'Send edit to client' : 'Save'}
        onPress={submit}
        loading={save.isPending}
        disabled={!wording.trim()}
        style={{ marginTop: 20 }}
      />
    </Screen>
  );
}
