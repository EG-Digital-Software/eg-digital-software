import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { feedbackApi, feedbackKeys, REVIEW_SITES, type ReviewLinks } from '../../api/admin/feedback';
import { errorMessage } from '../../api/client';
import { Btn, ErrorBox, Loading, Muted, Screen } from '../../ui';
import { Field, Input } from '../billing/shared';

/** The review-site links clients see under "Review us elsewhere". */
export default function ReviewLinksScreen() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: feedbackKeys.links, queryFn: feedbackApi.reviewLinks });
  const [edited, setForm] = useState<ReviewLinks | null>(null);
  const form = edited ?? q.data ?? null;

  const bad = form ? REVIEW_SITES.filter((s) => (form[s.id] ?? '').trim() && !/^https:\/\/\S+$/i.test((form[s.id] ?? '').trim())) : [];

  const save = useMutation({
    mutationFn: (body: ReviewLinks) => feedbackApi.saveReviewLinks(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: feedbackKeys.links });
      Alert.alert('Review links saved');
      nav.goBack();
    },
    onError: (e) => Alert.alert('Could not save', errorMessage(e)),
  });

  const submit = () => {
    if (!form) return;
    const body = Object.fromEntries(REVIEW_SITES.map((s) => [s.id, (form[s.id] ?? '').trim()])) as ReviewLinks;
    save.mutate(body);
  };

  return (
    <Screen title="Review site links" back>
      <Muted size={13} style={{ lineHeight: 19 }}>
        Clients see a site under “Review us elsewhere” only when its link is set here. Leave a box empty to hide that site.
      </Muted>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !form ? (
        <ErrorBox message={errorMessage(q.error, 'Could not load the links')} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {REVIEW_SITES.map((s) => (
            <Field key={s.id} label={`${s.name} review link`} error={bad.includes(s) ? 'Use a full https:// link' : null}>
              <Input
                value={form[s.id] ?? ''}
                onChangeText={(v) => setForm({ ...form, [s.id]: v })}
                placeholder="https://"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </Field>
          ))}
          <Btn title="Save links" onPress={submit} loading={save.isPending} disabled={bad.length > 0} style={{ marginTop: 20 }} />
        </>
      )}
    </Screen>
  );
}
