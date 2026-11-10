import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { useDebounce } from '@/hooks/useDebounce';
import { Pagination } from '@/components/shared/misc';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { formatCurrency, formatDate, daysOverdue } from '@/lib/utils';
import { LIVE_INVOICE_QUERY } from '@/lib/queryClient';
import { useClientPortal } from '@/components/client/portalContext';
import type { Address, InvoiceStatus } from '@/types';

type Tab = 'all' | 'outstanding' | 'paid' | 'overdue';

const STATUS_CHIP: Record<InvoiceStatus, { cls: string; label: string }> = {
  DRAFT: { cls: 'c-ns', label: 'Draft' },
  SENT: { cls: 'c-info', label: 'Sent' },
  PENDING: { cls: 'c-warn', label: 'Pending' },
  PARTIALLY_PAID: { cls: 'c-on', label: 'Partially paid' },
  PAID: { cls: 'c-ok', label: 'Paid' },
  OVERDUE: { cls: 'c-red', label: 'Overdue' },
  CANCELLED: { cls: 'c-ns', label: 'Cancelled' },
};

function oneLineAddress(a?: Address): string | null {
  if (!a) return null;
  return (
    [a.line1, a.line2, a.suburb, a.city, a.state, a.postcode].filter((p) => p && p.toString().trim()).join(', ') ||
    null
  );
}

