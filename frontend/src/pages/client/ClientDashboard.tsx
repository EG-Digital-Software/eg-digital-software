import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  ListChecks,
  MessageSquare,
  PenLine,
  Phone,
  Receipt,
  Sparkles,
  Ticket,
  TriangleAlert,
} from 'lucide-react';
import { clientApi, type ClientProduct } from '@/api/client-portal';
import { CLIENT_TASK_SUMMARY_KEY } from '@/lib/taskSeen';
import { useAuth } from '@/store/auth';
import { formatCurrency, formatDate, mediaUrl } from '@/lib/utils';
import { discountedPrice } from '@/lib/proration';
import { LIVE_INVOICE_QUERY } from '@/lib/queryClient';
import { brand } from '@/config/brand';
import { ElCard, ElPill, ElSkel } from '@/components/client/eloma';
import { needsSignature } from '@/lib/agreements';

/* ---- Data presentation helpers (read-only) ------------------------------- */

// Account status → health score shown in the KPI strip.
const ACCOUNT_HEALTH: Record<string, { pct: number; label: string }> = {
  ACTIVE: { pct: 98, label: 'Excellent standing' },
  ACTIVE_TRIAL: { pct: 90, label: 'Trial account' },
  DORMANT: { pct: 68, label: 'Fair standing' },
  SUSPENDED: { pct: 34, label: 'Needs attention' },
};

const DAY = 86_400_000;

const isOngoing = (p: string) => p === 'IN_PROGRESS' || p === 'ONGOING';

/** Net value of one licence = discounted agreed price × units. */
const productNet = (p: ClientProduct) => discountedPrice(p) * (p.unitHoursEnabled ? Number(p.unitHours) || 0 : 1);

