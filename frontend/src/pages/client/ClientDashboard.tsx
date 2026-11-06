import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { CLIENT_TASK_SUMMARY_KEY } from '@/lib/taskSeen';
import { useAuth } from '@/store/auth';
import { formatCurrency, formatDate, mediaUrl } from '@/lib/utils';
import { LIVE_INVOICE_QUERY } from '@/lib/queryClient';
import { needsSignature } from '@/lib/agreements';
import { PublicHolidaysCard, upcomingHolidays } from '@/components/client/PublicHolidays';
import { HOME_TZ, useClientPortal } from '@/components/client/portalContext';

/* ---- Data presentation helpers (read-only) ------------------------------- */

const DAY = 86_400_000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isOngoing = (p: string) => p === 'IN_PROGRESS' || p === 'ONGOING';

interface ActivityItem {
  id: string;
  title: string;
  sub: string;
  at: number; // epoch ms — for sorting
  color: string;
}

function activityWhen(at: number): string {
  const dt = new Date(at);
  const day = dt.toLocaleDateString([], { day: '2-digit', month: 'short' });
  const time = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Calendar date (UTC midnight) of an ISO string or Date. */
const utcDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Melbourne wall-clock parts for `at`. */
function melbourne(at: number) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: HOME_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour')) + Number(get('minute')) / 60,
    wd: get('weekday'),
  };
}


/* ---- Page ---------------------------------------------------------------- */

