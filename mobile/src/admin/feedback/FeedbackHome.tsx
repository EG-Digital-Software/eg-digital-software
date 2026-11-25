import React, { useMemo, useState } from 'react';
import { View, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import {
  feedbackApi,
  feedbackKeys,
  USE_SHORT,
  type AdminReview,
  type FeedbackCompany,
  type ReviewStatus,
  type Testimonial,
} from '../../api/admin/feedback';
import { errorMessage } from '../../api/client';
import { fmtDate } from '../../lib/portal';
import { colors } from '../../theme';
import { Btn, Card, Chips, EmptyCard, ErrorBox, Eyebrow, Loading, Muted, Pill, Screen, SearchField, Sheet, SheetOption, T } from '../../ui';
import { SelectBox } from '../billing/shared';
import { Monogram, PersonPhoto, REVIEW_STATUS, Stars, StatTile, T_STATUS, Tag, VideoButton, plural, quoteLine } from './shared';

type Tab = 'reviews' | 'testimonials';
const TABS: { value: Tab; label: string }[] = [
  { value: 'reviews', label: 'Reviews' },
  { value: 'testimonials', label: 'Testimonials' },
];

/** Admin Feedback: client reviews of completed tasks, and approved testimonials. */
export default function FeedbackHome() {
  const [tab, setTab] = useState<Tab>('reviews');
  const [company, setCompany] = useState<FeedbackCompany | null>(null);
  const qc = useQueryClient();

  const reviews = useQuery({
    queryKey: feedbackKeys.reviews(company?.id),
    queryFn: () => feedbackApi.reviews(company?.id),
    enabled: tab === 'reviews',
  });
  const testimonials = useQuery({
    queryKey: feedbackKeys.testimonials,
    queryFn: feedbackApi.testimonials,
    enabled: tab === 'testimonials',
  });
  const active = tab === 'reviews' ? reviews : testimonials;

  return (
    <Screen
      title="Feedback"
      back
      refreshing={active.isRefetching}
      onRefresh={() => void qc.invalidateQueries({ queryKey: feedbackKeys.all })}
    >
      <Muted size={13} style={{ lineHeight: 19, marginBottom: 12 }}>
        Client reviews of completed tasks, company by company, and the testimonials they've approved for the website and proposals.
      </Muted>
      <Chips<Tab> options={TABS} value={tab} onChange={setTab} />
      {tab === 'reviews' ? (
        <ReviewsTab company={company} setCompany={setCompany} />
      ) : (
        <TestimonialsTab />
      )}
    </Screen>
  );
}

// ─── Company picker ───────────────────────────────────────

function CompanySheet({
  open,
  onClose,
  title,
  companies,
  selected,
  allowAll,
  loading,
  error,
  onRetry,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  companies: FeedbackCompany[];
  selected?: string | null;
  allowAll?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onPick: (c: FeedbackCompany | null) => void;
}) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = companies.filter((c) => !term || c.name.toLowerCase().includes(term) || c.clientId.toLowerCase().includes(term));
  return (
    <Sheet open={open} onClose={onClose}>
      <T w="s" size={17} style={{ marginBottom: 10 }}>
        {title}
      </T>
      <SearchField value={q} onChangeText={setQ} placeholder="Company or client ID" />
      {loading ? <Loading /> : null}
      {error ? (
        <View style={{ marginTop: 12 }}>
          <ErrorBox message={error} onRetry={onRetry} />
        </View>
      ) : null}
      {allowAll ? <SheetOption title="All companies" selected={!selected} onPress={() => onPick(null)} /> : null}
      {shown.map((c) => (
        <SheetOption key={c.id} title={c.name} right={c.clientId} selected={selected === c.id} onPress={() => onPick(c)} />
      ))}
      {!loading && !error && shown.length === 0 ? (
        <Muted size={13} style={{ textAlign: 'center', marginTop: 16 }}>
          No companies match.
        </Muted>
      ) : null}
    </Sheet>
  );
}

// ─── Reviews ──────────────────────────────────────────────

