import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, Receipt, AlertTriangle, Building2, Trash2, Plus } from 'lucide-react';
import { customerApi, dashboardApi, invoiceApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import type { DashboardSummary, Invoice, InvoiceStatus } from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import { Pagination } from '@/components/shared/misc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { formatCurrency, formatDate, daysOverdue } from '@/lib/utils';
import { LIVE_INVOICE_QUERY } from '@/lib/queryClient';
import { useStaffAccess } from '@/lib/staffAccess';

const STATUS_CHIP: Record<InvoiceStatus, { cls: string; label: string }> = {
  DRAFT: { cls: 'c-ns', label: 'Draft' },
  SENT: { cls: 'c-info', label: 'Sent' },
  PENDING: { cls: 'c-warn', label: 'Pending' },
  PARTIALLY_PAID: { cls: 'c-on', label: 'Partially paid' },
  PAID: { cls: 'c-ok', label: 'Paid' },
  OVERDUE: { cls: 'c-red', label: 'Overdue' },
  CANCELLED: { cls: 'c-ns', label: 'Cancelled' },
};

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
];

export default function BillingPage() {
  const navigate = useNavigate();
  // A view-only Billing role sees invoices but can't create or delete them.
  const canEdit = useStaffAccess().canEdit('billing');
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [clientId, setClientId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const debounced = useDebounce(search);

  const deleteInvoice = useMutation({
    mutationFn: (invId: string) => invoiceApi.remove(invId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Invoice deleted');
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  // Customer list that powers the client-wise filter dropdown.
  const { data: customers } = useQuery({
    queryKey: ['customers', 'billing-filter'],
    queryFn: () => customerApi.list({ page: 1, pageSize: 500 }),
    staleTime: 5 * 60_000,
  });

  // Same summary the admin dashboard reads — totals for the stat tiles.
  const { data: summary } = useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: dashboardApi.summary,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    // Unpaid invoices re-price live when products change — always show the latest.
    ...LIVE_INVOICE_QUERY,
    queryKey: ['invoices', { page, debounced, tab, clientId }],
    queryFn: () =>
      invoiceApi.list({ page, pageSize: 25, search: debounced, filter: tab, clientId, sort: 'client' }),
  });

  // Group the page's invoices by client so each customer's invoices sit together
  // under one header (the backend already orders them client-wise).
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; name: string; clientId: string; invoices: Invoice[]; outstanding: number }
    >();
    for (const inv of data?.items ?? []) {
      const key = inv.customer?.clientId || inv.customer?.contactPerson || 'unknown';
      const name =
        inv.customer?.companyName ||
        inv.customer?.contactPerson ||
        inv.customer?.clientId ||
        'Unknown customer';
      if (!map.has(key)) {
        map.set(key, {
          key,
          name,
          clientId: inv.customer?.clientId || '',
          invoices: [],
          outstanding: 0,
        });
      }
      const g = map.get(key)!;
      g.invoices.push(inv);
      g.outstanding += Math.max(Number(inv.total) - Number(inv.amountPaid), 0);
    }
    return [...map.values()];
  }, [data]);

  const pickTab = (v: string) => {
    setTab(v);
    setPage(1);
  };
  const filtered = !!(debounced || tab !== 'all' || clientId);
  const tiles = [
    {
      label: 'Outstanding',
      value: summary ? formatCurrency(summary.outstanding.amount) : '—',
      sub: summary
        ? `${summary.outstanding.count} unpaid ${summary.outstanding.count === 1 ? 'invoice' : 'invoices'}`
        : ' ',
      color: 'var(--wT)',
      tab: 'outstanding',
    },
    {
      label: 'Overdue',
      value: summary ? formatCurrency(summary.overdue.amount) : '—',
      sub: summary ? `${summary.overdue.count} past due` : ' ',
      color: summary && summary.overdue.count > 0 ? 'var(--rT)' : undefined,
      tab: 'overdue',
    },
    {
      label: 'Collected (month)',
      value: summary ? formatCurrency(summary.revenue.current) : '—',
      sub: 'Payments received this month',
      color: 'var(--okT)',
      tab: 'paid',
    },
    {
      label: 'Invoiced (month)',
      value: summary ? formatCurrency(summary.totalSales.current) : '—',
      sub: 'Raised this month',
      color: undefined,
      tab: 'all',
    },
  ];

  return (
    <div className="ec-page">
      <div
        className="up"
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}
      >
        <div>
          <div className="eyebrow">Billing</div>
          <h1 className="disp ec-h1">Invoices</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
            Invoices grouped by client — review, track and manage balances.
          </p>
        </div>
        {canEdit && (
          <Link to="/admin/billing/new" className="btn bp">
            <Plus /> New invoice
          </Link>
        )}
      </div>

      <div className="stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            className="glass card"
            style={{ padding: 16, textAlign: 'left', cursor: 'pointer', color: 'var(--fg)', font: 'inherit' }}
            onClick={() => pickTab(t.tab)}
          >
            <div className="eyebrow">{t.label}</div>
            <div className="disp stat" style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: t.color }}>
              {t.value}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {t.sub}
            </div>
          </button>
        ))}
      </div>

      <section className="glass up" style={{ animationDelay: '.12s', overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid rgba(var(--w),.06)',
          }}
        >
          <div className="segs" role="group" aria-label="Invoice status">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`seg${tab === t.value ? ' on' : ''}`}
                aria-pressed={tab === t.value}
                onClick={() => pickTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label style={{ position: 'relative', display: 'flex', flex: '1 1 260px', maxWidth: 420 }}>
            <span className="sr">Search invoices</span>
            <Search
              className="pointer-events-none h-4 w-4"
              style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--mu)' }}
            />
            <input
              className="inp"
              style={{ paddingLeft: 38 }}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Invoice number, reference, customer, email or Customer ID…"
            />
          </label>
          <label style={{ display: 'flex', flex: '0 1 240px' }}>
            <span className="sr">Client</span>
            <select
              className="inp"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All clients</option>
              {customers?.items.map((c) => (
                <option key={c.id} value={c.clientId}>
                  {c.companyName || c.tradingAs || c.contactPerson || c.clientId}
                </option>
              ))}
            </select>
          </label>
          {data?.meta && (
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
              {data.meta.total} {data.meta.total === 1 ? 'invoice' : 'invoices'}
            </span>
          )}
        </div>

        {isError ? (
          <div className="p-6">
            <ErrorState onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <div className="p-6">
            <EmptyState
              icon={<Receipt className="h-6 w-6" />}
              title="No invoices found"
              description={
                filtered
                  ? 'No invoice matches this client, tab or search.'
                  : 'Invoices raised for customers will appear here, grouped by client.'
              }
              action={
                filtered ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setTab('all');
                      setClientId('');
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <Fragment key={group.key}>
                      {/* Client header — groups this customer's invoices together. */}
                      <tr style={{ background: 'rgba(var(--w),.03)' }}>
                        <td colSpan={8} style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <span className="ico" style={{ width: 30, height: 30, borderRadius: 9 }}>
                                <Building2 className="h-4 w-4" />
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <div className="truncate" style={{ fontWeight: 600, fontSize: 14 }}>
                                  {group.name}
                                </div>
                                {group.clientId && (
                                  <div className="mono muted truncate" style={{ fontSize: 11 }}>
                                    {group.clientId}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, fontSize: 12 }}>
                              <span className="muted">
                                {group.invoices.length} {group.invoices.length === 1 ? 'invoice' : 'invoices'}
                              </span>
                              {group.outstanding > 0 ? (
                                <span className="chip c-red">{formatCurrency(group.outstanding)} outstanding</span>
                              ) : (
                                <span className="chip c-ok">Settled</span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {group.invoices.map((inv) => {
                        const balance = Number(inv.total) - Number(inv.amountPaid);
                        const overdue = daysOverdue(inv);
                        const chip = STATUS_CHIP[inv.status] ?? STATUS_CHIP.DRAFT;
                        return (
                          <tr key={inv.id} className="row click" onClick={() => navigate(`/admin/billing/${inv.id}`)}>
                            <td style={{ paddingLeft: 28 }}>
                              <span className="mono" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)' }}>
                                {inv.invoiceNumber}
                              </span>
                              {inv.reference && (
                                <div className="muted" style={{ fontSize: 12 }}>
                                  {inv.reference}
                                </div>
                              )}
                            </td>
                            <td className="nw">{formatDate(inv.invoiceDate)}</td>
                            <td className="nw">
                              {formatDate(inv.dueDate)}
                              {overdue > 0 && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 12,
                                    fontWeight: 500,
                                    color: 'var(--rT)',
                                  }}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  {overdue} {overdue === 1 ? 'day' : 'days'} overdue
                                </div>
                              )}
                            </td>
                            <td className="stat" style={{ textAlign: 'right', fontWeight: 600 }}>
                              {formatCurrency(inv.total)}
                            </td>
                            <td className="stat muted" style={{ textAlign: 'right' }}>
                              {formatCurrency(inv.amountPaid)}
                            </td>
                            <td className="stat" style={{ textAlign: 'right' }}>
                              {balance > 0 ? (
                                <span style={{ fontWeight: 600, color: 'var(--rT)' }}>{formatCurrency(balance)}</span>
                              ) : (
                                <span style={{ color: 'var(--okT)' }}>Settled</span>
                              )}
                            </td>
                            <td>
                              <span className={`chip ${chip.cls}`}>
                                <span className="dot" />
                                {chip.label}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {canEdit && (
                              <button
                                type="button"
                                title="Delete invoice"
                                aria-label={`Delete ${inv.invoiceNumber}`}
                                className="btn bg"
                                style={{ minHeight: 34, width: 34, padding: 0, color: 'var(--rT)' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(inv);
                                }}
                              >
                                <Trash2 />
                              </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </section>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete this invoice?"
        description={`Permanently deletes ${deleteTarget?.invoiceNumber ?? ''} and its line items${
          deleteTarget?.payments?.length ? ' and recorded payments' : ''
        }. If it is the customer's latest invoice, no automatic invoice follows from it — billing resumes when you create their next invoice. This cannot be undone.`}
        confirmLabel="Delete invoice"
        destructive
        loading={deleteInvoice.isPending}
        onConfirm={() => deleteTarget && deleteInvoice.mutate(deleteTarget.id)}
      />
    </div>
  );
}
