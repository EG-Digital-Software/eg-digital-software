import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Search } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { useDebounce } from '@/hooks/useDebounce';
import { Pagination } from '@/components/shared/misc';
import { Button } from '@/components/ui/button';
import { InvoiceBadge } from '@/components/shared/status';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { formatCurrency, formatDate, daysOverdue } from '@/lib/utils';
import { LIVE_INVOICE_QUERY } from '@/lib/queryClient';
import { brand } from '@/config/brand';
import { ElPageHead, ElSeg, ElSkel } from '@/components/client/eloma';
import type { Address } from '@/types';

type Tab = 'all' | 'outstanding' | 'paid' | 'overdue';

function oneLineAddress(a?: Address): string | null {
  if (!a) return null;
  return (
    [a.line1, a.line2, a.suburb, a.city, a.state, a.postcode].filter((p) => p && p.toString().trim()).join(', ') ||
    null
  );
}

export default function ClientInvoicesPage() {
  const navigate = useNavigate();
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

  const filtered = !!(debounced || tab !== 'all');
  const clearFilters = () => {
    setSearch('');
    setTab('all');
    setPage(1);
  };
  const noInvoicesAtAll = !filtered && !isLoading && !isError && !data?.items.length;
  const billingAddress = oneLineAddress(profile?.addresses?.find((a) => a.type === 'BILLING'));

  return (
    <>
      <ElPageHead
        eyebrow="Billing"
        title="Invoices"
        description="View and pay invoices from EG Eloma. New invoices also go to your accounts email."
      />

      <section className="el-card">
        <div className="el-toolbar">
          <ElSeg<Tab>
            label="Invoice status"
            value={tab}
            onChange={(v) => {
              setTab(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All', count: dash?.invoices },
              { value: 'outstanding', label: 'Outstanding', count: dash?.outstanding.count },
              { value: 'paid', label: 'Paid' },
              { value: 'overdue', label: 'Overdue', count: dash?.overdue.count },
            ]}
          />
          <span className="grow" />
          <label className="el-search">
            <Search />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Invoice number or reference"
              aria-label="Search invoice number or reference"
            />
          </label>
        </div>

        {/* Balance across the whole filtered set, not just this page. */}
        {data?.meta && data.meta.balance > 0 && (
          <div className="el-balance">
            <span className="el-eyebrow">Balance due</span>
            <b className="el-num">{formatCurrency(data.meta.balance)}</b>
            <span className="el-muted text-xs">
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
              <ElSkel key={i} className="h-12" />
            ))}
          </div>
        ) : noInvoicesAtAll ? (
          <div className="el-empty">
            <div className="el-receipt" aria-hidden="true">
              <i />
              <i className="s" />
              <i />
              <i className="s" />
              <i className="g" />
            </div>
            <div className="min-w-0">
              <h2>No invoices yet</h2>
              <p>
                Your first invoice will appear here as soon as EG Eloma issues it. You’ll be able to download it as a
                PDF and pay online.
              </p>
              <dl className="el-facts">
                <div>
                  <dt>Payment terms</dt>
                  <dd>{profile?.invoicingTerm?.trim() || '—'}</dd>
                </div>
                <div>
                  <dt>Sent to</dt>
                  <dd>{profile?.billingEmail?.trim() || profile?.contactEmail?.trim() || '—'}</dd>
                </div>
                <div>
                  <dt>Billing address</dt>
                  <dd>{billingAddress ?? '—'}</dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/client/details" className="el-btn">
                  Check billing details
                </Link>
                <a href={`mailto:${brand.seller.billingEmail}?subject=Billing%20enquiry`} className="el-btn ghost">
                  Ask about billing
                </a>
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
            <div className="el-table-wrap">
              <table className="el-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th className="r">Total</th>
                    <th className="r">Paid</th>
                    <th className="r">Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((inv) => {
                    const balance = Number(inv.total) - Number(inv.amountPaid);
                    const overdue = daysOverdue(inv);
                    return (
                      <tr key={inv.id} className="click" onClick={() => navigate(`/client/invoices/${inv.id}`)}>
                        <td>
                          <span className="el-mono font-medium text-[color:var(--ink)]">{inv.invoiceNumber}</span>
                          {inv.reference && <p className="el-muted m-0 text-xs">Ref {inv.reference}</p>}
                        </td>
                        <td>{formatDate(inv.invoiceDate)}</td>
                        <td className="whitespace-nowrap">
                          {formatDate(inv.dueDate)}
                          {overdue > 0 && (
                            <p className="m-0 flex items-center gap-1 text-xs font-medium text-[color:var(--bad)]">
                              <AlertTriangle className="h-3 w-3" />
                              {overdue} {overdue === 1 ? 'day' : 'days'} overdue
                            </p>
                          )}
                        </td>
                        <td className="r el-num font-semibold">{formatCurrency(inv.total)}</td>
                        <td className="r el-num el-muted">{formatCurrency(inv.amountPaid)}</td>
                        <td className="r el-num">
                          {balance > 0 ? (
                            <span className="font-medium text-[color:var(--bad)]">{formatCurrency(balance)}</span>
                          ) : (
                            <span className="text-[color:var(--nectar-strong)]">Settled</span>
                          )}
                        </td>
                        <td>
                          <InvoiceBadge status={inv.status} />
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
    </>
  );
}
