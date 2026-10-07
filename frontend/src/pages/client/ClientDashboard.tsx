import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { clientApi, type ClientProduct } from '@/api/client-portal';
import { CLIENT_TASK_SUMMARY_KEY } from '@/lib/taskSeen';
import { useAuth } from '@/store/auth';
import { Skeleton } from '@/components/ui/misc';
import { InvoiceBadge } from '@/components/shared/status';
import { formatCurrency, formatDate, cn, mediaUrl } from '@/lib/utils';
import type { LicenceStatus } from '@/types';
import { ProductGlyph } from '@/lib/product-icon';
import { Panel, ViewAll, GraphiteHero } from '@/components/layout/graphite';
import { panel, eyebrow, btnLight, btnDark, viewAll } from '@/lib/graphite';

/* ---- Data presentation helpers (read-only) ------------------------------- */

// Account status → health score shown in the hero.
const ACCOUNT_HEALTH: Record<string, { pct: number; label: string }> = {
  ACTIVE: { pct: 98, label: 'Excellent' },
  ACTIVE_TRIAL: { pct: 90, label: 'Trial' },
  DORMANT: { pct: 68, label: 'Fair' },
  SUSPENDED: { pct: 34, label: 'At risk' },
};

const LICENCE_DOT: Record<LicenceStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: '#7CE3A6' },
  EXPIRING_SOON: { label: 'Expiring soon', color: '#FCD34D' },
  CRITICAL: { label: 'Critical', color: '#FDA4AF' },
  EXPIRED: { label: 'Expired', color: '#FDA4AF' },
  SUSPENDED: { label: 'Suspended', color: '#FDA4AF' },
};

const DAY = 86_400_000;