function ReviewsTab({ company, setCompany }: { company: FeedbackCompany | null; setCompany: (c: FeedbackCompany | null) => void }) {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const [picker, setPicker] = useState(false);
  const q = useQuery({ queryKey: feedbackKeys.reviews(company?.id), queryFn: () => feedbackApi.reviews(company?.id) });
  // The API returns the full company list even when filtered.
  const data = q.data;
  const companies = data?.customers ?? [];

  const status = useMutation({
    mutationFn: ({ r, status }: { r: AdminReview; status: ReviewStatus }) => feedbackApi.setReviewStatus(r.id, status),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['admin-feedback', 'reviews'] });
      Alert.alert(v.status === 'PUBLISHED' ? 'Review published' : v.status === 'HIDDEN' ? 'Review hidden' : 'Saved');
    },
    onError: (e) => Alert.alert('Could not update the review', errorMessage(e)),
  });

  const confirm = (r: AdminReview, s: ReviewStatus) =>
    Alert.alert(
      s === 'PUBLISHED' ? 'Publish this review?' : 'Hide this review?',
      s === 'PUBLISHED'
        ? `It will be shown publicly as “${r.displayName ?? r.customer.name}”.`
        : 'It will no longer be shown publicly. You can publish it again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: s === 'PUBLISHED' ? 'Publish' : 'Hide', style: s === 'HIDDEN' ? 'destructive' : 'default', onPress: () => status.mutate({ r, status: s }) },
      ]
    );

  // Awaiting review, grouped by company.
  const pendingByCo = useMemo(() => {
    const m = new Map<string, { name: string; clientId: string; items: NonNullable<typeof data>['pending'] }>();
    for (const p of data?.pending ?? []) {
      const g = m.get(p.customer.id) ?? { name: p.customer.name, clientId: p.customer.clientId, items: [] };
      g.items.push(p);
      m.set(p.customer.id, g);
    }
    return [...m.values()];
  }, [data]);

  return (
    <>
      <View style={{ marginTop: 14 }}>
        <SelectBox
          value={company ? `${company.name} (${company.clientId})` : 'All companies'}
          placeholder="All companies"
          onPress={() => setPicker(true)}
        />
      </View>
      <Btn
        title="Review site links"
        icon="link-outline"
        variant="ghost"
        onPress={() => nav.navigate('FeedbackLinks')}
        style={{ marginTop: 10 }}
      />

      {q.isLoading ? (
        <Loading />
      ) : q.isError || !data ? (
        <View style={{ marginTop: 14 }}>
          <ErrorBox message={errorMessage(q.error, 'Could not load reviews')} onRetry={() => void q.refetch()} />
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
            <StatTile
              label="Average rating"
              value={data.stats.average === null ? '—' : `${data.stats.average.toFixed(1)} / 5`}
              sub={`From ${plural(data.stats.total, 'review')}`}
            />
            <StatTile label="Published" value={String(data.stats.published)} sub="Shown publicly" color={colors.okFg} />
            <StatTile
              label="Low ratings"
              value={String(data.stats.low)}
              sub="2 stars or fewer"
              color={data.stats.low ? colors.redFg : undefined}
            />
            <StatTile label="Awaiting review" value={String(data.stats.pending)} sub="Completed, no review yet" />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 10 }}>
            <Eyebrow>Client reviews</Eyebrow>
            <Muted size={12.5}>{plural(data.reviews.length, 'review')}</Muted>
          </View>
          {data.reviews.length === 0 ? (
            <EmptyCard icon="star-outline" title="No reviews yet" />
          ) : (
            <View style={{ gap: 10 }}>
              {data.reviews.map((r) => (
                <ReviewCard
                  key={r.id}
                  r={r}
                  busy={status.isPending && status.variables?.r.id === r.id}
                  onStatus={(s) => confirm(r, s)}
                />
              ))}
            </View>
          )}

          <Eyebrow style={{ marginTop: 24 }}>Awaiting review</Eyebrow>
          <Muted size={12.5} style={{ marginTop: 4, marginBottom: 10, lineHeight: 18 }}>
            Completed in the last 120 days. Each company sees these on its Feedback page.
          </Muted>
          {pendingByCo.length === 0 ? (
            <Card style={{ padding: 16 }}>
              <Muted size={13}>Nothing waiting.</Muted>
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {pendingByCo.map((g) => (
                <Card key={g.clientId} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                  <T w="s" size={14} style={{ marginBottom: 4 }}>
                    {g.name} <Muted size={13}>· {g.items.length}</Muted>
                  </T>
                  {g.items.map((p, i) => (
                    <View
                      key={p.taskId}
                      style={[
                        { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 8 },
                        i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                      ]}
                    >
                      <T size={13} style={{ flex: 1 }}>
                        {p.title}
                      </T>
                      <Muted size={12.5}>{fmtDate(p.completedAt)}</Muted>
                    </View>
                  ))}
                </Card>
              ))}
            </View>
          )}
        </>
      )}

      <CompanySheet
        open={picker}
        onClose={() => setPicker(false)}
        title="Filter by company"
        companies={companies}
        selected={company?.id}
        allowAll
        onPick={(c) => {
          setCompany(c);
          setPicker(false);
        }}
      />
    </>
  );
}

