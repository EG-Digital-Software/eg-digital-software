import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Printer,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Building2,
  Send,
  Trash2,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { invoiceApi, paymentApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { InvoicePreview } from '@/components/invoice/InvoicePreview';
import { invoiceTermLabel } from '@/lib/customer';
import { LoadingBlock, ErrorState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { formatCurrency, formatDate, daysOverdue } from '@/lib/utils';
import { linkifyValue } from '@/lib/linkify';
import { LIVE_INVOICE_QUERY } from '@/lib/queryClient';
import { useStaffAccess } from '@/lib/staffAccess';
import type { InvoiceStatus } from '@/types';

const STATUS_CHIP: Record<InvoiceStatus, { cls: string; label: string }> = {
  DRAFT: { cls: 'c-ns', label: 'Draft' },
  SENT: { cls: 'c-info', label: 'Sent' },
  PENDING: { cls: 'c-warn', label: 'Pending' },
  PARTIALLY_PAID: { cls: 'c-on', label: 'Partially paid' },
  PAID: { cls: 'c-ok', label: 'Paid' },
  OVERDUE: { cls: 'c-red', label: 'Overdue' },
  CANCELLED: { cls: 'c-ns', label: 'Cancelled' },
};

function Money({ label, value, tone }: { label: string; value: string | number; tone?: 'owed' | 'paid' }) {
  return (
    <div className="tile">
      <div className="eyebrow">{label}</div>
      <div
        className="disp stat"
        style={{
          fontSize: 26,
          fontWeight: 700,
          marginTop: 6,
          color: tone === 'owed' ? 'var(--rT)' : tone === 'paid' ? 'var(--okT)' : undefined,
        }}
      >
        {formatCurrency(value)}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="muted">{label}</span>
      <span>{value ? linkifyValue(value) : <span className="muted">—</span>}</span>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A view-only Billing role can read and print, but not change the invoice.
  const canEdit = useStaffAccess().canEdit('billing');

  const { data: invoice, isLoading, isError, refetch } = useQuery({
    // Unpaid invoices re-price live when products change — always show the latest.
    ...LIVE_INVOICE_QUERY,
    queryKey: ['invoice', id],
    queryFn: () => invoiceApi.get(id!),
  });

  const sendInvoice = useMutation({
    mutationFn: () => invoiceApi.send(id!),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`Invoice sent to ${res.recipients.join(', ')}`);
      setConfirmSend(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const markPaid = useMutation({
    mutationFn: () => paymentApi.record(id!, Number(invoice!.total) - Number(invoice!.amountPaid), 'manual'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Payment recorded');
      setConfirmPaid(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteInvoice = useMutation({
    mutationFn: () => invoiceApi.remove(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Invoice deleted');
      navigate('/admin/billing', { replace: true });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (isLoading) return <LoadingBlock label="Loading invoice…" />;
  if (isError || !invoice) return <ErrorState onRetry={refetch} />;

  const balance = Number(invoice.total) - Number(invoice.amountPaid);
  const isPaid = invoice.status === 'PAID' || balance <= 0;
  // Derived from the due date, not the stored status — nothing flips an invoice
  // to OVERDUE the moment its due date passes.
  const overdue = daysOverdue(invoice);

  const chip = STATUS_CHIP[invoice.status] ?? STATUS_CHIP.DRAFT;
  const customerLabel =
    invoice.customer?.companyName || invoice.customer?.contactPerson || invoice.customer?.clientId;

  return (
    <div className="ec-page">
      <div
        className="up print:hidden"
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}
      >
        <div>
          <div className="eyebrow">Billing · Invoice</div>
          <h1 className="disp ec-h1">{invoice.invoiceNumber}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {customerLabel ? `${customerLabel} · ` : ''}Issued {formatDate(invoice.invoiceDate)} · Due{' '}
            {formatDate(invoice.dueDate)} · {isPaid ? 'Settled' : `${formatCurrency(balance)} outstanding`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/admin/billing" className="btn bg">
            <ArrowLeft /> All invoices
          </Link>
          {invoice.paymentUrl && (
            <a href={invoice.paymentUrl} target="_blank" rel="noreferrer" className="btn bg">
              <ExternalLink /> Payment link
            </a>
          )}
          <button type="button" className="btn bg" onClick={() => window.print()}>
            <Printer /> Print / PDF
          </button>
          {canEdit && (
            <>
              <Link to={`/admin/billing/${invoice.id}/edit`} className="btn bg">
                <Pencil /> Edit
              </Link>
              <button type="button" className="btn bg" onClick={() => setConfirmSend(true)} disabled={sendInvoice.isPending}>
                <Send /> Send to customer
              </button>
              {!isPaid && (
                <button type="button" className="btn bp" onClick={() => setConfirmPaid(true)}>
                  <CheckCircle2 /> Mark as paid
                </button>
              )}
              <button
                type="button"
                className="btn bg"
                style={{ color: 'var(--rT)' }}
                onClick={() => setConfirmDelete(true)}
                disabled={deleteInvoice.isPending}
              >
                <Trash2 /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Working summary for the admin — the printable invoice follows below. */}
      <section className="glass up print:hidden" style={{ animationDelay: '.08s', overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            padding: '18px 22px',
            borderBottom: '1px solid rgba(var(--w),.06)',
          }}
        >
          <h2 className="disp" style={{ margin: 0, fontSize: 18, flex: 1 }}>
            Summary
          </h2>
          <span className={`chip ${chip.cls}`}>
            <span className="dot" />
            {chip.label}
          </span>
          {overdue > 0 && (
            <span className="chip c-red">
              <AlertTriangle className="h-3 w-3" /> {overdue} {overdue === 1 ? 'day' : 'days'} overdue
            </span>
          )}
          {invoice.customer?.clientId && (
            <Link
              to={`/admin/customers/${invoice.customer.clientId}`}
              className="chip c-on"
              style={{ textDecoration: 'none' }}
            >
              <Building2 className="h-3 w-3" />
              {customerLabel}
              <span className="mono" style={{ fontSize: 11 }}>
                {invoice.customer.clientId}
              </span>
            </Link>
          )}
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, padding: '18px 22px' }}
        >
          <Money label="Total" value={invoice.total} />
          <Money label="Paid" value={invoice.amountPaid} tone="paid" />
          <Money label="Balance" value={balance} tone={balance > 0 ? 'owed' : undefined} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <Detail label="Invoice date" value={formatDate(invoice.invoiceDate)} />
          <Detail label="Due date" value={formatDate(invoice.dueDate)} />
          <Detail label="Term" value={invoiceTermLabel(invoice.term)} />
          <Detail
            label="Next billing date"
            value={invoice.nextBillingDate ? formatDate(invoice.nextBillingDate) : '—'}
          />
          <Detail label="Reference" value={invoice.reference} />
        </div>

        {!!invoice.payments?.length && (
          <div style={{ borderTop: '1px solid rgba(var(--w),.06)' }}>
            <div className="eyebrow" style={{ padding: '16px 22px 4px' }}>
              Payments
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((pay) => (
                    <tr key={pay.id} className="row">
                      <td className="nw">{formatDate(pay.paidAt)}</td>
                      <td>{pay.paymentMethod ?? '—'}</td>
                      <td>
                        <span className={`chip ${pay.status === 'SUCCESS' ? 'c-ok' : 'c-ns'}`}>
                          <span className="dot" />
                          {pay.status.charAt(0) + pay.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="stat" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(pay.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <InvoicePreview invoice={invoice} />

      <ConfirmDialog
        open={confirmPaid}
        onOpenChange={setConfirmPaid}
        title="Mark Invoice as Paid?"
        description={`This records a payment of the outstanding balance and updates the invoice status.`}
        confirmLabel="Record payment"
        loading={markPaid.isPending}
        onConfirm={() => markPaid.mutate()}
      />

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="Send Invoice to Customer?"
        description={
          invoice.customer?.billingEmail || invoice.customer?.contactEmail
            ? `Emails the invoice with a secure pay link to ${
                invoice.customer.billingEmail || invoice.customer.contactEmail
              } and any linked customer-account addresses.`
            : 'This customer has no billing or contact email — add one on the customer record first.'
        }
        confirmLabel="Send invoice"
        loading={sendInvoice.isPending}
        onConfirm={() => sendInvoice.mutate()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this invoice?"
        description={`Permanently deletes ${invoice.invoiceNumber} and its line items${
          invoice.payments?.length ? ' and recorded payments' : ''
        }. This cannot be undone.`}
        confirmLabel="Delete invoice"
        destructive
        loading={deleteInvoice.isPending}
        onConfirm={() => deleteInvoice.mutate()}
      />
    </div>
  );
}
