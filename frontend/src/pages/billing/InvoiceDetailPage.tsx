import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Printer,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { invoiceApi, paymentApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { PageHeader } from '@/components/shared/misc';
import { Button } from '@/components/ui/button';
import { InvoicePreview } from '@/components/invoice/InvoicePreview';
import { LoadingBlock, ErrorState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InvoiceBadge } from '@/components/shared/status';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate, daysOverdue } from '@/lib/utils';

function Money({ label, value, tone }: { label: string; value: string | number; tone?: 'owed' | 'paid' }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          tone === 'owed' ? 'text-destructive' : tone === 'paid' ? 'text-success' : ''
        }`}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 truncate text-sm font-medium">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [confirmPaid, setConfirmPaid] = useState(false);

  const { data: invoice, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoiceApi.get(id!),
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

  if (isLoading) return <LoadingBlock label="Loading invoice…" />;
  if (isError || !invoice) return <ErrorState onRetry={refetch} />;

  const balance = Number(invoice.total) - Number(invoice.amountPaid);
  const isPaid = invoice.status === 'PAID' || balance <= 0;
  // Derived from the due date, not the stored status — nothing flips an invoice
  // to OVERDUE the moment its due date passes.
  const overdue = daysOverdue(invoice);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/billing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={invoice.invoiceNumber}
          actions={
            <>
              {invoice.paymentUrl && (
                <Button variant="outline" asChild>
                  <a href={invoice.paymentUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" /> Payment Link
                  </a>
                </Button>
              )}
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print / PDF
              </Button>
              {!isPaid && (
                <Button onClick={() => setConfirmPaid(true)}>
                  <CheckCircle2 className="h-4 w-4" /> Mark as Paid
                </Button>
              )}
            </>
          }
        />
      </div>

      {/* Working summary for the admin — the printable invoice follows below. */}
      <Card className="print:hidden">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <InvoiceBadge status={invoice.status} />
            {overdue > 0 && (
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3" /> {overdue} {overdue === 1 ? 'day' : 'days'}{' '}
                overdue
              </Badge>
            )}
            {invoice.customer?.clientId && (
              <Link
                to={`/admin/customers/${invoice.customer.clientId}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20"
              >
                <Building2 className="h-3 w-3" />
                {invoice.customer.companyName ||
                  `${invoice.customer.firstName ?? ''} ${invoice.customer.lastName ?? ''}`.trim() ||
                  invoice.customer.clientId}
                <span className="font-mono font-normal">{invoice.customer.clientId}</span>
              </Link>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Money label="Total" value={invoice.total} />
            <Money label="Paid" value={invoice.amountPaid} tone="paid" />
            <Money label="Balance" value={balance} tone={balance > 0 ? 'owed' : undefined} />
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
            <Detail label="Invoice Date" value={formatDate(invoice.invoiceDate)} />
            <Detail label="Due Date" value={formatDate(invoice.dueDate)} />
            <Detail label="Term" value={invoice.term} />
            <Detail label="Reference" value={invoice.reference} />
          </div>

          {!!invoice.payments?.length && (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payments
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.payments.map((pay) => (
                    <TableRow key={pay.id}>
                      <TableCell className="text-sm">{formatDate(pay.paidAt)}</TableCell>
                      <TableCell className="text-sm">{pay.paymentMethod ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={pay.status === 'SUCCESS' ? 'success' : 'muted'}>
                          {pay.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(pay.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <InvoicePreview invoice={invoice} />

      <ConfirmDialog
        open={confirmPaid}
        onOpenChange={setConfirmPaid}
        title="Mark invoice as paid?"
        description={`This records a payment of the outstanding balance and updates the invoice status.`}
        confirmLabel="Record payment"
        loading={markPaid.isPending}
        onConfirm={() => markPaid.mutate()}
      />
    </div>
  );
}
