import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Wallet, Receipt } from 'lucide-react';
import { paymentApi, type PaymentRow } from '@/api/resources';
import { useDebounce } from '@/hooks/useDebounce';
import { Pagination } from '@/components/shared/misc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS_CHIP: Record<PaymentRow['status'], string> = {
  SUCCESS: 'c-ok',
  PENDING: 'c-warn',
  FAILED: 'c-red',
  REFUNDED: 'c-ns',
  CANCELLED: 'c-ns',
};

function customerName(p: PaymentRow): string {
  const c = p.invoice?.customer;
  if (!c) return '—';
  return c.companyName || c.contactPerson || c.clientId;
}

/** Every payment across every invoice — the money-in view. */
export function PaymentsTransactionsTab() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const debounced = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', { page, debounced, status, method }],
    queryFn: () => paymentApi.list({ page, pageSize: 10, search: debounced, status, method }),
  });
  const { data: methods } = useQuery({
    queryKey: ['payments', 'methods'],
    queryFn: paymentApi.methods,
  });

  const filtered = !!(debounced || status || method);
  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setMethod('');
    setPage(1);
  };

  return (
    <div className="ec-page">
      {/* Collected total reflects the current filter, not just this page. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }} className="stag">
        <div className="glass card" style={{ padding: 16 }}>
          <div className="eyebrow">Collected</div>
          <div className="disp stat" style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: 'var(--okT)' }}>
            {data?.meta ? formatCurrency(data.meta.collected ?? 0) : '—'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {filtered ? 'Matching these filters' : 'All payments'}
          </div>
        </div>
        <div className="glass card" style={{ padding: 16 }}>
          <div className="eyebrow">Payments</div>
          <div className="disp stat" style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
            {data?.meta ? data.meta.total : '—'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {filtered ? 'Matching these filters' : 'In total'}
          </div>
        </div>
      </div>

      <section className="glass" style={{ overflow: 'hidden' }}>
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
          <label style={{ position: 'relative', display: 'flex', flex: '1 1 280px' }}>
            <span className="sr">Search payments</span>
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
              placeholder="Search invoice, customer, Customer ID or transaction ID…"
            />
          </label>
          <label style={{ display: 'flex', flex: '0 1 170px' }}>
            <span className="sr">Status</span>
            <select
              className="inp"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {(['SUCCESS', 'PENDING', 'FAILED', 'REFUNDED', 'CANCELLED'] as const).map((st) => (
                <option key={st} value={st}>
                  {st.charAt(0) + st.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flex: '0 1 170px' }}>
            <span className="sr">Method</span>
            <select
              className="inp"
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All methods</option>
              {methods?.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
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
              icon={<Wallet className="h-6 w-6" />}
              title="No payments found"
              description={
                filtered
                  ? 'No payment matches these filters.'
                  : 'Payments appear here as soon as invoices are paid — online or recorded manually.'
              }
              action={
                filtered ? (
                  <Button variant="outline" onClick={clearFilters}>
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
                    <th>Date</th>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="stag">
                  {data.items.map((p) => (
                    <tr
                      key={p.id}
                      className={`row${p.invoice ? ' click' : ''}`}
                      onClick={() => p.invoice && navigate(`/admin/billing/${p.invoice.id}`)}
                    >
                      <td className="nw">
                        {formatDate(p.paidAt ?? p.createdAt)}
                        {!p.paidAt && (
                          <div className="muted" style={{ fontSize: 12 }}>
                            not settled
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Receipt className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--mu)' }} />
                          <span className="mono" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)' }}>
                            {p.invoice?.invoiceNumber ?? '—'}
                          </span>
                        </span>
                      </td>
                      <td>
                        <div className="truncate" style={{ fontWeight: 500 }}>
                          {customerName(p)}
                        </div>
                        <div className="mono muted truncate" style={{ fontSize: 11 }}>
                          {p.invoice?.customer?.clientId}
                        </div>
                      </td>
                      <td>{p.paymentMethod ?? '—'}</td>
                      <td>
                        <div className="mono muted truncate" style={{ fontSize: 11.5 }}>
                          {p.transactionId ?? '—'}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          via {p.provider}
                        </div>
                      </td>
                      <td className="stat" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(p.amount)}
                      </td>
                      <td>
                        <span className={`chip ${STATUS_CHIP[p.status] ?? 'c-ns'}`}>
                          <span className="dot" />
                          {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
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
