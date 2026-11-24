import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { PageHeader } from '@/components/shared/misc';
import {
  feedbackApi,
  REVIEW_SITES,
  USE_SHORT,
  type AdminReview,
  type ReviewLinks,
  type ReviewStatus,
  type Testimonial,
} from '@/api/feedback';
import { Monogram, Stars } from './feedbackUi';
import { errMsg, fieldLabel, fmtDate, initialsOf, sectionStyle } from './feedbackFmt';

const ALL = '';
const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = { NEW: 'With our team', PUBLISHED: 'Published', HIDDEN: 'Hidden' };
const T_STATUS = { APPROVED: 'Approved', WITH_CUSTOMER: 'With customer', WITHDRAWN: 'Withdrawn' } as const;
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api';

export default function AdminFeedbackPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'testimonials' ? 'testimonials' : 'reviews';
  const setTab = (t: string) => setParams(t === 'reviews' ? {} : { tab: t }, { replace: true });

  return (
    <div className="ec-page">
      <PageHeader
        eyebrow="EG ELOMA · ADMIN"
        title="Feedback"
        description="Client reviews of completed tasks, company by company, and the testimonials they've approved for the website and proposals."
      />
      <div className="segs" role="tablist" style={{ alignSelf: 'flex-start' }}>
        <button type="button" role="tab" aria-selected={tab === 'reviews'} className={`seg${tab === 'reviews' ? ' on' : ''}`} onClick={() => setTab('reviews')}>
          Reviews
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'testimonials'}
          className={`seg${tab === 'testimonials' ? ' on' : ''}`}
          onClick={() => setTab('testimonials')}
        >
          Testimonials
        </button>
      </div>
      {tab === 'reviews' ? <ReviewsTab /> : <TestimonialsTab />}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="glass" style={{ padding: 22 }}>
      <div className="eyebrow">{label}</div>
      <div className="disp" style={{ fontSize: 32, fontWeight: 500, marginTop: 10, color: tone }}>
        {value}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

const statGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 };

/* ─── Reviews ───────────────────────────────────────────── */