export default function ClientInvoicesPage() {
  const navigate = useNavigate();
  const { openAssistant } = useClientPortal();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    // Unpaid invoices re-price live when products change — always show the latest.
    ...LIVE_INVOICE_QUERY,
    queryKey: ['client', 'invoices', { page, tab, debounced }],
    queryFn: () => clientApi.invoices({ page, pageSize: 10, filter: tab, search: debounced }),
  });
  const { data: dash } = useQuery({ queryKey: ['client', 'dashboard'], queryFn: clientApi.dashboard });
  const { data: profile } = useQuery({ queryKey: ['client', 'profile'], queryFn: clientApi.profile });
  const { data: products } = useQuery({ queryKey: ['client', 'products'], queryFn: () => clientApi.products() });

  const filtered = !!(debounced || tab !== 'all');
  const clearFilters = () => {
    setSearch('');
    setTab('all');
    setPage(1);
  };
  const noInvoicesAtAll = !filtered && !isLoading && !isError && !data?.items.length;
  const billingAddress = oneLineAddress(profile?.addresses?.find((a) => a.type === 'BILLING'));
  const sentTo = profile?.billingEmail?.trim() || profile?.contactEmail?.trim() || '—';
  const terms = profile?.invoicingTerm?.trim();
  // Earliest approved licence = when the plan went live.
  const planSince = (products ?? [])
    .filter((p) => !p.pending && p.issueDate)
    .map((p) => p.issueDate)
    .sort()[0];

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'all', label: 'All', count: dash?.invoices },
    { value: 'outstanding', label: 'Outstanding', count: dash?.outstanding.count },
    { value: 'paid', label: 'Paid' },
    { value: 'overdue', label: 'Overdue', count: dash?.overdue.count },
  ];

  return (
    <div className="ec-page">
      <div className="up">
        <div className="eyebrow">Billing</div>
        <h1 className="disp ec-h1">Invoices</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 520 }}>
          View and pay invoices from EG Eloma. New invoices also go to your accounts email.
        </p>
      </div>

      <section className="glass up" style={{ animationDelay: '.12s', overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            borderBottom: '1px solid rgba(var(--w),.06)',
          }}
        >
          <div className="segs" role="group" aria-label="Invoice status">
            {tabs.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`seg${tab === t.value ? ' on' : ''}`}
                aria-pressed={tab === t.value}
                onClick={() => {
                  setTab(t.value);
                  setPage(1);
                }}
              >
                {t.label}
                {t.count != null && ` · ${t.count}`}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', flex: '0 1 320px' }}>
            <span className="sr">Invoice number or reference</span>
            <input
              className="inp"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Invoice number or reference"
            />
          </label>
        </div>

        {/* Balance across the whole filtered set, not just this page. */}
        {data?.meta && data.meta.balance > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              gap: '6px 14px',
              padding: '14px 18px',
              borderBottom: '1px solid rgba(var(--w),.06)',
              background: 'rgba(255,178,74,.06)',
            }}
          >
            <span className="eyebrow">Balance due</span>
            <b className="disp stat" style={{ fontSize: 22, color: 'var(--wT)' }}>
              {formatCurrency(data.meta.balance)}
            </b>
            <span className="muted" style={{ fontSize: 12 }}>
              across {data.meta.total} {data.meta.total === 1 ? 'invoice' : 'invoices'}
            </span>
          </div>
        )}

        {isError ? (
          <div className="p-6">
            <ErrorState onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skel" style={{ height: 48 }} />
            ))}
          </div>
        ) : noInvoicesAtAll ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, padding: 32 }}>
            <div
              aria-hidden="true"
              style={{
                position: 'relative',
                width: 150,
                height: 180,
                borderRadius: 14,
                background: 'rgba(var(--w),.04)',
                border: '1px solid rgba(var(--w),.1)',
                padding: '20px 18px',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <div className="shim" style={{ width: '90%' }} />
              <div className="shim" style={{ width: '60%', marginTop: 12 }} />
              <div className="shim" style={{ width: '80%', marginTop: 12 }} />
              <div className="shim" style={{ width: '50%', marginTop: 12 }} />
              <div
                style={{ position: 'absolute', left: 18, bottom: 22, width: 40, height: 6, borderRadius: 4, background: '#1FC88A' }}
              />
            </div>
            <div style={{ flex: '1 1 380px', minWidth: 0 }}>
              <h2 className="disp" style={{ margin: 0, fontSize: 22 }}>
                No invoices yet
              </h2>
              <p className="muted" style={{ margin: '8px 0 0', maxWidth: 480, lineHeight: 1.6 }}>
                Your first invoice will appear here as soon as EG Eloma issues it. You’ll be able to download it as a
                PDF and pay online.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 16,
                  marginTop: 22,
                  paddingTop: 18,
                  borderTop: '1px solid rgba(var(--w),.07)',
                }}
              >
                <div>
                  <div className="eyebrow">Payment terms</div>
                  <div style={{ marginTop: 6, fontWeight: 500 }}>{terms || '—'}</div>
                </div>
                <div>
                  <div className="eyebrow">Currency</div>
                  <div style={{ marginTop: 6, fontWeight: 500 }}>AUD · GST</div>
                </div>
                <div>
                  <div className="eyebrow">Sent to</div>
                  <div style={{ marginTop: 6, fontWeight: 500, overflowWrap: 'anywhere' }}>{sentTo}</div>
                </div>
                <div>
                  <div className="eyebrow">Billing address</div>
                  <div style={{ marginTop: 6, fontWeight: 500 }}>{billingAddress ?? '—'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
                <Link to="/client/details" className="btn bg">
                  Check billing details
                </Link>
                <button type="button" className="btn bg" onClick={() => openAssistant('When will my next invoice arrive?')}>
                  Ask about billing
                </button>
              </div>
              <div className="eyebrow" style={{ marginTop: 30 }}>
                How billing will work
              </div>
              <div className="steps" style={{ marginTop: 14, maxWidth: 620 }}>
                <div className={`st${planSince ? ' st-done' : ''}`}>
                  <i />
                  <span>{planSince ? `Plan active since ${formatDate(planSince)}` : 'Plan activated'}</span>
                </div>
                <div className="st st-wait">
                  <i />
                  <span>First invoice issued</span>
                </div>
                <div className="st">
                  <i />
                  <span>Emailed to your accounts inbox</span>
                </div>
                <div className="st">
                  <i />
                  <span>{terms ? `Due within ${terms}` : 'Due by the payment terms'}</span>
                </div>
              </div>
            </div>
          </div>
        ) : !data?.items.length ? (
          <div className="p-6">
            <EmptyState
              title="No invoices found"
              description="No invoice matches this tab or search."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
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
                    <th>
                      <span className="sr">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="stag">
                  {data.items.map((inv) => {
                    const balance = Number(inv.total) - Number(inv.amountPaid);
                    const overdue = daysOverdue(inv);
                    const chip = STATUS_CHIP[inv.status] ?? STATUS_CHIP.DRAFT;
                    const open = () => navigate(`/client/invoices/${inv.id}`);
                    return (
                      <tr key={inv.id} className="row click" onClick={open}>
                        <td>
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
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--rT)' }}
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
                        <td>
                          <button
                            type="button"
                            className="btn bg"
                            style={{ minHeight: 34, padding: '0 12px', fontSize: 12 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              open();
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}
