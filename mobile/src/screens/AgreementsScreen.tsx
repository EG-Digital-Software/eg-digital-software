import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { STAGE, agreementSteps, docTitle, fmtDate, needsSignature, stageOf, useProfile, type Stage } from '../lib/portal';
import { Btn, Card, Chips, EmptyCard, ErrorBox, Loading, Muted, Pill, Screen, Steps, T } from '../ui';
import { colors } from '../theme';
import type { CustomerDocument } from '../api/types';

type Filter = 'all' | 'sign' | 'wait' | 'approved' | 'rejected';

/** A paper-sheet thumbnail (design's `.doc`). */
function DocThumb() {
  return (
    <View
      style={{
        width: 44,
        height: 56,
        borderRadius: 6,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: colors.line,
        padding: 6,
        shadowColor: colors.navy,
        shadowOpacity: 0.15,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
    >
      {[0.8, 1, 0.6, 1, 0.7].map((w, i) => (
        <View key={i} style={{ height: 3, borderRadius: 2, backgroundColor: i === 0 ? colors.green2 : colors.line, marginTop: 4, width: `${w * 100}%` }} />
      ))}
    </View>
  );
}

export default function AgreementsScreen() {
  const nav = useNavigation<any>();
  const { admin } = useAuth();
  const profile = useProfile();
  const [filter, setFilter] = useState<Filter>('all');
  const readOnly = !!admin && !admin.edit;

  const docs = profile.data?.documents ?? [];
  const toSign = docs.filter(needsSignature);
  const count = (s: Stage) => docs.filter((d) => stageOf(d) === s).length;
  const options = [
    { value: 'all' as Filter, label: `All · ${docs.length}` },
    { value: 'sign' as Filter, label: `To sign · ${toSign.length}` },
    { value: 'wait' as Filter, label: `Awaiting · ${count('wait')}` },
    ...(count('approved') ? [{ value: 'approved' as Filter, label: `Approved · ${count('approved')}` }] : []),
    ...(count('rejected') ? [{ value: 'rejected' as Filter, label: `Not approved · ${count('rejected')}` }] : []),
  ];
  const shown =
    filter === 'all' ? docs : filter === 'sign' ? toSign : docs.filter((d) => stageOf(d) === filter);

  const sign = (d: CustomerDocument) => nav.navigate('AgreementSign', { documentId: d.id });
  const preview = (d: CustomerDocument) => nav.navigate('AgreementPreview', { documentId: d.id });

  return (
    <Screen title="Agreements" refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()}>
      {profile.isLoading ? (
        <Loading />
      ) : profile.isError ? (
        <ErrorBox message={errorMessage(profile.error)} onRetry={() => void profile.refetch()} />
      ) : (
        <>
          <Muted size={14} style={{ marginBottom: 14 }}>
            {docs.length
              ? `${toSign.length} of ${docs.length} document${docs.length === 1 ? '' : 's'} need${toSign.length === 1 ? 's' : ''} your signature.`
              : 'Agreements EG Eloma shares with you appear here.'}
          </Muted>
          {docs.length ? <Chips<Filter> options={options} value={filter} onChange={setFilter} /> : null}
          <View style={{ gap: 12, marginTop: 12 }}>
            {shown.length === 0 ? (
              <EmptyCard
                icon="document-text-outline"
                title={docs.length ? 'Nothing here' : 'No agreements yet'}
                body={docs.length ? 'No documents match this filter.' : 'When EG Eloma sends you an agreement to sign, it will appear here.'}
              />
            ) : (
              shown.map((d) => {
                const stage = stageOf(d);
                const st = STAGE[stage];
                const canSign = stage === 'sign' || stage === 'rejected';
                return (
                  <Card key={d.id} style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', gap: 14 }}>
                      <DocThumb />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Pill kind={st.kind} label={st.label} />
                        <T w="s" size={16} style={{ marginTop: 8 }}>
                          {docTitle(d)}
                        </T>
                        <Muted size={13} style={{ marginTop: 2 }}>
                          Agreement · issued {fmtDate(d.createdAt)}
                        </Muted>
                      </View>
                    </View>
                    <Steps steps={agreementSteps(d)} />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                      {canSign && !readOnly ? (
                        <Btn title={stage === 'rejected' ? 'Sign again' : 'Review and sign'} onPress={() => sign(d)} style={{ flex: 1 }} />
                      ) : null}
                      <Btn title={stage === 'approved' ? 'View signed copy' : 'Preview'} variant="ghost" onPress={() => preview(d)} style={{ flex: 1 }} />
                    </View>
                  </Card>
                );
              })
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