function ReviewsTab() {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState(ALL);
  const [showLinks, setShowLinks] = useState(false);
  const q = useQuery({
    queryKey: ['feedback', 'admin', 'reviews', customerId],
    queryFn: () => feedbackApi.adminReviews(customerId || undefined),
  });
  const data = q.data;

  const setStatus = async (r: AdminReview, status: ReviewStatus) => {
    try {
      await feedbackApi.setReviewStatus(r.id, status);
      toast.success(status === 'PUBLISHED' ? 'Review published' : status === 'HIDDEN' ? 'Review hidden' : 'Saved');
      qc.invalidateQueries({ queryKey: ['feedback', 'admin', 'reviews'] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  // Pending grouped by company.
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
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <span className="muted">Company</span>
          <select className="inp" value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ minWidth: 240 }}>
            <option value={ALL}>All companies</option>
            {(data?.customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.clientId})
              </option>
            ))}
          </select>
        </label>
        <button className="btn bg" type="button" onClick={() => setShowLinks(true)}>
          Review site links
        </button>
      </div>

      {q.isLoading ? (
        <div className="skel" style={{ height: 300 }} />
      ) : q.isError || !data ? (
        <div className="glass" style={{ padding: 32, textAlign: 'center' }}>
          <span className="muted">{errMsg(q.error, 'Could not load reviews')}</span>{' '}
          <button type="button" className="linkbtn" onClick={() => q.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <div style={statGrid}>
            <Stat
              label="AVERAGE RATING"
              value={data.stats.average === null ? '—' : `${data.stats.average.toFixed(1)} / 5`}
              sub={`From ${data.stats.total} review${data.stats.total === 1 ? '' : 's'}`}
            />
            <Stat label="PUBLISHED" value={String(data.stats.published)} sub="Shown publicly" tone="var(--gT)" />
            <Stat label="LOW RATINGS" value={String(data.stats.low)} sub="2 stars or fewer" tone={data.stats.low ? 'var(--rT)' : undefined} />
            <Stat label="AWAITING REVIEW" value={String(data.stats.pending)} sub="Completed tasks, no review yet" />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
            <section className="glass up" style={{ ...sectionStyle, flex: '2 1 520px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span className="eyebrow">CLIENT REVIEWS</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {data.reviews.length} review{data.reviews.length === 1 ? '' : 's'}
                </span>
              </div>
              {data.reviews.length === 0 ? (
                <span className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>
                  No reviews yet.
                </span>
              ) : (
                data.reviews.map((r) => (
                  <article
                    key={r.id}
                    style={{
                      border: `1px solid ${r.rating <= 2 ? 'var(--rT)' : 'rgba(var(--w), 0.1)'}`,
                      borderRadius: 12,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                        <Monogram text={initialsOf(r.customer.name)} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 15, fontWeight: 500, overflowWrap: 'anywhere' }}>{r.taskTitle}</span>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {r.customer.name} · {r.taskNumber} · by {r.clientName} · {fmtDate(r.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <Stars n={r.rating} />
                        <span className={`chip ${r.status === 'PUBLISHED' ? 'c-ok' : r.status === 'HIDDEN' ? 'c-ns' : 'c-warn'}`}>
                          {REVIEW_STATUS_LABEL[r.status]}
                        </span>
                      </div>
                    </div>
                    {r.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {r.tags.map((t) => (
                          <span key={t} className="chip c-info">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.comment && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>“{r.comment}”</p>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {r.displayAs === 'PRIVATE' ? "Client asked: team only — don't show publicly" : `Shown as: ${r.displayName}`}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {r.status !== 'PUBLISHED' && r.displayAs !== 'PRIVATE' && (
                          <button className="btn bp sm" type="button" onClick={() => setStatus(r, 'PUBLISHED')}>
                            Publish
                          </button>
                        )}
                        {r.status !== 'HIDDEN' && (
                          <button className="btn bg sm" type="button" onClick={() => setStatus(r, 'HIDDEN')}>
                            Hide
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </section>

            <section className="glass up" style={{ ...sectionStyle, flex: '1 1 300px', minWidth: 0 }}>
              <span className="eyebrow">AWAITING REVIEW</span>
              <span className="muted" style={{ fontSize: 12 }}>
                Completed in the last 120 days. Each company sees these on its Feedback page.
              </span>
              {pendingByCo.length === 0 ? (
                <span className="muted" style={{ fontSize: 13 }}>
                  Nothing waiting.
                </span>
              ) : (
                pendingByCo.map((g) => (
                  <div key={g.clientId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {g.name} <span className="muted" style={{ fontWeight: 400 }}>· {g.items.length}</span>
                    </span>
                    {g.items.map((p) => (
                      <div
                        key={p.taskId}
                        style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(var(--w), 0.06)' }}
                      >
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.title}</span>
                        <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                          {fmtDate(p.completedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </section>
          </div>
        </>
      )}
      {showLinks && <ReviewLinksDialog onClose={() => setShowLinks(false)} />}
    </>
  );
}

/* ─── Testimonials ──────────────────────────────────────── */

function TestimonialsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['feedback', 'admin', 'testimonials'], queryFn: feedbackApi.adminTestimonials });
  const [svc, setSvc] = useState('All');
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [showWidget, setShowWidget] = useState(false);

  const all = q.data ?? [];
  const services = ['All', ...Array.from(new Set(all.map((t) => t.service).filter((s): s is string => !!s))).sort()];
  const cards = all.filter((t) => svc === 'All' || t.service === svc);
  const featured = all.filter((t) => t.featured);

  const patch = async (t: Testimonial, body: Parameters<typeof feedbackApi.updateTestimonial>[1], done = 'Saved') => {
    try {
      await feedbackApi.updateTestimonial(t.id, body);
      toast.success(done);
      qc.invalidateQueries({ queryKey: ['feedback', 'admin', 'testimonials'] });
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    }
  };

  const copy = async (t: Testimonial) => {
    try {
      await navigator.clipboard.writeText(`“${t.quote}” — ${t.personName}${t.jobTitle ? `, ${t.jobTitle}` : ''}, ${t.companyName}`);
      setCopied(t.id);
      window.setTimeout(() => setCopied((c) => (c === t.id ? null : c)), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button className="btn bg" type="button" onClick={() => setShowWidget(true)}>
          Website widget
        </button>
        <button className="btn bp" type="button" onClick={() => setShowRequest(true)}>
          Request a testimonial
        </button>
      </div>

      {q.isLoading ? (
        <div className="skel" style={{ height: 300 }} />
      ) : q.isError ? (
        <div className="glass" style={{ padding: 32, textAlign: 'center' }}>
          <span className="muted">{errMsg(q.error, 'Could not load testimonials')}</span>
        </div>
      ) : (
        <>
          <div style={statGrid}>
            <Stat label="APPROVED" value={String(all.filter((t) => t.status === 'APPROVED').length)} sub="Ready to use" tone="var(--gT)" />
            <Stat label="WITH CUSTOMER" value={String(all.filter((t) => t.status === 'WITH_CUSTOMER').length)} sub="Checking our edits" />
            <Stat label="VIDEOS" value={String(all.filter((t) => t.videoUrl && t.status !== 'WITHDRAWN').length)} sub="Recorded in the portal" />
            <Stat label="ON WEBSITE" value={String(featured.length)} sub="Featured in the widget" />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
            <section className="glass up" style={{ ...sectionStyle, flex: '2 1 520px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span className="eyebrow">LIBRARY</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {cards.length} testimonial{cards.length === 1 ? '' : 's'}
                    {svc === 'All' ? '' : ` · ${svc}`}
                  </span>
                </div>
                {services.length > 1 && (
                  <div className="segs">
                    {services.map((s) => (
                      <button key={s} type="button" className={`seg${svc === s ? ' on' : ''}`} onClick={() => setSvc(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {cards.length === 0 ? (
                <span className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
                  No testimonials yet. Use “Request a testimonial” to invite a client.
                </span>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                  {cards.map((t) => {
                    const canFeature = t.status === 'APPROVED' && t.uses.includes('WEBSITE');
                    return (
                      <article
                        key={t.id}
                        style={{
                          border: '1px solid rgba(var(--w), 0.1)',
                          borderRadius: 14,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          opacity: t.status === 'WITHDRAWN' ? 0.6 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {t.service || 'No service tag'}
                          </span>
                          <span className={`chip ${t.status === 'APPROVED' ? 'c-ok' : t.status === 'WITHDRAWN' ? 'c-ns' : 'c-warn'}`}>
                            {T_STATUS[t.status]}
                          </span>
                        </div>
                        {t.videoUrl && (
                          <video src={t.videoUrl} controls playsInline preload="metadata" style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: 200 }} />
                        )}
                        <blockquote style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>“{t.quote}”</blockquote>
                        {t.pendingQuote && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            Our edit, awaiting the client: “{t.pendingQuote}”
                          </span>
                        )}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {t.photoUrl ? (
                            <img src={t.photoUrl} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} />
                          ) : (
                            <Monogram text={initialsOf(t.personName)} />
                          )}
                          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span style={{ fontSize: 14, fontWeight: 500 }}>
                              {t.personName}
                              {t.jobTitle ? `, ${t.jobTitle}` : ''}
                            </span>
                            <span className="muted" style={{ fontSize: 12 }}>
                              {t.companyName} · {fmtDate(t.createdAt)}
                            </span>
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {t.uses.length === 0 ? (
                            <span className="muted" style={{ fontSize: 12 }}>
                              No uses allowed
                            </span>
                          ) : (
                            t.uses.map((u) => (
                              <span key={u} className="chip c-info">
                                ✓ {USE_SHORT[u]}
                              </span>
                            ))
                          )}
                        </div>
                        {t.status !== 'WITHDRAWN' && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn bg sm" type="button" onClick={() => copy(t)}>
                              {copied === t.id ? 'Copied ✓' : 'Copy quote'}
                            </button>
                            <button className="btn bg sm" type="button" onClick={() => setEditing(t)}>
                              Edit
                            </button>
                            {canFeature && (
                              <button
                                className={`btn sm ${t.featured ? 'bp' : 'bg'}`}
                                type="button"
                                aria-pressed={t.featured}
                                onClick={() => patch(t, { featured: !t.featured }, t.featured ? 'Removed from website' : 'Featured on website')}
                              >
                                {t.featured ? '★ On website' : 'Feature on website'}
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <section className="glass up" style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="eyebrow">WEBSITE PREVIEW</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    elomagroup.org
                  </span>
                </div>
                <div style={{ border: '1px solid rgba(var(--w), 0.1)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <span className="disp" style={{ fontSize: 18, fontWeight: 500 }}>
                    What our clients say
                  </span>
                  {featured.length === 0 ? (
                    <span className="muted" style={{ fontSize: 13 }}>
                      Feature a testimonial to show it here.
                    </span>
                  ) : (
                    featured.map((f) => (
                      <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 10, borderBottom: '1px solid rgba(var(--w), 0.06)' }}>
                        <span style={{ fontSize: 13, lineHeight: 1.5 }}>“{f.quote}”</span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {f.personName}, {f.companyName}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
              <section className="glass up" style={sectionStyle}>
                <span className="eyebrow">HOW A TESTIMONIAL FLOWS</span>
                {[
                  'Customer gives 4–5 stars, or you request one, and the portal invites them to share a testimonial.',
                  'They write it, optionally record a video, and choose where it may be used.',
                  'If you tidy the wording, it goes back to them to approve.',
                  'Approved quotes can be featured on the website or used in proposals. Customers can withdraw any time.',
                ].map((text, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, alignItems: 'flex-start' }}>
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: 'rgba(var(--w), 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 600,
                        flex: 'none',
                      }}
                    >
                      {i + 1}
                    </span>
                    <span>{text}</span>
                  </div>
                ))}
              </section>
            </aside>
          </div>
        </>
      )}

      {editing && (
        <EditTestimonialDialog
          t={editing}
          services={services.filter((s) => s !== 'All')}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const changedWords = body.pendingQuote !== undefined && body.pendingQuote !== editing.quote;
            if (await patch(editing, body, changedWords ? 'Edit sent to the client to approve' : 'Saved')) setEditing(null);
          }}
        />
      )}
      {showRequest && <RequestDialog onClose={() => setShowRequest(false)} />}
      {showWidget && <WidgetDialog onClose={() => setShowWidget(false)} />}
    </>
  );
}

/* ─── dialogs ───────────────────────────────────────────── */

function Popup({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6, 13, 25, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 90,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: 'min(85vh, 760px)',
          overflowY: 'auto',
          background: 'var(--surf)',
          color: 'var(--fg)',
          borderRadius: 16,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 24px 80px -20px rgba(15, 35, 64, 0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 className="disp" style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>
            {title}
          </h2>
          <button className="btn bg" type="button" aria-label="Close" onClick={onClose} style={{ width: 44, padding: 0 }}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ReviewLinksDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['feedback', 'admin', 'links'], queryFn: feedbackApi.reviewLinks });
  const [edited, setForm] = useState<ReviewLinks | null>(null);
  const [busy, setBusy] = useState(false);
  const form = edited ?? q.data ?? null;

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      await feedbackApi.saveReviewLinks(form);
      toast.success('Review links saved');
      qc.invalidateQueries({ queryKey: ['feedback', 'admin', 'links'] });
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popup title="Review site links" onClose={onClose}>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Clients see a site under “Review us elsewhere” only when its link is set here. Leave a box empty to hide that site.
      </p>
      {!form ? (
        <div className="skel" style={{ height: 200 }} />
      ) : (
        REVIEW_SITES.map((s) => (
          <label key={s.id} style={fieldLabel}>
            <span>{s.name} review link</span>
            <input
              className="inp"
              type="url"
              placeholder="https://"
              value={form[s.id] ?? ''}
              onChange={(e) => setForm({ ...form, [s.id]: e.target.value })}
            />
          </label>
        ))
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn bg" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn bp" type="button" onClick={save} disabled={busy || !form}>
          {busy ? 'Saving…' : 'Save links'}
        </button>
      </div>
    </Popup>
  );
}

function EditTestimonialDialog({
  t,
  services,
  onClose,
  onSave,
}: {
  t: Testimonial;
  services: string[];
  onClose: () => void;
  onSave: (body: { service?: string | null; pendingQuote?: string | null }) => Promise<void>;
}) {
  const [service, setService] = useState(t.service ?? '');
  const [wording, setWording] = useState(t.pendingQuote ?? t.quote);
  const [busy, setBusy] = useState(false);
  const wordsChanged = wording.trim() !== (t.pendingQuote ?? t.quote);

  return (
    <Popup title="Edit testimonial" onClose={onClose}>
      <label style={fieldLabel}>
        <span>Service tag</span>
        <input className="inp" list="tm-services" maxLength={120} value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Microsoft 365" />
        <datalist id="tm-services">
          {services.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label style={fieldLabel}>
        <span>Wording</span>
        <textarea className="inp" rows={6} maxLength={4000} value={wording} onChange={(e) => setWording(e.target.value)} />
      </label>
      <span className="muted" style={{ fontSize: 12 }}>
        Changed wording goes back to {t.personName} to approve. Until then the client's original words stay in use and it can't be featured.
      </span>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn bg" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn bp"
          type="button"
          disabled={busy || !wording.trim()}
          onClick={async () => {
            setBusy(true);
            await onSave({
              service: service.trim() || null,
              ...(wordsChanged ? { pendingQuote: wording.trim() } : {}),
            });
            setBusy(false);
          }}
        >
          {busy ? 'Saving…' : wordsChanged ? 'Send edit to client' : 'Save'}
        </button>
      </div>
    </Popup>
  );
}

function RequestDialog({ onClose }: { onClose: () => void }) {
  const q = useQuery({ queryKey: ['feedback', 'admin', 'reviews', ''], queryFn: () => feedbackApi.adminReviews() });
  const [customerId, setCustomerId] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!customerId) return;
    setBusy(true);
    try {
      const r = await feedbackApi.requestTestimonial(customerId);
      toast.success(`Request sent to ${r.sent} portal user${r.sent === 1 ? '' : 's'}`);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popup title="Request a testimonial" onClose={onClose}>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Every active portal user of the company gets a notification (and a phone push if they use the app) inviting them to share a testimonial.
      </p>
      <label style={fieldLabel}>
        <span>Company</span>
        <select className="inp" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Choose a company…</option>
          {(q.data?.customers ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.clientId})
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn bg" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn bp" type="button" onClick={send} disabled={busy || !customerId}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </Popup>
  );
}

function WidgetDialog({ onClose }: { onClose: () => void }) {
  const endpoint = `${API_BASE.replace(/\/$/, '')}/feedback/public/testimonials`;
  const snippet = `<div id="eg-testimonials"></div>
<script>
fetch('${endpoint}').then(r => r.json()).then(({ data }) => {
  const box = document.getElementById('eg-testimonials');
  box.innerHTML = data.map(t =>
    '<figure><blockquote></blockquote><figcaption></figcaption></figure>').join('');
  box.querySelectorAll('figure').forEach((f, i) => {
    f.querySelector('blockquote').textContent = '“' + data[i].quote + '”';
    f.querySelector('figcaption').textContent = data[i].personName + ', ' + data[i].companyName;
  });
});
</script>`;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };
  return (
    <Popup title="Website widget" onClose={onClose}>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Paste this into elomagroup.org to show the testimonials marked “On website”. Only client-approved quotes the client allowed on the website are ever returned.
      </p>
      <label style={fieldLabel}>
        <span>Data link</span>
        <input className="inp" readOnly value={endpoint} onFocus={(e) => e.target.select()} />
      </label>
      <pre
        style={{
          margin: 0,
          padding: 14,
          borderRadius: 10,
          background: 'rgba(var(--w), 0.06)',
          fontSize: 12,
          overflowX: 'auto',
          whiteSpace: 'pre',
        }}
      >
        {snippet}
      </pre>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn bg" type="button" onClick={() => copy(endpoint)}>
          Copy link
        </button>
        <button className="btn bp" type="button" onClick={() => copy(snippet)}>
          Copy embed code
        </button>
      </div>
    </Popup>
  );
}