interface ActivityItem {
  id: string;
  title: string;
  sub: string;
  at: number; // epoch ms — for sorting
  done?: boolean;
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

/** Month ticks between two dates, as fractions of the span. */
function monthTicks(start: number, end: number) {
  const out: { at: number; label: string }[] = [];
  const d = new Date(start);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  while (d.getTime() < end && out.length < 24) {
    const m = d.toLocaleDateString([], { month: 'short' });
    out.push({
      at: (d.getTime() - start) / (end - start),
      label: d.getMonth() === 0 ? `${m} ’${String(d.getFullYear()).slice(2)}` : m,
    });
    d.setMonth(d.getMonth() + 1);
  }
  // Keep the axis readable on long terms.
  const step = Math.ceil(out.length / 12);
  return out.filter((_, i) => i % step === 0);
}

/* ---- Page ---------------------------------------------------------------- */

export default function ClientDashboard() {
  const user = useAuth((s) => s.user);
  // Captured once per mount so renders stay pure.
  const [now] = useState(() => Date.now());
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
  const health = (acctStatus && ACCOUNT_HEALTH[acctStatus]) ?? ACCOUNT_HEALTH.ACTIVE;
  const company = profile?.companyName?.trim();
  const firstName = user?.firstName?.trim();

  const allTasks = tasksQ.data ?? [];
  const tOngoing = allTasks.filter((t) => isOngoing(t.progress)).length;
  const tNotStarted = allTasks.filter((t) => t.progress === 'NOT_STARTED').length;
  const tCompleted = allTasks.filter((t) => t.progress === 'COMPLETED').length;
  const openTasks = allTasks
    .filter((t) => t.progress !== 'COMPLETED')
    .sort((a, b) => Number(isOngoing(b.progress)) - Number(isOngoing(a.progress)) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, 4);

  const toSign = (profile?.documents ?? []).filter(needsSignature);

  // Service term — from the earliest issue to the latest expiry of approved licences.
  const products = prodQ.data ?? [];
  const approved = products.filter((p) => !p.pending);
  const dated = approved.filter((p) => p.expiryDate);
  const termStart = dated.length ? Math.min(...dated.map((p) => new Date(p.issueDate).getTime())) : null;
  const termEnd = dated.length ? Math.max(...dated.map((p) => new Date(p.expiryDate!).getTime())) : null;
  const term =
    termStart != null && termEnd != null && termEnd > termStart
      ? {
          day: Math.max(1, Math.min(Math.ceil((termEnd - termStart) / DAY), Math.floor((now - termStart) / DAY) + 1)),
          total: Math.ceil((termEnd - termStart) / DAY),
          pct: Math.max(0, Math.min(1, (now - termStart) / (termEnd - termStart))),
          ticks: monthTicks(termStart, termEnd),
        }
      : null;
  const upcoming = dated
    .filter((p) => new Date(p.expiryDate!).getTime() >= now)
    .sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!));
  const next = upcoming[0];
  const nextDays = next ? Math.max(0, Math.ceil((new Date(next.expiryDate!).getTime() - now) / DAY)) : null;

  const contracted = approved.reduce((s, p) => s + productNet(p), 0);
  const termDays = profile?.invoicingTerm?.match(/\d+/)?.[0];

  // Headline summary.
  const owes = d ? d.outstanding.amount > 0 : false;
  const summary: ReactNode[] = [];
  if (toSign.length) summary.push(<><b>{plural(toSign.length, 'agreement')}</b> {toSign.length === 1 ? 'needs' : 'need'} your signature</>);
  if (tOngoing) summary.push(<><b>{plural(tOngoing, 'task')}</b> {tOngoing === 1 ? 'is' : 'are'} in progress</>);

  // Recent Activity — derived read-only from data already loaded on this page
  // (invoices, products/licences, tasks). No new API, no data mutation.
  const activityLoading = invQ.isLoading || prodQ.isLoading || tasksQ.isLoading;
  const activity: ActivityItem[] = [];
  for (const inv of invQ.data?.items ?? []) {
    if (inv.status === 'PAID' || Number(inv.amountPaid) > 0) {
      activity.push({ id: `pay-${inv.id}`, title: 'Payment received', sub: inv.invoiceNumber, at: new Date(inv.createdAt).getTime(), done: true });
    }
    activity.push({ id: `inv-${inv.id}`, title: 'Invoice generated', sub: inv.invoiceNumber, at: new Date(inv.createdAt).getTime() });
  }
  for (const p of products) {
    if (!p.issueDate) continue;
    activity.push({
      id: `lic-${p.id}`,
      title: p.pending ? 'Product requested' : 'Licence activated',
      sub: p.product,
      at: new Date(p.issueDate).getTime(),
      done: !p.pending,
    });
  }
  for (const t of allTasks) {
    const done = t.progress === 'COMPLETED';
    activity.push({
      id: `task-${t.id}`,
      title: done ? 'Task completed' : 'Task updated',
      sub: `${t.title} · ${t.bucketName}`,
      at: new Date(t.completedAt ?? t.updatedAt ?? t.createdAt).getTime(),
      done,
    });
  }
  activity.sort((a, b) => b.at - a.at);
  const recentActivity = activity.slice(0, 6);

  const ringC = 2 * Math.PI * 22;

  return (
    <>
      {/* Greeting */}
      <section className="el-hello">
        <div>
          <span className="el-eyebrow">
            {[company, profile?.tradingAs?.trim() && `Trading as ${profile.tradingAs.trim()}`].filter(Boolean).join(' · ') ||
              'Customer portal'}
          </span>
          <h1 className="el-h1">
            {greeting(new Date(now).getHours())}
            {firstName ? `, ${firstName}` : ''}.
          </h1>
          <p className="sub">
            {suspended ? (
              'Your account is suspended — please contact your account manager.'
            ) : !d || tasksQ.isLoading || profileQ.isLoading ? (
              ' '
            ) : (
              summary.length === 0 && !owes ? (
                'Everything’s running smoothly — nothing is owed.'
              ) : (
                <>
                  {[
                    ...summary,
                    owes ? (
                      <>
                        <b>{formatCurrency(d.outstanding.amount)}</b> is outstanding
                      </>
                    ) : (
                      'nothing is owed'
                    ),
                  ].map((s, i, all) => (
                    <span key={i}>
                      {i > 0 && (i === all.length - 1 ? ' and ' : ', ')}
                      {s}
                    </span>
                  ))}
                  .
                </>
              )
            )}
          </p>
        </div>
        <div className="actions">
          <Link to="/client/invoices" className="el-btn">
            <Receipt /> Invoices
          </Link>
          {!suspended && (
            <Link to="/client/tasks" className="el-btn primary">
              <ListChecks /> Open tasks
            </Link>
          )}
        </div>
      </section>

      {/* Attention */}
      {toSign.length > 0 ? (
        <div className="el-alert" role="status">
          <span className="ic">
            <PenLine />
          </span>
          <div className="t">
            <strong>
              {toSign.length === 1 ? '1 agreement is' : `${toSign.length} agreements are`} waiting for your signature
            </strong>
            <span className="block truncate">
              {toSign.map((x) => x.fileName.replace(/\.pdf$/i, '')).join(', ')}. Signing keeps the work on schedule.
            </span>
          </div>
          <Link to="/client/agreement" className="el-btn sm primary">
            Review and sign
          </Link>
        </div>
      ) : d && d.overdue.count > 0 ? (
        <div className="el-alert bad" role="status">
          <span className="ic">
            <TriangleAlert />
          </span>
          <div className="t">
            <strong>
              {d.overdue.count === 1 ? '1 invoice is' : `${d.overdue.count} invoices are`} past due
            </strong>
            <span>{formatCurrency(d.overdue.amount)} is overdue. Please settle it to keep your services running.</span>
          </div>
          <Link to="/client/invoices" className="el-btn sm primary">
            View invoices
          </Link>
        </div>
      ) : null}

      {/* Service term track */}
      {prodQ.isLoading ? (
        <ElSkel className="h-[180px]" />
      ) : (
        term && (
          <section className="el-card el-track">
            <div className="el-track-top">
              <div className="grow">
                <span className="el-eyebrow">Service term</span>
                <div className="big">
                  Day {term.day}
                  <small>of {term.total}</small>
                </div>
              </div>
              {next && nextDays != null && (
                <div className="fact">
                  <span className="el-eyebrow">Renews</span>
                  <b>
                    {formatDate(next.expiryDate)} · {plural(nextDays, 'day')}
                  </b>
                </div>
              )}
              <div className="fact">
                <span className="el-eyebrow">Licences</span>
                <b>{d ? `${d.licences.active} active` : '—'}</b>
              </div>
            </div>
            <div className="el-flight" aria-label={`Day ${term.day} of ${term.total} of your service term`}>
              <div className="rule" />
              <div className="done" style={{ width: `${term.pct * 100}%` }} />
              <span className="start" />
              <span className="end" />
              {term.ticks.map((t) => (
                <span key={t.label + t.at} className="tick" style={{ left: `${t.at * 100}%` }}>
                  {t.label}
                </span>
              ))}
              <span className="now" style={{ left: `${term.pct * 100}%` }} />
              <span className="bird" style={{ left: `${term.pct * 100}%` }}>
                <img src={brand.icon} alt="" className="on-light" />
                <img src={brand.iconLight} alt="" className="on-dark" />
              </span>
            </div>
          </section>
        )
      )}

      {/* KPIs */}
      <div className="el-kpis">
        <div className="el-kpi">
          <span className="el-eyebrow">Account health</span>
          <div className="el-ring">
            <svg viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="22" fill="none" stroke="var(--sunk)" strokeWidth="5" />
              <circle
                cx="26"
                cy="26"
                r="22"
                fill="none"
                stroke={suspended ? 'var(--bad)' : 'var(--nectar)'}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${(ringC * health.pct) / 100} ${ringC}`}
                transform="rotate(-90 26 26)"
              />
            </svg>
            <div>
              <div className="v">
                {health.pct}
                <small>%</small>
              </div>
              <span className="s">{health.label}</span>
            </div>
          </div>
        </div>
        <Link to="/client/licences" className="el-kpi">
          <span className="el-eyebrow">Contracted value</span>
          {prodQ.isLoading ? <ElSkel className="h-9 w-32" /> : <span className="v">{formatCurrency(contracted)}</span>}
          <span className="s">{plural(approved.length, 'licence')} · agreed net price</span>
        </Link>
        <Link to="/client/invoices" className="el-kpi">
          <span className="el-eyebrow">Outstanding</span>
          {!d ? (
            <ElSkel className="h-9 w-28" />
          ) : (
            <span className={d.overdue.count > 0 ? 'v bad' : 'v'}>{formatCurrency(d.outstanding.amount)}</span>
          )}
          <span className="s">
            {d
              ? `${d.outstanding.count} unpaid · ${d.overdue.count > 0 ? `${d.overdue.count} overdue` : 'nothing overdue'}`
              : ' '}
          </span>
        </Link>
        <div className="el-kpi">
          <span className="el-eyebrow">Invoicing terms</span>
          {profileQ.isLoading ? (
            <ElSkel className="h-9 w-20" />
          ) : termDays ? (
            <span className="v">
              {termDays}
              <small>days</small>
            </span>
          ) : (
            <span className="v">{profile?.invoicingTerm?.trim() || '—'}</span>
          )}
          <span className="s">
            {d ? (d.invoices ? `${plural(d.invoices, 'invoice')} issued` : 'No invoices issued yet') : ' '}
          </span>
        </div>
      </div>

      <div className="el-grid-2">
        <div className="el-col">
          {/* Work in flight */}
          {!suspended && (
            <ElCard
              title="Work in flight"
              action={
                <Link to="/client/tasks" className="el-link">
                  All {allTasks.length} tasks <ArrowRight />
                </Link>
              }
            >
              <div className="el-card-b">
                {tasksQ.isLoading ? (
                  <ElSkel className="h-10" />
                ) : (
                  <>
                    <div className="el-stackbar" aria-hidden="true">
                      {[
                        { n: tOngoing, c: 'var(--info)' },
                        { n: tNotStarted, c: 'var(--line-2)' },
                        { n: tCompleted, c: 'var(--nectar)' },
                      ]
                        .filter((s) => s.n > 0)
                        .map((s) => (
                          <span key={s.c} style={{ flex: s.n, background: s.c }} />
                        ))}
                    </div>
                    <div className="el-legend">
                      <span>
                        <i style={{ background: 'var(--info)' }} />
                        {tOngoing} ongoing
                      </span>
                      <span>
                        <i style={{ background: 'var(--line-2)' }} />
                        {tNotStarted} not started
                      </span>
                      <span>
                        <i style={{ background: 'var(--nectar)' }} />
                        {tCompleted} completed
                      </span>
                    </div>
                  </>
                )}
              </div>
              {!tasksQ.isLoading &&
                (openTasks.length === 0 ? (
                  <p className="el-muted border-t border-[var(--line)] px-5 py-4 text-[13px]">
                    No open tasks — you’re all caught up.
                  </p>
                ) : (
                  <ul className="el-tlist">
                    {openTasks.map((t) => (
                      <li key={t.id}>
                        <Link to="/client/tasks">
                          <div className="min-w-0">
                            <div className="nm truncate">{t.title}</div>
                            <div className="meta">
                              <span className="el-tag">{t.bucketName}</span>
                              {t.dueDate && <span>Due {formatDate(t.dueDate)}</span>}
                            </div>
                          </div>
                          {isOngoing(t.progress) ? (
                            <ElPill tone="info">Ongoing</ElPill>
                          ) : (
                            <ElPill tone="idle">Not started</ElPill>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ))}
            </ElCard>
          )}

          {/* Recent activity */}
          <ElCard title="Recent activity">
            {activityLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <ElSkel key={i} className="h-10" />
                ))}
              </div>
            ) : recentActivity.length === 0 ? (
              <p className="el-muted px-5 py-4 text-[13px]">Recent account activity will appear here.</p>
            ) : (
              <ul className="el-feed">
                {recentActivity.map((a) => (
                  <li key={a.id}>
                    <span className={a.done ? 'pt g' : 'pt'} />
                    <div className="min-w-0">
                      <b>{a.title}</b>
                      <p className="truncate">{a.sub}</p>
                    </div>
                    <time>{activityWhen(a.at)}</time>
                  </li>
                ))}
              </ul>
            )}
          </ElCard>
        </div>

        <div className="el-col">
          {/* Account manager */}
          {manager && (
            <ElCard title="Your account manager">
              <div className="el-card-b">
                <div className="el-mgr">
                  <span className="el-av">
                    {manager.avatarUrl ? (
                      <img src={mediaUrl(manager.avatarUrl)} alt="" />
                    ) : (
                      (manager.firstName?.[0] ?? '?').toUpperCase()
                    )}
                  </span>
                  <div className="lines">
                    <b>
                      {manager.firstName} {manager.lastName}
                    </b>
                    <span>{manager.email}</span>
                    {manager.phone && <span className="el-mono">{manager.phone}</span>}
                  </div>
                </div>
                <div className="el-mgr-actions">
                  <a href={`mailto:${manager.email}`} className="el-btn primary">
                    <MessageSquare /> Message
                  </a>
                  {manager.phone ? (
                    <a href={`tel:${manager.phone.replace(/\s+/g, '')}`} className="el-btn">
                      <Phone /> Call
                    </a>
                  ) : (
                    <span />
                  )}
                </div>
              </div>
            </ElCard>
          )}

          {/* Support */}
          <ElCard title="Support" action={<ElPill tone="ok">Online 24/7</ElPill>}>
            <div className="el-card-b el-help">
              <a href="mailto:help@egdigital.com.au?subject=Support%20request">
                <Ticket />
                <span>
                  Create a ticket
                  <small>Our team is here around the clock</small>
                </span>
                <ArrowRight />
              </a>
              <a href="mailto:support@egdigital.com.au?subject=Knowledge%20base%20enquiry">
                <BookOpen />
                <span>
                  Knowledge base
                  <small>Guides for your products and services</small>
                </span>
                <ArrowRight />
              </a>
              <Link to="/client/licences">
                <Sparkles />
                <span>
                  Recommendations
                  <small>Ways to grow{company ? ` ${company}` : ' your business'}</small>
                </span>
                <ArrowRight />
              </Link>
            </div>
          </ElCard>
        </div>
      </div>
    </>
  );
}
