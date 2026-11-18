import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, CreditCard } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { InvoicePreview } from '@/components/invoice/InvoicePreview';
import { PayNowDialog } from '@/components/invoice/PayNowDialog';
import { LoadingBlock, ErrorState } from '@/components/shared/states';
import { LIVE_INVOICE_QUERY } from '@/lib/queryClient';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ClientInvoiceDetail() {
  const { id } = useParams();
  const [payOpen, setPayOpen] = useState(false);
  const { data: invoice, isLoading, isError, refetch } = useQuery({
    // Unpaid invoices re-price live when products change — always show the latest.
    ...LIVE_INVOICE_QUERY,
    queryKey: ['client', 'invoice', id],
    queryFn: () => clientApi.invoice(id!),
  });

  if (isLoading) return <LoadingBlock label="Loading invoice…" />;
  if (isError || !invoice) return <ErrorState onRetry={refetch} />;

  const balance = Number(invoice.total) - Number(invoice.amountPaid);
  const isPaid = invoice.status === 'PAID' || balance <= 0;

  return (
    <div className="ec-page">
      <div
        className="up print:hidden"
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}
      >
        <div>
          <div className="eyebrow">Billing · Invoice</div>
          <h1 className="disp ec-h1">
            {invoice.invoiceNumber}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Issued {formatDate(invoice.invoiceDate)} · Due {formatDate(invoice.dueDate)} ·{' '}
            {isPaid ? 'Settled' : `${formatCurrency(balance)} outstanding`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/client/invoices" className="btn bg">
            <ArrowLeft /> All invoices
          </Link>
          <button type="button" className="btn bg" onClick={() => window.print()}>
            <Printer /> Print / PDF
          </button>
          {!isPaid && invoice.paymentUrl && (
            <button type="button" className="btn bp" onClick={() => setPayOpen(true)}>
              <CreditCard /> Pay now
            </button>
          )}
        </div>
      </div>

      <InvoicePreview invoice={invoice} />
      {invoice.paymentUrl && <PayNowDialog invoice={invoice} open={payOpen} onOpenChange={setPayOpen} />}
    </div>
  );
}