/** Share of the licence term still left, 0–100 (null when open-ended). */
function termRemaining(p: ClientProduct, now: number): number | null {
  if (!p.expiryDate) return null;
  const start = new Date(p.issueDate).getTime();
  const end = new Date(p.expiryDate).getTime();
  if (!(end > start)) return 0;
  const pct = ((end - now) / (end - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

interface ActivityItem {
  id: string;
  title: string;
  sub: string;
  at: number; // epoch ms — for sorting
}

function activityWhen(at: number): string {
  const dt = new Date(at);
  const day = dt.toLocaleDateString([], { day: '2-digit', month: 'short' });
  const time = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

/* ---- Page ---------------------------------------------------------------- */

export default function ClientDashboard() {
  const user = useAuth((s) => s.user);
  // Captured once per mount so renders stay pure.
  const [now] = useState(() => Date.now());
  const dashQ = useQuery({ queryKey: ['client', 'dashboard'], queryFn: clientApi.dashboard });
  const tasksQ = useQuery({ queryKey: CLIENT_TASK_SUMMARY_KEY, queryFn: clientApi.taskSummary });
  const invQ = useQuery({
    queryKey: ['client', 'invoices', 'recent'],
    queryFn: () => clientApi.invoices({ pageSize: 5 }),
  });
  const prodQ = useQuery({ queryKey: ['client', 'products'], queryFn: clientApi.products });
  const profileQ = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });

  const allTasks = tasksQ.data ?? [];
  const activeTasks = allTasks.filter((t) => t.progress !== 'COMPLETED').length;
  const tInProgress = allTasks.filter((t) => t.progress === 'IN_PROGRESS' || t.progress === 'ONGOING').length;
  const tPending = allTasks.filter((t) => t.progress === 'NOT_STARTED').length;
  const tCompleted = allTasks.filter((t) => t.progress === 'COMPLETED').length;
  const upcomingTasks = allTasks
    .filter((t) => t.progress !== 'COMPLETED')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, 4);

  const d = dashQ.data;
  const profile = profileQ.data;
  const manager = profile?.accountManager ?? null;
  const acctStatus = profile?.accountStatusEffective ?? profile?.accountStatus;
  const health = (acctStatus && ACCOUNT_HEALTH[acctStatus]) ?? ACCOUNT_HEALTH.ACTIVE;
  const company = profile?.companyName?.trim();
  const firstName = user?.firstName?.trim();

  const headline =
    acctStatus === 'SUSPENDED'
      ? 'Your account needs attention.'
      : d && d.overdue.count > 0
        ? `${d.overdue.count} invoice${d.overdue.count === 1 ? ' is' : 's are'} past due.`
        : 'Everything’s running smoothly.';

  // Next renewal — the soonest upcoming expiry among approved products.
  const products = prodQ.data ?? [];
  const upcoming = products
    .filter((p) => !p.pending && p.expiryDate && new Date(p.expiryDate).getTime() >= now)
    .sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!));
  const next = upcoming[0];
  const nextDays = next ? Math.max(0, Math.ceil((new Date(next.expiryDate!).getTime() - now) / DAY)) : null;
  const sameDay = next && upcoming.every((p) => formatDate(p.expiryDate) === formatDate(next.expiryDate));

  // Recent Activity — derived read-only from data already loaded on this page
  // (invoices, products/licences, tasks). No new API, no data mutation.
  const activityLoading = invQ.isLoading || prodQ.isLoading || tasksQ.isLoading;
  const activity: ActivityItem[] = [];
  for (const inv of invQ.data?.items ?? []) {
    if (inv.status === 'PAID' || Number(inv.amountPaid) > 0) {
      activity.push({
        id: `pay-${inv.id}`,
        title: 'Payment received',
        sub: inv.invoiceNumber,
        at: new Date(inv.createdAt).getTime(),
      });
    }
    activity.push({
      id: `inv-${inv.id}`,
      title: 'Invoice generated',
      sub: inv.invoiceNumber,
      at: new Date(inv.createdAt).getTime(),
    });
  }
  for (const p of products) {
    if (!p.issueDate) continue;
    activity.push({
      id: `lic-${p.id}`,
      title: p.pending ? 'Product requested' : 'Licence activated',
      sub: p.product,
      at: new Date(p.issueDate).getTime(),
    });
  }
  for (const t of allTasks) {
    activity.push({
      id: `task-${t.id}`,
      title: t.progress === 'COMPLETED' ? 'Task completed' : 'Task updated',
      sub: `${t.title} – ${t.bucketName}`,
      at: new Date(t.completedAt ?? t.updatedAt ?? t.createdAt).getTime(),
    });
  }
  activity.sort((a, b) => b.at - a.at);
  const recentActivity = activity.slice(0, 6);

  return (
    <div className="-mt-4">
      <GraphiteHero
        kicker={`Customer Portal${company ? ` · ${company}` : ''}`}
        title={
          <>
            Welcome back{firstName ? `, ${firstName}` : ''}.
            <br />
            {headline}
          </>
        }
        subtitle="Here’s an overview of your invoices, products and account."
        stats={[
          { label: 'Account health', value: `${health.pct}%`, sub: health.label, strong: true },
          { label: 'Active products', value: d ? String(d.products) : null, sub: 'Assigned to you' },
          { label: 'Active tasks', value: tasksQ.isLoading ? null : String(activeTasks), sub: 'In progress or pending' },
        ]}
        actions={
          <>
            <Link to="/client/invoices" className={btnLight}>
              View invoices
            </Link>
            <Link to="/client/licences" className={btnDark}>
              Explore products
            </Link>
          </>
        }
      />

      <div className="relative flex flex-col gap-[18px]">
        {/* KPI strip */}
        <div className={cn(panel, 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4')}>
          {[
            {
              label: 'Total paid',
              value: d && formatCurrency(d.totalPaid),
              sub: d && `${d.invoices} invoice${d.invoices === 1 ? '' : 's'} total`,
              to: '/client/invoices',
            },
            {
              label: 'Outstanding',
              value: d && formatCurrency(d.outstanding.amount),
              sub: d && `${d.outstanding.count} unpaid`,
              to: '/client/invoices',
            },
            {
              label: 'Overdue',
              value: d && formatCurrency(d.overdue.amount),
              sub: d && (d.overdue.count > 0 ? `${d.overdue.count} past due` : 'Nothing past due'),
              to: '/client/invoices',
              alert: !!d && d.overdue.count > 0,
            },
            {
              label: 'Next renewal',
              value: prodQ.isLoading ? null : nextDays === null ? '—' : `${nextDays} day${nextDays === 1 ? '' : 's'}`,
              sub: next
                ? `${sameDay && upcoming.length > 1 ? 'All services' : next.product} · ${formatDate(next.expiryDate)}`
                : 'No upcoming renewals',
              to: '/client/licences',
            },
          ].map((k, i) => (
            <Link
              key={k.label}
              to={k.to}
              className={cn(
                'flex flex-col gap-1.5 border-white/[0.08] px-[22px] py-5 text-[#F5F6F8] transition-colors hover:bg-white/[0.03] hover:text-[#F5F6F8]',
                i < 3 && 'border-b lg:border-b-0 lg:border-r',
                i === 1 && 'sm:border-r-0 lg:border-r',
                i === 0 && 'sm:border-r'
              )}
            >
              <span className={eyebrow}>{k.label}</span>
              {k.value == null ? (
                <Skeleton className="h-10 w-28 bg-white/10" />
              ) : (
                <span className={cn('text-[34px] font-semibold tabular-nums', k.alert && 'text-[#FDA4AF]')}>
                  {k.value}
                </span>
              )}
              <span className="text-[13px] text-[#A3AABB]">{k.sub ?? ' '}</span>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-[18px]">
          {/* Product status */}
          <Panel title="Product status" action={<ViewAll to="/client/licences" />} className="flex-[2_1_580px]">
            {prodQ.isLoading ? (
              <div className="space-y-2 p-[22px]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full bg-white/[0.06]" />
                ))}
              </div>
            ) : !products.length ? (
              <p className="px-[22px] py-8 text-[15px] text-[#A3AABB]">No products yet — your licences will appear here.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[15px]">
                  <thead>
                    <tr className="text-left">
                      <th className={cn(eyebrow, 'px-[22px] py-3')}>Product</th>
                      <th className={cn(eyebrow, 'p-3')}>Status</th>
                      <th className={cn(eyebrow, 'p-3')}>Expires</th>
                      <th className={cn(eyebrow, 'px-[22px] py-3 text-right')}>Term remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, 6).map((p) => {
                      const st = p.pending
                        ? { label: 'Pending approval', color: '#A3AABB' }
                        : (LICENCE_DOT[p.status] ?? LICENCE_DOT.ACTIVE);
                      const pct = termRemaining(p, now);
                      return (
                        <tr key={p.id} className="border-t border-white/[0.06]">
                          <td className="px-[22px] py-3.5 font-semibold">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/20">
                                <ProductGlyph parts={[p.product]} className="h-5 w-5" />
                              </span>
                              {p.product}
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="inline-flex items-center gap-2 text-sm">
                              <span
                                className="h-[7px] w-[7px] rounded-full"
                                style={{ background: st.color, boxShadow: `0 0 8px ${st.color}cc` }}
                              />
                              {st.label}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-[#A3AABB]">{p.expiryDate ? formatDate(p.expiryDate) : '—'}</td>
                          <td className="px-[22px] py-3.5">
                            {pct === null ? (
                              <span className="block text-right text-[13px] text-[#C9CEDA]">Ongoing</span>
                            ) : (
                              <div className="flex items-center justify-end gap-2.5">
                                <div className="h-[3px] w-[90px] bg-white/[0.12]">
                                  <div className="h-full bg-white" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-[34px] text-right text-[13px] tabular-nums text-[#C9CEDA]">{pct}%</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-[18px]">
            {/* Account manager */}
            {manager && (
              <Panel
                title="Account manager"
                action={
                  <a href={`mailto:${manager.email}`} className={viewAll}>
                    Contact <span aria-hidden="true">→</span>
                  </a>
                }
              >
                <div className="flex flex-col gap-4 p-[22px]">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/50 text-[21px] font-semibold">
                      {manager.avatarUrl ? (
                        <img src={mediaUrl(manager.avatarUrl)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (manager.firstName?.[0] ?? '?').toUpperCase()
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[21px] font-semibold">
                        {manager.firstName} {manager.lastName}
                      </span>
                      <span className="truncate text-[13px] text-[#A3AABB]">{manager.email}</span>
                      {manager.phone && <span className="text-[13px] text-[#A3AABB]">{manager.phone}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <a href={`mailto:${manager.email}`} className={cn(btnLight, 'h-11 flex-1 px-3 text-xs')}>
                      Message
                    </a>
                    {manager.phone && (
                      <a
                        href={`tel:${manager.phone.replace(/\s+/g, '')}`}
                        className={cn(btnDark, 'h-11 flex-1 px-3 text-xs')}
                      >
                        Call
                      </a>
                    )}
                  </div>
                </div>
              </Panel>
            )}

            {/* Recent invoices */}
            {invQ.isLoading ? (
              <div className={cn(panel, 'p-[22px]')}>
                <Skeleton className="h-12 w-full bg-white/[0.06]" />
              </div>
            ) : !invQ.data?.items.length ? (
              <section className={cn(panel, 'flex items-center gap-3.5 px-[22px] py-5')}>
                <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center border border-white/20 text-[#C9CEDA]">
                  <FileText className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <div className="flex flex-col">
                  <span className={eyebrow}>Recent invoices</span>
                  <span className="text-base font-semibold">No invoices yet</span>
                  <span className="text-[13px] text-[#A3AABB]">They’ll appear here once issued.</span>
                </div>
              </section>
            ) : (
              <Panel title="Recent invoices" action={<ViewAll to="/client/invoices" />}>
                <ul className="px-[22px] py-2">
                  {invQ.data.items.map((inv) => (
                    <li key={inv.id} className="border-b border-white/[0.06] last:border-0">
                      <Link
                        to={`/client/invoices/${inv.id}`}
                        className="flex items-center gap-3 py-3 text-[#F5F6F8] hover:text-white"
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[15px] font-semibold">{inv.invoiceNumber}</span>
                          <span className="text-[13px] text-[#A3AABB]">Due {formatDate(inv.dueDate)}</span>
                        </div>
                        <span className="text-sm tabular-nums">{formatCurrency(inv.total)}</span>
                        <InvoiceBadge status={inv.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-[18px]">
          {/* Tasks */}
          <Panel title="Tasks" action={<ViewAll to="/client/tasks" />} className="flex-[1_1_340px]">
            <div className="flex flex-col gap-3 px-[22px] py-[18px]">
              <div className="grid grid-cols-3 gap-px bg-white/10">
                {[
                  { n: tInProgress, label: 'In progress' },
                  { n: tPending, label: 'Pending' },
                  { n: tCompleted, label: 'Completed', dim: true },
                ].map((c) => (
                  <div key={c.label} className="flex flex-col bg-[#0D111C] px-3.5 py-3">
                    <span className={cn('text-[28px] font-semibold tabular-nums', c.dim && 'text-[#A3AABB]')}>
                      {tasksQ.isLoading ? '–' : c.n}
                    </span>
                    <span className={cn(eyebrow, 'truncate')}>{c.label}</span>
                  </div>
                ))}
              </div>
              {tasksQ.isLoading ? (
                <Skeleton className="h-24 w-full bg-white/[0.06]" />
              ) : upcomingTasks.length === 0 ? (
                <p className="py-2 text-[13px] text-[#A3AABB]">No open tasks — you’re all caught up.</p>
              ) : (
                upcomingTasks.map((t) => {
                  const inProgress = t.progress === 'IN_PROGRESS' || t.progress === 'ONGOING';
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 border-t border-white/[0.06] py-2.5">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] font-semibold">{t.title}</span>
                        <span className="truncate text-[13px] text-[#A3AABB]">
                          {t.bucketName}
                          {t.dueDate ? ` · Due ${formatDate(t.dueDate)}` : ''}
                        </span>
                      </div>
                      {inProgress ? (
                        <span className="whitespace-nowrap bg-white px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-[#070A12]">
                          IN PROGRESS
                        </span>
                      ) : (
                        <span className="whitespace-nowrap border border-white/45 px-2 py-[3px] text-[10px] font-bold tracking-[0.12em] text-white">
                          PENDING
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Panel>

          {/* Recent activity */}
          <Panel title="Recent activity" className="flex-[1_1_340px]">
            <div className="px-[22px] pb-4 pt-2">
              {activityLoading ? (
                <div className="space-y-2 pt-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full bg-white/[0.06]" />
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <p className="py-4 text-[13px] text-[#A3AABB]">Recent account activity will appear here.</p>
              ) : (
                recentActivity.map((a) => (
                  <div key={a.id} className="flex gap-3.5 border-b border-white/[0.06] py-[11px] last:border-0">
                    <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full border border-[#E2E8F0]" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-semibold">{a.title}</span>
                      <span className="truncate text-[13px] text-[#A3AABB]">{a.sub}</span>
                    </div>
                    <span className="whitespace-nowrap text-xs text-[#A3AABB]">{activityWhen(a.at)}</span>
                  </div>
                ))
              )}
            </div>
          </Panel>

          {/* Support */}
          <section className={cn(panel, 'flex flex-[1_1_300px] flex-col gap-2.5 p-[26px]')}>
            <span className={eyebrow}>Support · 24/7</span>
            <span className="text-[30px] font-semibold leading-[1.1]">Need help or ready to upgrade?</span>
            <span className="text-[15px] text-[#A3AABB]">
              Our team is here around the clock, and we can recommend solutions to grow your business.
            </span>
            <div className="mt-auto flex flex-col gap-2 pt-3">
              <a href="mailto:help@egdigital.com.au?subject=Support%20request" className={cn(btnLight, 'h-11 text-xs')}>
                Create a ticket
              </a>
              <a
                href="mailto:support@egdigital.com.au?subject=Knowledge%20base%20enquiry"
                className={cn(btnDark, 'h-11 text-xs')}
              >
                Knowledge base
              </a>
              <Link
                to="/client/licences"
                className="inline-flex h-11 items-center justify-center border border-white/30 text-xs font-bold uppercase tracking-[0.1em] text-white hover:bg-white/[0.06] hover:text-white"
              >
                View recommendations
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
