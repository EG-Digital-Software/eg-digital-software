import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, CreditCard } from 'lucide-react';
import { clientApi } from '@/api/client-portal';
import { PageHeader } from '@/components/shared/misc';
import { Button } from '@/components/ui/button';
import { InvoicePreview } from '@/components/invoice/InvoicePreview';
import { LoadingBlock, ErrorState } from '@/components/shared/states';

export default function ClientInvoiceDetail() {
  const { id } = useParams();
  const { data: invoice, isLoading, isError, refetch } = useQuery({
    queryKey: ['client', 'invoice', id],
    queryFn: () => clientApi.invoice(id!),
  });

  if (isLoading) return <LoadingBlock label="Loading invoice…" />;
  if (isError || !invoice) return <ErrorState onRetry={refetch} />;

  const balance = Number(invoice.total) - Number(invoice.amountPaid);
  const isPaid = invoice.status === 'PAID' || balance <= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/client/invoices">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={invoice.invoiceNumber}
          actions={
            <>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print / PDF
              </Button>
              {!isPaid && invoice.paymentUrl && (
                <Button asChild>
                  <a href={invoice.paymentUrl} target="_blank" rel="noreferrer">
                    <CreditCard className="h-4 w-4" /> Pay Now
                  </a>
                </Button>
              )}
            </>
          }
        />
      </div>

      <InvoicePreview invoice={invoice} />
    </div>
  );
}
