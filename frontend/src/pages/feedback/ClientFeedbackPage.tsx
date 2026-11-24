import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/misc';
import {
  feedbackApi,
  REVIEW_SITES,
  USE_LABELS,
  USE_SHORT,
  type ClientFeedback,
  type ClientReview,
  type DisplayAs,
  type Testimonial,
  type TestimonialUse,
} from '@/api/feedback';
import { Stars, StarPicker, Monogram } from './feedbackUi';
import { errMsg, fmtDate, initialsOf, sectionStyle, fieldLabel } from './feedbackFmt';

const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
const STATUS_LABEL = { NEW: 'With our team', PUBLISHED: 'Published', HIDDEN: 'Not shown publicly' } as const;
const T_STATUS = { APPROVED: 'Approved', WITH_CUSTOMER: 'Please check our edit', WITHDRAWN: 'Withdrawn' } as const;

type Draft = { rating: number; tags: string[]; comment: string; displayAs: DisplayAs };

export default function ClientFeedbackPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['client', 'feedback'], queryFn: feedbackApi.client });
  const [open, setOpen] = useState<string | null>(null); // taskId, or `edit:<reviewId>`
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState<ClientReview | null>(null);
  const [copied, setCopied] = useState(false);
  const [visited, setVisited] = useState<Record<string, boolean>>({});

  const data = q.data;
  const firstName = data?.me.firstName || 'there';
  const mgr = data?.accountManager;
  const mgrName = mgr?.firstName || 'your account manager';
  const sites = REVIEW_SITES.filter((s) => !!data?.reviewLinks[s.id]);

  const draftOf = (key: string, base?: Partial<Draft>): Draft =>
    drafts[key] ?? { rating: 0, tags: [], comment: '', displayAs: 'COMPANY', ...base };
  const setDraft = (key: string, patch: Partial<Draft>, base?: Partial<Draft>) =>
    setDrafts((m) => ({ ...m, [key]: { ...draftOf(key, base), ...patch } }));
  const clear = (key: string) =>
    setDrafts((m) => {
      const n = { ...m };
      delete n[key];
      return n;
    });

  const submit = async (key: string, taskId: string, reviewId?: string) => {
    const dr = draftOf(key);
    if (!dr.rating) return toast.error('Pick a star rating first');
    setBusy(true);
    try {
      const body = { rating: dr.rating, tags: dr.tags, comment: dr.comment.trim() || null, displayAs: dr.displayAs };
      const saved = reviewId ? await feedbackApi.updateReview(reviewId, body) : await feedbackApi.createReview(taskId, body);
      clear(key);
      setOpen(null);
      setJustSent(saved);
      setCopied(false);
      setVisited({});
      toast.success(reviewId ? 'Review updated' : 'Thanks for your review');
      qc.invalidateQueries({ queryKey: ['client', 'feedback'] });
    } catch (e) {
      toast.error(errMsg(e, 'Could not send your review'));
    } finally {
      setBusy(false);
    }
  };

  const copyReview = async () => {
    if (!justSent) return;
    const text = justSent.comment?.trim() || `${justSent.rating} out of 5 stars for "${justSent.taskTitle}".`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error('Could not copy');
    }
  };

  const openSite = (id: string) => {
    const url = data?.reviewLinks[id as keyof ClientFeedback['reviewLinks']];
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    setVisited((v) => ({ ...v, [id]: true }));
  };

  const ready = data?.ready ?? [];

  return (
    <div className="ec-page">
      <PageHeader
        eyebrow={data?.company.name?.toUpperCase() || 'FEEDBACK'}
        title="Your feedback"
        description="Rate the work we've finished for you. Your account manager reads every review, and you choose whether it's shown publicly."
      />

      {q.isLoading ? (
        <div className="skel" style={{ height: 320 }} />
      ) : q.isError || !data ? (
        <div className="glass" style={{ padding: 32, textAlign: 'center' }}>
          <span className="muted">{errMsg(q.error, 'Could not load your feedback')}</span>{' '}
          <button type="button" className="linkbtn" onClick={() => q.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ flex: '2 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Ready to review */}
            <section className="glass up" style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span className="eyebrow">READY TO REVIEW</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {ready.length} {ready.length === 1 ? 'item' : 'items'} finished recently
                </span>
              </div>
              {ready.length === 0 ? (
                <div className="muted" style={{ padding: '18px 0', textAlign: 'center' }}>
                  You're all caught up. Thanks for the feedback.
                </div>
              ) : (
                ready.map((t) => (
                  <ReviewCard
                    key={t.taskId}
                    title={t.title}
                    meta={`Task completed ${fmtDate(t.completedAt)} · ${t.taskNumber}`}
                    draft={draftOf(t.taskId)}
                    open={open === t.taskId}
                    busy={busy}
                    data={data}
                    onRate={(n) => {
                      setDraft(t.taskId, { rating: n });
                      setOpen(t.taskId);
                    }}
                    onChange={(p) => setDraft(t.taskId, p)}
                    onSubmit={() => submit(t.taskId, t.taskId)}
                    onCancel={() => {
                      clear(t.taskId);
                      setOpen(null);
                    }}
                  />
                ))
              )}
            </section>

            {/* After sending: share publicly too */}
            {justSent && (
              <section className="glass up" style={{ ...sectionStyle, boxShadow: 'inset 4px 0 0 var(--brand)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 260px' }}>
                    <span style={{ fontWeight: 500 }}>
                      Thanks, {firstName}. Your review is with {mgrName}.
                    </span>
                    {sites.length > 0 && (
                      <span className="muted" style={{ fontSize: 13 }}>
                        Want to share it publicly too? Copy your words, then pick a site. Each opens in a new tab, signed in as you.
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {justSent.rating >= 4 && (
                      <Link className="btn bg" to="/client/feedback/testimonial">
                        Share a testimonial
                      </Link>
                    )}
                    {sites.length > 0 && (
                      <button className="btn bg" type="button" onClick={copyReview}>
                        {copied ? 'Copied ✓' : 'Copy my review'}
                      </button>
                    )}
                  </div>
                </div>
                {sites.length > 0 && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                      {sites.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => openSite(s.id)}
                          className="glass"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                            minHeight: 56,
                            padding: '10px 12px',
                            borderRadius: 12,
                            textAlign: 'left',
                            cursor: 'pointer',
                            color: 'inherit',
                            border: `1px solid ${visited[s.id] ? 'var(--brand)' : 'rgba(var(--w), 0.1)'}`,
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <SiteBadge letter={s.letter} color={s.color} />
                            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</span>
                              <span className="muted" style={{ fontSize: 12 }}>
                                {s.note}
                              </span>
                            </span>
                          </span>
                          <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                            {visited[s.id] ? 'Opened ✓' : 'Open ↗'}
                          </span>
                        </button>
                      ))}
                    </div>
                    <span className="muted" style={{ fontSize: 12 }}>
                      Totally optional, and the same invitation goes to every customer whatever rating they gave.
                    </span>
                  </>
                )}
              </section>
            )}

            {/* History */}
            <section className="glass up" style={sectionStyle}>
              <span className="eyebrow">YOUR REVIEWS</span>
              {data.reviews.length === 0 ? (
                <span className="muted" style={{ fontSize: 13 }}>
                  No reviews yet. Rate a finished task above.
                </span>
              ) : (
                data.reviews.map((r) => {
                  const key = `edit:${r.id}`;
                  if (open === key) {
                    const base = { rating: r.rating, tags: r.tags, comment: r.comment ?? '', displayAs: r.displayAs };
                    return (
                      <ReviewCard
                        key={r.id}
                        title={r.taskTitle}
                        meta={`Reviewed ${fmtDate(r.createdAt)} · ${r.taskNumber}`}
                        draft={draftOf(key, base)}
                        open
                        busy={busy}
                        data={data}
                        submitLabel="Save changes"
                        onRate={(n) => setDraft(key, { rating: n }, base)}
                        onChange={(p) => setDraft(key, p, base)}
                        onSubmit={() => submit(key, r.taskId, r.id)}
                        onCancel={() => {
                          clear(key);
                          setOpen(null);
                        }}
                      />
                    );
                  }
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                        padding: '10px 0',
                        borderBottom: '1px solid rgba(var(--w), 0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{r.taskTitle}</span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          Reviewed {fmtDate(r.updatedAt)}
                          {r.displayAs === 'PRIVATE' ? ' · Team only' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Stars n={r.rating} />
                        <span className={`chip ${r.status === 'PUBLISHED' ? 'c-ok' : 'c-warn'}`}>{STATUS_LABEL[r.status]}</span>
                        <button type="button" className="linkbtn" onClick={() => setOpen(key)}>
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </section>

            {data.testimonials.length > 0 && <TestimonialsList items={data.testimonials} />}
          </div>

          {/* Aside */}
          <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {mgr && (
              <section className="glass up" style={sectionStyle}>
                <span className="eyebrow">YOUR ACCOUNT MANAGER</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Monogram text={initialsOf(mgr.name)} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 500 }}>{mgr.name}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      Reads every review personally
                    </span>
                  </div>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Had a problem? A low rating goes straight to {mgr.firstName}, who'll get in touch within 2 business days.
                </p>
                <a className="btn bg" href={`mailto:${mgr.email}`} style={{ justifyContent: 'center' }}>
                  Message {mgr.firstName} instead
                </a>
              </section>
            )}

            <section className="glass up" style={sectionStyle}>
              <span className="eyebrow">HAPPY WITH OUR WORK?</span>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Share a short testimonial, written or on video, that we can show to businesses like yours. You approve every word.
              </p>
              <Link className="btn bp" to="/client/feedback/testimonial" style={{ justifyContent: 'center' }}>
                Share a testimonial
              </Link>
            </section>

            {sites.length > 0 && (
              <section className="glass up" style={sectionStyle}>
                <span className="eyebrow">REVIEW US ELSEWHERE</span>
                {sites.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openSite(s.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      minHeight: 44,
                      padding: '6px 0',
                      background: 'transparent',
                      border: 0,
                      borderBottom: '1px solid rgba(var(--w), 0.06)',
                      color: 'inherit',
                      cursor: 'pointer',
                      font: 'inherit',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <SiteBadge letter={s.letter} color={s.color} small />
                      <span style={{ fontSize: 14 }}>{s.name}</span>
                    </span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      Open ↗
                    </span>
                  </button>
                ))}
              </section>
            )}

            <section className="glass up" style={sectionStyle}>
              <span className="eyebrow">HOW REVIEWS ARE USED</span>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                You choose how your name appears, or keep a review private to our team. Public reviews may be shown on
                elomagroup.org exactly as you wrote them. You can edit your review any time.
              </p>
              <span className="muted" style={{ fontSize: 12 }}>
                Privacy Act 1988
              </span>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function SiteBadge({ letter, color, small }: { letter: string; color: string; small?: boolean }) {
  const s = small ? 26 : 32;
  return (
    <span
      style={{
        width: s,
        height: s,
        borderRadius: 8,
        background: color,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: small ? 12 : 14,
        flex: 'none',
      }}
    >
      {letter}
    </span>
  );
}

function ReviewCard({
  title,
  meta,
  draft,
  open,
  busy,
  data,
  submitLabel = 'Submit review',
  onRate,
  onChange,
  onSubmit,
  onCancel,
}: {
  title: string;
  meta: string;
  draft: Draft;
  open: boolean;
  busy: boolean;
  data: ClientFeedback;
  submitLabel?: string;
  onRate: (n: number) => void;
  onChange: (p: Partial<Draft>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <article
      style={{
        border: `1px solid ${open ? 'var(--brand)' : 'rgba(var(--w), 0.1)'}`,
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Monogram text={initialsOf(title)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 500, overflowWrap: 'anywhere' }}>{title}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {meta}
            </span>
          </div>
        </div>
        <StarPicker value={draft.rating} onPick={onRate} label={`Rate ${title}`} />
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {draft.rating > 0 && (
            <span style={{ fontSize: 14 }}>
              {draft.rating} of 5 · {WORDS[draft.rating]}. Anything you would like to add?
            </span>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.tags.map((t) => {
              const on = draft.tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ tags: on ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] })}
                  style={{
                    height: 38,
                    padding: '0 14px',
                    borderRadius: 999,
                    fontSize: 13,
                    cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--brand)' : 'rgba(var(--w), 0.18)'}`,
                    background: on ? 'rgba(31, 138, 91, 0.12)' : 'transparent',
                    color: on ? 'var(--gT)' : 'inherit',
                    fontWeight: on ? 500 : 400,
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <label style={fieldLabel}>
            <span>
              Tell us more <span className="muted">Optional</span>
            </span>
            <textarea
              className="inp"
              rows={3}
              maxLength={4000}
              value={draft.comment}
              onChange={(e) => onChange({ comment: e.target.value })}
              placeholder="What went well, and what could we do better?"
            />
          </label>
          <label style={fieldLabel}>
            <span>Show my review as</span>
            <select className="inp" value={draft.displayAs} onChange={(e) => onChange({ displayAs: e.target.value as DisplayAs })}>
              {data.displayOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn bp" type="button" onClick={onSubmit} disabled={busy || !draft.rating}>
              {busy ? 'Sending…' : submitLabel}
            </button>
            <button className="btn bg" type="button" onClick={onCancel} disabled={busy}>
              Not now
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function TestimonialsList({ items }: { items: Testimonial[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [uses, setUses] = useState<TestimonialUse[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['client', 'feedback'] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass up" style={sectionStyle}>
      <span className="eyebrow">YOUR TESTIMONIALS</span>
      {items.map((t) => (
        <div
          key={t.id}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0', borderBottom: '1px solid rgba(var(--w), 0.06)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Sent {fmtDate(t.createdAt)}
              {t.videoUrl ? ' · with video' : ''}
            </span>
            <span className={`chip ${t.status === 'APPROVED' ? 'c-ok' : t.status === 'WITHDRAWN' ? 'c-ns' : 'c-warn'}`}>
              {T_STATUS[t.status]}
            </span>
          </div>
          <blockquote style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>“{t.quote}”</blockquote>
          {t.status === 'WITH_CUSTOMER' && t.pendingQuote && (
            <div style={{ border: '1px solid var(--brand)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="eyebrow">OUR SUGGESTED WORDING</span>
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>“{t.pendingQuote}”</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn bp sm" type="button" disabled={busy} onClick={() => run(() => feedbackApi.decideEdit(t.id, true), 'Thanks — edit approved')}>
                  Approve this wording
                </button>
                <button className="btn bg sm" type="button" disabled={busy} onClick={() => run(() => feedbackApi.decideEdit(t.id, false), 'Kept your original words')}>
                  Keep my original
                </button>
              </div>
            </div>
          )}
          {t.status !== 'WITHDRAWN' &&
            (editing === t.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(Object.keys(USE_LABELS) as TestimonialUse[]).map((u) => (
                  <label key={u} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={uses.includes(u)}
                      onChange={() => setUses((l) => (l.includes(u) ? l.filter((x) => x !== u) : [...l, u]))}
                    />
                    {USE_LABELS[u]}
                  </label>
                ))}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn bp sm" type="button" disabled={busy} onClick={() => run(() => feedbackApi.setTestimonialUses(t.id, uses), 'Saved')}>
                    Save
                  </button>
                  <button className="btn bg sm" type="button" disabled={busy} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn bg sm"
                    type="button"
                    disabled={busy}
                    style={{ color: 'var(--rT)' }}
                    onClick={() => run(() => feedbackApi.withdrawTestimonial(t.id), 'Testimonial withdrawn')}
                  >
                    Take it down
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  May be used on: {t.uses.length ? t.uses.map((u) => USE_SHORT[u]).join(', ') : 'nowhere yet'}
                </span>
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => {
                    setUses(t.uses);
                    setEditing(t.id);
                  }}
                >
                  Change where it's used
                </button>
              </div>
            ))}
        </div>
      ))}
    </section>
  );
}