function ReviewCard({ r, busy, onStatus }: { r: AdminReview; busy: boolean; onStatus: (s: ReviewStatus) => void }) {
  const st = REVIEW_STATUS[r.status];
  const canPublish = r.status !== 'PUBLISHED' && r.displayAs !== 'PRIVATE';
  const canHide = r.status !== 'HIDDEN';
  return (
    <Card style={[{ padding: 14, gap: 10 }, r.rating <= 2 && { borderColor: colors.red }]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Monogram name={r.customer.name} />
        <View style={{ flex: 1 }}>
          <T w="s" size={15}>
            {r.taskTitle}
          </T>
          <Muted size={12} style={{ marginTop: 2, lineHeight: 17 }}>
            {r.customer.name} · {r.taskNumber} · by {r.clientName} · {fmtDate(r.createdAt)}
          </Muted>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Stars n={r.rating} size={17} />
        <Pill kind={st.kind} label={st.label} />
      </View>
      {r.tags.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {r.tags.map((t) => (
            <Tag key={t} label={t} />
          ))}
        </View>
      ) : null}
      {r.comment ? (
        <T size={14} style={{ lineHeight: 21 }}>
          “{r.comment}”
        </T>
      ) : null}
      <Muted size={12}>
        {r.displayAs === 'PRIVATE' ? "Client asked: team only — don't show publicly" : `Shown as: ${r.displayName ?? '—'}`}
      </Muted>
      {canPublish || canHide ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {canPublish ? (
            <Btn title="Publish" icon="globe-outline" onPress={() => onStatus('PUBLISHED')} loading={busy} style={{ flex: 1, minHeight: 42 }} />
          ) : null}
          {canHide ? (
            <Btn
              title="Hide"
              icon="eye-off-outline"
              variant="ghost"
              onPress={() => onStatus('HIDDEN')}
              disabled={busy}
              style={{ flex: 1, minHeight: 42 }}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

// ─── Testimonials ─────────────────────────────────────────

function TestimonialsTab() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: feedbackKeys.testimonials, queryFn: feedbackApi.testimonials });
  const [svc, setSvc] = useState('All');
  const [requestOpen, setRequestOpen] = useState(false);

  const all = q.data ?? [];
  const services = ['All', ...Array.from(new Set(all.map((t) => t.service).filter((s): s is string => !!s))).sort()];
  const cards = all.filter((t) => svc === 'All' || t.service === svc);
  const featured = all.filter((t) => t.featured);

  const feature = useMutation({
    mutationFn: (t: Testimonial) => feedbackApi.updateTestimonial(t.id, { featured: !t.featured }),
    onSuccess: (_d, t) => {
      void qc.invalidateQueries({ queryKey: feedbackKeys.testimonials });
      Alert.alert(t.featured ? 'Removed from website' : 'Featured on website');
    },
    onError: (e) => Alert.alert('Could not save', errorMessage(e)),
  });

  const toggleFeature = (t: Testimonial) =>
    Alert.alert(
      t.featured ? 'Remove from website?' : 'Feature on website?',
      t.featured ? 'It will no longer appear in the website widget.' : 'It will appear in the website widget on elomagroup.org.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: t.featured ? 'Remove' : 'Feature', onPress: () => feature.mutate(t) },
      ]
    );

  const copy = async (t: Testimonial) => {
    await Clipboard.setStringAsync(quoteLine(t));
    Alert.alert('Copied', 'Quote copied to the clipboard.');
  };

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Btn title="Request" icon="paper-plane-outline" onPress={() => setRequestOpen(true)} style={{ flex: 1 }} />
        <Btn title="Widget" icon="code-slash-outline" variant="ghost" onPress={() => nav.navigate('FeedbackWidget')} style={{ flex: 1 }} />
      </View>

      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <View style={{ marginTop: 14 }}>
          <ErrorBox message={errorMessage(q.error, 'Could not load testimonials')} onRetry={() => void q.refetch()} />
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
            <StatTile label="Approved" value={String(all.filter((t) => t.status === 'APPROVED').length)} sub="Ready to use" color={colors.okFg} />
            <StatTile label="With customer" value={String(all.filter((t) => t.status === 'WITH_CUSTOMER').length)} sub="Checking our edits" />
            <StatTile
              label="Videos"
              value={String(all.filter((t) => t.videoUrl && t.status !== 'WITHDRAWN').length)}
              sub="Recorded in the portal"
            />
            <StatTile label="On website" value={String(featured.length)} sub="Featured in the widget" />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 10 }}>
            <Eyebrow>Library</Eyebrow>
            <Muted size={12.5}>
              {plural(cards.length, 'testimonial')}
              {svc === 'All' ? '' : ` · ${svc}`}
            </Muted>
          </View>
          {services.length > 1 ? (
            <Chips options={services.map((s) => ({ value: s, label: s }))} value={svc} onChange={setSvc} style={{ marginBottom: 12 }} />
          ) : null}
          {cards.length === 0 ? (
            <EmptyCard icon="chatbubble-ellipses-outline" title="No testimonials yet" body="Use “Request” to invite a client." />
          ) : (
            <View style={{ gap: 10 }}>
              {cards.map((t) => (
                <TestimonialCard
                  key={t.id}
                  t={t}
                  onOpen={() => nav.navigate('FeedbackTestimonial', { id: t.id })}
                  onCopy={() => void copy(t)}
                  onEdit={() => nav.navigate('FeedbackTestimonialEdit', { id: t.id })}
                  onFeature={() => toggleFeature(t)}
                  featureBusy={feature.isPending && feature.variables?.id === t.id}
                />
              ))}
            </View>
          )}

          <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>Website preview</Eyebrow>
          <Card style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T w="s" size={16}>
                What our clients say
              </T>
              <Muted size={12}>elomagroup.org</Muted>
            </View>
            {featured.length === 0 ? (
              <Muted size={13}>Feature a testimonial to show it here.</Muted>
            ) : (
              featured.map((f, i) => (
                <View key={f.id} style={[{ gap: 4, paddingTop: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                  <T size={13} style={{ lineHeight: 19 }}>
                    “{f.quote}”
                  </T>
                  <Muted size={12}>
                    {f.personName}, {f.companyName}
                  </Muted>
                </View>
              ))
            )}
          </Card>

          <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>How a testimonial flows</Eyebrow>
          <Card style={{ padding: 16, gap: 12 }}>
            {[
              'Customer gives 4–5 stars, or you request one, and the portal invites them to share a testimonial.',
              'They write it, optionally record a video, and choose where it may be used.',
              'If you tidy the wording, it goes back to them to approve.',
              'Approved quotes can be featured on the website or used in proposals. Customers can withdraw any time.',
            ].map((text, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View
                  style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}
                >
                  <T w="s" size={12}>
                    {i + 1}
                  </T>
                </View>
                <T size={13} style={{ flex: 1, lineHeight: 19 }}>
                  {text}
                </T>
              </View>
            ))}
          </Card>
        </>
      )}

      <RequestSheet open={requestOpen} onClose={() => setRequestOpen(false)} />
    </>
  );
}