export default function ClientDashboard() {
  const user = useAuth((s) => s.user);
  const { asideEl, openAssistant } = useClientPortal();
  // Captured once per mount so renders stay pure.
  const [now] = useState(() => Date.now());
  const [renAll, setRenAll] = useState(false);
  const dashQ = useQuery({ queryKey: ['client', 'dashboard'], queryFn: clientApi.dashboard });
  const tasksQ = useQuery({ queryKey: CLIENT_TASK_SUMMARY_KEY, queryFn: clientApi.taskSummary });
  const invQ = useQuery({
    // Unpaid invoices re-price live when products change — always show the latest.
    ...LIVE_INVOICE_QUERY,
    queryKey: ['client', 'invoices', 'recent'],
    queryFn: () => clientApi.invoices({ pageSize: 5 }),
  });
  const prodQ = useQuery({ queryKey: ['client', 'products'], queryFn: () => clientApi.products() });
  const profileQ = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });

  const d = dashQ.data;
  const profile = profileQ.data;
  const manager = profile?.accountManager ?? null;
  const acctStatus = profile?.accountStatusEffective ?? profile?.accountStatus;
  const suspended = acctStatus === 'SUSPENDED';
  const company = profile?.companyName?.trim();
  const tradingAs = profile?.tradingAs?.trim();
  const firstName = user?.firstName?.trim();

  const allTasks = tasksQ.data ?? [];
  const tOngoing = allTasks.filter((t) => isOngoing(t.progress)).length;
  const tNotStarted = allTasks.filter((t) => t.progress === 'NOT_STARTED').length;
  const tCompleted = allTasks.filter((t) => t.progress === 'COMPLETED').length;
  const openTasks = allTasks
    .filter((t) => t.progress !== 'COMPLETED')
    .sort(
      (a, b) =>
        Number(isOngoing(b.progress)) - Number(isOngoing(a.progress)) ||
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
    )
    .slice(0, 4);

  const toSign = (profile?.documents ?? []).filter(needsSignature);
  const products = prodQ.data ?? [];
  const approved = products.filter((p) => !p.pending);

  // Melbourne "today" drives the renewal axis, holidays and availability.
  const mel = melbourne(now);
  const todayUTC = Date.UTC(mel.y, mel.m - 1, mel.d);

  /* -- Contracts & renewals (design's gantt, from real licences) -- */
  const ren = (() => {
    const dated = approved.filter((p) => p.issueDate && p.expiryDate);
    if (!dated.length) return null;
    const a0 = Date.UTC(mel.y, mel.m - 3, 1);
    const a1 = Date.UTC(mel.y + 1, mel.m, 1);
    const pct = (t: number) => Math.max(0, Math.min(100, ((t - a0) / (a1 - a0)) * 100));
    const months: { left: string; label: string }[] = [];
    for (let i = 0; i < 15; i++) {
      const dt = new Date(Date.UTC(mel.y, mel.m - 3 + i, 1));
      if (i % 2 === 0)
        months.push({
          left: `${pct(dt.getTime())}%`,
          label: MON[dt.getUTCMonth()] + (dt.getUTCMonth() === 0 ? ` ’${String(dt.getUTCFullYear()).slice(2)}` : ''),
        });
    }
    const rows = dated
      .map((p) => {
        const s0 = utcDay(p.issueDate);
        const e = utcDay(p.expiryDate!);
        const l = pct(s0);
        const r = pct(e);
        const days = Math.round((e - todayUTC) / DAY);
        const total = Math.round((e - s0) / DAY) + 1;
        const day = Math.max(1, Math.min(total, Math.round((todayUTC - s0) / DAY) + 1));
        return {
          id: p.id,
          name: p.product,
          key: p.licence,
          left: `${l}%`,
          width: `${r - l}%`,
          done: `${e > s0 ? Math.max(0, Math.min(100, ((todayUTC - s0) / (e - s0)) * 100)) : 100}%`,
          days,
          daysLabel: days < 0 ? 'Expired' : `${days} days left`,
          cls: `chip ${days <= 30 ? 'c-red' : days <= 90 ? 'c-warn' : 'c-ok'}`,
          renew: formatDate(p.expiryDate),
          dayOf: `day ${day} of ${total}`,
        };
      })
      .sort((a, b) => a.days - b.days);
    const same = rows.filter((r) => r.days === rows[0].days).length;
    return {
      rows: renAll ? rows : rows.slice(0, 4),
      hasMore: rows.length > 4,
      more: renAll ? 'Show fewer' : `Show all ${rows.length} contracts`,
      b30: rows.filter((r) => r.days <= 30).length,
      b90: rows.filter((r) => r.days > 30 && r.days <= 90).length,
      bLater: rows.filter((r) => r.days > 90).length,
      months,
      today: `${pct(todayUTC)}%`,
      count: rows.length,
      nextDays: Math.max(0, rows[0].days),
      nextLine: `${same > 1 ? `${same} contracts renew` : `${rows[0].name} renews`} on ${rows[0].renew} · sorted by soonest renewal`,
    };
  })();

  /* -- Holidays & availability -- */
  const hols = upcomingHolidays(todayUTC);
  const holToday = hols.length > 0 && hols[0].t === todayUTC && !hols[0].tbc;
  const available = !holToday && mel.wd !== 'Sat' && mel.wd !== 'Sun' && mel.h >= 9 && mel.h < 17.5;

  // Headline summary.
  const owes = d ? d.outstanding.amount > 0 : false;
  const summary: ReactNode[] = [];
  if (toSign.length)
    summary.push(
      <>
        <b style={{ color: 'var(--wT)' }}>{plural(toSign.length, 'agreement')}</b> {toSign.length === 1 ? 'needs' : 'need'} your
        signature
      </>
    );
  if (tOngoing)
    summary.push(
      <>
        <b style={{ color: 'var(--vT)' }}>{plural(tOngoing, 'task')}</b> {tOngoing === 1 ? 'is' : 'are'} in progress
      </>
    );
  summary.push(
    owes && d ? (
      <>
        <b style={{ color: 'var(--rT)' }}>{formatCurrency(d.outstanding.amount)}</b> is outstanding
      </>
    ) : (
      <b style={{ color: 'var(--okT)' }}>nothing is owed</b>
    )
  );
  const summaryReady = !!d && !tasksQ.isLoading && !profileQ.isLoading;

  // Recent Activity — derived read-only from data already loaded on this page.
  const activityLoading = invQ.isLoading || prodQ.isLoading || tasksQ.isLoading;
  const activity: ActivityItem[] = [];
  for (const inv of invQ.data?.items ?? []) {
    if (inv.status === 'PAID' || Number(inv.amountPaid) > 0) {
      activity.push({ id: `pay-${inv.id}`, title: 'Payment received', sub: inv.invoiceNumber, at: new Date(inv.createdAt).getTime(), color: '#1FC88A' });
    }
    activity.push({ id: `inv-${inv.id}`, title: 'Invoice generated', sub: inv.invoiceNumber, at: new Date(inv.createdAt).getTime(), color: '#5ED1FF' });
  }
  for (const p of products) {
    if (!p.issueDate) continue;
    activity.push({
      id: `lic-${p.id}`,
      title: p.pending ? 'Product requested' : 'Licence activated',
      sub: p.product,
      at: new Date(p.issueDate).getTime(),
      color: p.pending ? '#FFB24A' : '#1FC88A',
    });
  }
  for (const t of allTasks) {
    const done = t.progress === 'COMPLETED';
    activity.push({
      id: `task-${t.id}`,
      title: done ? 'Task completed' : 'Task updated',
      sub: `${t.title} · ${t.bucketName}`,
      at: new Date(t.completedAt ?? t.updatedAt ?? t.createdAt).getTime(),
      color: done ? '#1FC88A' : '#5B7FC7',
    });
  }
  activity.sort((a, b) => b.at - a.at);
  const recentActivity = activity.slice(0, 6);

  const flightTotal = tOngoing + tNotStarted + tCompleted;

  const aside = (
    <>
      {manager && (
        <section className="glass card up" style={{ animationDelay: '.2s', padding: 20 }}>
          <h2 className="disp" style={{ margin: '0 0 16px', fontSize: 17 }}>
            Your account manager
          </h2>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <div
                className="disp"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'var(--surf2)',
                  border: '2px solid var(--brand)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 18,
                  overflow: 'hidden',
                }}
              >
                {manager.avatarUrl ? (
                  <img src={mediaUrl(manager.avatarUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  (manager.firstName?.[0] ?? '?').toUpperCase()
                )}
              </div>
              {available && (
                <span
                  style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 2,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: '#1FC88A',
                    border: '2px solid var(--surf)',
                  }}
                />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {manager.firstName} {manager.lastName}
              </div>
              <div className="muted" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>
                {manager.email}
              </div>
              {manager.phone && (
                <div className="muted mono" style={{ fontSize: 12 }}>
                  {manager.phone}
                </div>
              )}
              <span className={available ? 'chip c-ok' : 'chip c-ns'} style={{ marginTop: 6, fontSize: 11 }}>
                <span className="dot" />
                {available ? 'Available now' : 'Offline · replies from 9 AM Melbourne time'}
              </span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: manager.phone ? '1fr 1fr' : '1fr', gap: 10, marginTop: 16 }}>
            <a className="btn bp" href={`mailto:${manager.email}`}>
              Message
            </a>
            {manager.phone && (
              <a className="btn bg" href={`tel:${manager.phone.replace(/\s+/g, '')}`}>
                Call
              </a>
            )}
          </div>
          <a
            className="btn bg"
            href={`mailto:${manager.email}?subject=${encodeURIComponent(`Quarterly review - ${company ?? 'my account'}`)}`}
            style={{ width: '100%', marginTop: 10 }}
          >
            Book a quarterly review
          </a>
        </section>
      )}

      <section className="glass up" style={{ animationDelay: '.3s', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 className="disp" style={{ margin: 0, fontSize: 17 }}>
            Support
          </h2>
          <span className="chip c-ok">
            <span className="dot" />
            Online 24/7
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { t: 'Create a ticket', s: 'Our team is here around the clock', href: 'mailto:help@egdigital.com.au?subject=Support%20request' },
            { t: 'Knowledge base', s: 'Guides for your products and services', href: 'mailto:support@egdigital.com.au?subject=Knowledge%20base%20enquiry' },
          ].map((x) => (
            <a key={x.t} className="sugg" href={x.href} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <b style={{ fontWeight: 600 }}>{x.t}</b>
                <br />
                <span className="muted" style={{ fontSize: 12 }}>
                  {x.s}
                </span>
              </span>
              <span aria-hidden="true">→</span>
            </a>
          ))}
          <button
            type="button"
            className="sugg"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => openAssistant(`How can I grow ${company || 'your business'}?`)}
          >
            <span>
              <b style={{ fontWeight: 600 }}>Recommendations</b>
              <br />
              <span className="muted" style={{ fontSize: 12 }}>
                Ways to grow {company || 'your business'}
              </span>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <PublicHolidaysCard now={now} style={{ animationDelay: '.35s' }} />

      <section className="glass card up" style={{ animationDelay: '.4s', padding: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'rgba(215,38,61,.1)',
              color: '#D7263D',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.5c-.3 0-.6.2-.8.5C9.5 6 6 10.4 6 14a6 6 0 0 0 12 0c0-3.6-3.5-8-5.2-11-.2-.3-.5-.5-.8-.5z" />
            </svg>
          </span>
          <div>
            <h2 className="disp" style={{ margin: 0, fontSize: 17 }}>
              Give blood, save lives
            </h2>
            <div className="muted" style={{ fontSize: 12 }}>
              Australian Red Cross Lifeblood
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '12px 0 0' }}>
          EG Eloma is a proud member of Australian Red Cross Lifeblood. If you’d like to join us, give blood with the Eloma Group
          Lifeblood Team.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          <a
            className="btn bp"
            href="https://my.donateblood.com.au/app/myteams_home/Eloma%20Group?orgId=209771"
            target="_blank"
            rel="noopener"
            style={{ width: '100%' }}
          >
            Join the Eloma Group team ↗
          </a>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
          Optional · opens an external website
        </div>
      </section>
    </>
  );

  return (
    <div className="ec-page">
      {/* Hero */}
      <div className="up" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <div className="eyebrow">{[company, tradingAs && `Trading as ${tradingAs}`].filter(Boolean).join(' · ') || 'Customer portal'}</div>
          <h1 className="disp ec-hero-h1">
            {greeting(new Date(now).getHours())}
            {firstName ? `, ${firstName}.` : '.'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/client/invoices" className="btn bg">
            Invoices
          </Link>
          {!suspended && (
            <Link to="/client/tasks" className="btn bp">
              Open tasks
            </Link>
          )}
        </div>
      </div>

      {/* Account summary */}
      <div className="aib up" style={{ animationDelay: '.12s' }}>
        <div className="aib-in" style={{ padding: '22px 24px', display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'center' }}>
          <div className="orb" aria-hidden="true" />
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <span className="eyebrow">Account summary</span>
            <p style={{ margin: '8px 0 0', fontSize: 17, lineHeight: 1.55, color: 'var(--fg)' }}>
              {suspended ? (
                'Your account is suspended — please contact your account manager.'
              ) : !summaryReady ? (
                ' '
              ) : (
                <>
                  {summary.map((s, i, all) => (
                    <span key={i}>
                      {i > 0 && (i === all.length - 1 ? ' and ' : ', ')}
                      {s}
                    </span>
                  ))}
                  .
                  {toSign.length > 0 &&
                    ` ${toSign.length === 1 ? 'That agreement is' : 'Those agreements are'} the only thing waiting on you. Signing ${
                      toSign.length === 1 ? 'it' : 'them'
                    } keeps the work on schedule.`}
                </>
              )}
            </p>
            {!suspended && toSign.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {toSign.map((x) => (
                  <span key={x.id} className="chip c-warn mono" style={{ fontSize: 11 }}>
                    {x.fileName.replace(/\.pdf$/i, '')}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            {toSign.length > 0 ? (
              <Link to="/client/agreement" className="btn bp">
                Review and sign <ArrowRight />
              </Link>
            ) : owes || suspended ? (
              <Link to="/client/invoices" className="btn bp">
                View invoices <ArrowRight />
              </Link>
            ) : (
              <Link to="/client/tasks" className="btn bp">
                Open tasks <ArrowRight />
              </Link>
            )}
            <button type="button" className="btn bg" onClick={() => openAssistant('What needs my attention today?')}>
              Ask a follow-up
            </button>
          </div>
        </div>
      </div>

      {/* Contracts & renewals */}
      {prodQ.isLoading ? (
        <div className="skel" style={{ height: 220 }} />
      ) : (
        ren && (
          <section className="glass card up" style={{ animationDelay: '.22s', padding: '22px 24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <div className="eyebrow">Contracts &amp; renewals</div>
                <div className="disp" style={{ marginTop: 8, fontSize: 26, fontWeight: 700 }}>
                  {ren.count} active{' '}
                  <span className="muted" style={{ fontWeight: 500 }}>
                    ·
                  </span>{' '}
                  next renewal in <span style={{ color: 'var(--brand)' }}>{plural(ren.nextDays, 'day')}</span>
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                  {ren.nextLine}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <span className="chip c-red">{ren.b30} within 30 days</span>
                  <span className="chip c-warn">{ren.b90} in 31–90 days</span>
                  <span className="chip c-ok">{ren.bLater} later</span>
                </div>
              </div>
              <Link to="/client/licences" className="btn bg" style={{ minHeight: 40, fontSize: 13 }}>
                Manage plan →
              </Link>
            </div>
            <div className="gantt" style={{ marginTop: 22 }}>
              <div className="g-axis">
                <div className="eyebrow">Contract</div>
                <div className="g-months">
                  {ren.months.map((mo) => (
                    <span key={mo.left} style={{ left: mo.left }}>
                      {mo.label}
                    </span>
                  ))}
                  <span className="g-todaylbl" style={{ left: ren.today }}>
                    Today
                  </span>
                </div>
                <div className="eyebrow">Renewal</div>
              </div>
              {ren.rows.map((c) => (
                <div key={c.id} className="g-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                    <div className="muted mono" style={{ fontSize: 11, overflowWrap: 'anywhere' }}>
                      {c.key}
                    </div>
                  </div>
                  <div className="g-track">
                    <div className="g-bar" style={{ left: c.left, width: c.width }}>
                      <div className="g-done" style={{ width: c.done }} />
                    </div>
                    <div className="g-today" style={{ left: ren.today }} />
                  </div>
                  <div>
                    <span className={c.cls}>{c.daysLabel}</span>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                      Renews {c.renew} · {c.dayOf}
                    </div>
                  </div>
                </div>
              ))}
              {ren.hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
                  <button type="button" className="btn bg" style={{ minHeight: 38, fontSize: 13 }} onClick={() => setRenAll((v) => !v)}>
                    {ren.more}
                  </button>
                </div>
              )}
            </div>
          </section>
        )
      )}

      {/* Protection + service level */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <section className="glass card up" style={{ animationDelay: '.3s', padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="ico">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </span>
            <div>
              <h2 className="disp" style={{ margin: 0, fontSize: 17 }}>
                Account protection
              </h2>
              <div className="muted" style={{ fontSize: 12 }}>
                ASD Essential Eight aligned
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            {['Last backup', 'Security patches applied', 'Threats blocked this month'].map((k) => (
              <div key={k} className="kvrow">
                <span className="muted">{k}</span>
                <span className="muted">Not connected</span>
              </div>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Shown when EG Eloma manages your cloud, servers or security.
          </div>
        </section>
        <section className="glass card up" style={{ animationDelay: '.36s', padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="ico">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </span>
            <div>
              <h2 className="disp" style={{ margin: 0, fontSize: 17 }}>
                Support you can count on
              </h2>
              <div className="muted" style={{ fontSize: 12 }}>
                24/7 via this portal, email or phone
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 16 }}>
            <div>
              <div className="stat-big" style={{ color: 'var(--brand)' }}>
                &lt;15 min
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Average first response
              </div>
            </div>
            <div>
              <div className="stat-big muted">–</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Your average response
              </div>
            </div>
          </div>
          <div className="kvrow" style={{ marginTop: 14 }}>
            <span className="muted">Support line</span>
            <span>1800 054 555 (Australia)</span>
          </div>
        </section>
      </div>

      {/* Work in flight */}
      {!suspended && (
        <section className="glass up" style={{ animationDelay: '.4s', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '18px 22px', borderBottom: '1px solid rgba(var(--w),.06)' }}>
            <h2 className="disp" style={{ margin: 0, fontSize: 18 }}>
              Work in flight
            </h2>
            <Link to="/client/tasks" className="btn bg" style={{ minHeight: 36, fontSize: 13 }}>
              All {allTasks.length} tasks →
            </Link>
          </div>
          {tasksQ.isLoading ? (
            <div style={{ padding: '18px 22px' }}>
              <div className="skel" style={{ height: 40 }} />
            </div>
          ) : (
            <>
              <div style={{ padding: '18px 22px 8px' }}>
                <div style={{ display: 'flex', gap: 4, height: 10 }}>
                  {flightTotal === 0 ? (
                    <div style={{ flex: 1, borderRadius: 6, background: 'rgba(var(--w),.12)' }} />
                  ) : (
                    [
                      { n: tOngoing, c: 'var(--on)' },
                      { n: tNotStarted, c: 'rgba(var(--w),.12)' },
                      { n: tCompleted, c: '#1FC88A' },
                    ]
                      .filter((s) => s.n > 0)
                      .map((s) => <div key={s.c} style={{ flex: s.n, borderRadius: 6, background: s.c }} />)
                  )}
                </div>
                <div className="muted" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
                  <span>
                    <span className="dot" style={{ color: 'var(--on)' }} /> {tOngoing} ongoing
                  </span>
                  <span>
                    <span className="dot" style={{ color: '#6B7A90' }} /> {tNotStarted} not started
                  </span>
                  <span>
                    <span className="dot" style={{ color: '#1FC88A' }} /> {tCompleted} completed
                  </span>
                </div>
              </div>
              {openTasks.length === 0 ? (
                <div className="muted" style={{ padding: '14px 22px', borderTop: '1px solid rgba(var(--w),.05)', fontSize: 13 }}>
                  No open tasks — you’re all caught up.
                </div>
              ) : (
                <div className="stag">
                  {openTasks.map((t) => (
                    <Link
                      key={t.id}
                      to="/client/tasks"
                      className="row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '14px 22px',
                        borderTop: '1px solid rgba(var(--w),.05)',
                        color: 'var(--fg)',
                        textDecoration: 'none',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{t.title}</div>
                        <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6, fontSize: 12 }}>
                          <span className="chip c-ns" style={{ padding: '2px 8px', fontSize: 11 }}>
                            {t.bucketName}
                          </span>
                          <span>{t.dueDate ? `Due ${formatDate(t.dueDate)}` : `${isOngoing(t.progress) ? 'Ongoing' : 'Not started'} · no due date`}</span>
                        </div>
                      </div>
                      {isOngoing(t.progress) ? (
                        <span className="chip c-on">
                          <span className="dot" />
                          Ongoing
                        </span>
                      ) : (
                        <span className="chip c-ns">
                          <span className="dot" />
                          Not started
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Recent activity */}
      <section className="glass up" style={{ animationDelay: '.5s', padding: '18px 22px 10px' }}>
        <h2 className="disp" style={{ margin: '0 0 14px', fontSize: 18 }}>
          Recent activity
        </h2>
        {activityLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skel" style={{ height: 40 }} />
            ))}
          </div>
        ) : recentActivity.length === 0 ? (
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
            Recent account activity will appear here.
          </p>
        ) : (
          <div className="stag">
            {recentActivity.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      border: `2px solid ${a.color}`,
                      marginTop: 4,
                      boxShadow: `0 0 10px ${a.color}`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, width: 1, background: 'rgba(var(--w),.08)', margin: '4px 0' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 16, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{a.title}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {a.sub}
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {activityWhen(a.at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {asideEl && createPortal(aside, asideEl)}
    </div>
  );
}