function TestimonialCard({
  t,
  onOpen,
  onCopy,
  onEdit,
  onFeature,
  featureBusy,
}: {
  t: Testimonial;
  onOpen: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onFeature: () => void;
  featureBusy: boolean;
}) {
  const st = T_STATUS[t.status];
  const canFeature = t.status === 'APPROVED' && t.uses.includes('WEBSITE');
  return (
    <Card onPress={onOpen} style={[{ padding: 14, gap: 12 }, t.status === 'WITHDRAWN' && { opacity: 0.6 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Muted size={12} style={{ flex: 1 }} numberOfLines={1}>
          {t.service || 'No service tag'}
        </Muted>
        {t.featured ? <Pill kind="info" label="★ On website" /> : null}
        <Pill kind={st.kind} label={st.label} />
      </View>
      <VideoButton t={t} />
      <T size={14} style={{ lineHeight: 21 }} numberOfLines={6}>
        “{t.quote}”
      </T>
      {t.pendingQuote ? (
        <Muted size={12} numberOfLines={3} style={{ lineHeight: 17 }}>
          Our edit, awaiting the client: “{t.pendingQuote}”
        </Muted>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <PersonPhoto t={t} />
        <View style={{ flex: 1 }}>
          <T w="s" size={14}>
            {t.personName}
            {t.jobTitle ? `, ${t.jobTitle}` : ''}
          </T>
          <Muted size={12}>
            {t.companyName} · {fmtDate(t.createdAt)}
          </Muted>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {t.uses.length === 0 ? <Muted size={12}>No uses allowed</Muted> : t.uses.map((u) => <Tag key={u} icon="checkmark" label={USE_SHORT[u]} />)}
      </View>
      {t.status !== 'WITHDRAWN' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Btn title="Copy" icon="copy-outline" variant="ghost" onPress={onCopy} style={{ flexGrow: 1, minHeight: 42 }} />
          <Btn title="Edit" icon="create-outline" variant="ghost" onPress={onEdit} style={{ flexGrow: 1, minHeight: 42 }} />
          {canFeature ? (
            <Btn
              title={t.featured ? 'On website' : 'Feature'}
              icon={t.featured ? 'star' : 'star-outline'}
              variant={t.featured ? 'green' : 'ghost'}
              onPress={onFeature}
              loading={featureBusy}
              style={{ flexGrow: 1, minHeight: 42 }}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** Pick a company, confirm, and notify all its portal users. */
function RequestSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const q = useQuery({ queryKey: feedbackKeys.reviews(), queryFn: () => feedbackApi.reviews(), enabled: open });
  const send = useMutation({
    mutationFn: (c: FeedbackCompany) => feedbackApi.requestTestimonial(c.id),
    onSuccess: (r) => {
      onClose();
      Alert.alert('Request sent', `Sent to ${plural(r.sent, 'portal user')}.`);
    },
    onError: (e) => Alert.alert('Could not send the request', errorMessage(e)),
  });

  const pick = (c: FeedbackCompany | null) => {
    if (!c) return;
    Alert.alert(
      'Request a testimonial?',
      `Every active portal user of ${c.name} gets a notification (and a phone push if they use the app) inviting them to share a testimonial.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send request', onPress: () => send.mutate(c) },
      ]
    );
  };

  return (
    <CompanySheet
      open={open}
      onClose={onClose}
      title={send.isPending ? 'Sending…' : 'Request a testimonial'}
      companies={q.data?.customers ?? []}
      loading={q.isLoading}
      error={q.isError ? errorMessage(q.error, 'Could not load companies') : null}
      onRetry={() => void q.refetch()}
      onPick={pick}
    />
  );
}
