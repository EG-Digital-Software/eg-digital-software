import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, CreditCard, Smartphone, AlertTriangle, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { paymentApi, settingsApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { brand } from '@/config/brand';
import { Logo } from '@/components/layout/Logo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InvoiceBadge } from '@/components/shared/status';
import { LoadingBlock, ErrorState, Spinner } from '@/components/shared/states';
import { formatCurrency, formatDate, daysOverdue } from '@/lib/utils';

const CARD_METHODS: Array<{ method: string; label: string; node: ReactNode }> = [
  {
    method: 'visa',
    label: 'Visa',
    node: <span className="text-xs font-bold italic tracking-tight text-[#1A1F71]">VISA</span>,
  },
  {
    method: 'mastercard',
    label: 'Mastercard',
    node: (
      <svg viewBox="0 0 32 20" className="h-5 w-8" aria-hidden>
        <circle cx="13" cy="10" r="6" fill="#EB001B" />
        <circle cx="19" cy="10" r="6" fill="#F79E1B" fillOpacity="0.9" />
      </svg>
    ),
  },
  {
    method: 'amex',
    label: 'American Express',
    node: <span className="rounded bg-[#2E77BC] px-1 py-0.5 text-[8px] font-bold text-white">AMEX</span>,
  },
  {
    method: 'gpay',
    label: 'Google Pay',
    node: (
      <span className="text-xs font-semibold text-foreground">
        <span className="text-[#4285F4]">G</span> Pay
      </span>
    ),
  },
];

/**
 * Public, unauthenticated pay page. In production this is where the selected
 * payment provider's hosted checkout / QR would be embedded. Secret keys are
 * never exposed here — only the public payment URL is used.
 */
export default function PayPage() {
  const { id } = useParams();
  const [paying, setPaying] = useState(false);
  const { data: invoice, isLoading, isError, refetch } = useQuery({
    queryKey: ['public-invoice', id],
    queryFn: () => paymentApi.publicInvoice(id!),
  });
  const { data: pay } = useQuery({
    queryKey: ['public-payment-settings'],
    queryFn: settingsApi.publicPayment,
    staleTime: 5 * 60 * 1000,
  });
  const { data: org } = useQuery({
    queryKey: ['public-organisation'],
    queryFn: settingsApi.publicOrganisation,
    staleTime: 5 * 60 * 1000,
  });
  // The exact figure the API will charge for a card payment — the page used to
  // advertise a surcharge that was never actually added.
  const { data: quote } = useQuery({
    queryKey: ['public-quote', id],
    queryFn: () => paymentApi.quote(id!, 'card'),
    enabled: !!id,
  });

  if (isLoading) return <LoadingBlock label="Loading invoice…" />;
  if (isError || !invoice) return <div className="p-10"><ErrorState onRetry={refetch} /></div>;

  const balance = Number(invoice.total) - Number(invoice.amountPaid);
  const paid = balance <= 0;
  const overdue = daysOverdue(invoice);

  const handlePay = async (method: string) => {
    if (!id) return;
    setPaying(true);
    try {
      await paymentApi.pay(id, method);
      toast.success('Payment successful — thank you!');
      await refetch();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Payment failed'));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary/30 py-10">
      <div className="mx-auto max-w-lg px-4">
        <div className="mb-6 flex items-center justify-center">
          <Logo className="text-2xl" />
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle>{paid ? 'Invoice Paid' : 'Pay Invoice'}</CardTitle>
            <p className="font-mono text-sm text-muted-foreground">{invoice.invoiceNumber}</p>
            <div className="flex justify-center pt-2">
              <InvoiceBadge status={invoice.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-xl bg-secondary/50 p-6 text-center">
              <p className="text-sm text-muted-foreground">{paid ? 'Amount paid' : 'Amount due'}</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight">
                {formatCurrency(paid ? invoice.total : balance)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(invoice.dueDate)}</p>
              {overdue > 0 && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {overdue} {overdue === 1 ? 'day' : 'days'} overdue
                </p>
              )}
            </div>

            {!paid && (
              <>
                {invoice.paymentQrUrl && (
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={invoice.paymentQrUrl}
                      alt="Payment QR"
                      className="h-40 w-40 rounded-lg border border-border"
                    />
                    <p className="text-xs text-muted-foreground">Scan the QR to pay</p>
                  </div>
                )}

                {(!pay || pay.cardPaymentsEnabled) && (
                  <>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" /> or pay with card{' '}
                      <span className="h-px flex-1 bg-border" />
                    </div>

                    {/* Accepted payment methods — tap to pay */}
                    <div className="grid grid-cols-4 gap-2">
                      {CARD_METHODS.map((m) => (
                        <button
                          key={m.method}
                          type="button"
                          disabled={paying}
                          onClick={() => handlePay(m.method)}
                          title={`Pay with ${m.label}`}
                          className="flex h-11 items-center justify-center rounded-lg border border-border bg-white transition-all hover:border-primary/50 hover:shadow-sm disabled:opacity-50"
                        >
                          {m.node}
                        </button>
                      ))}
                    </div>

                    {quote && quote.surcharge > 0 && (
                      <dl className="space-y-1 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Invoice balance</dt>
                          <dd className="tabular-nums">{formatCurrency(quote.balance)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">
                            Card surcharge ({quote.surchargePct}%)
                          </dt>
                          <dd className="tabular-nums">{formatCurrency(quote.surcharge)}</dd>
                        </div>
                        <div className="flex justify-between border-t border-border pt-1 font-semibold">
                          <dt>Total charged</dt>
                          <dd className="tabular-nums">{formatCurrency(quote.total)}</dd>
                        </div>
                      </dl>
                    )}

                    <Button className="w-full" size="lg" disabled={paying} onClick={() => handlePay('card')}>
                      {paying ? <Spinner /> : <CreditCard className="h-4 w-4" />}
                      {paying
                        ? 'Processing…'
                        : `Pay ${formatCurrency(quote?.total ?? balance)} now`}
                    </Button>
                    {quote && quote.surcharge > 0 && (
                      <p className="-mt-2 text-center text-xs text-muted-foreground">
                        Bank transfer and UPI have no surcharge.
                      </p>
                    )}
                  </>
                )}

                {pay?.upiEnabled && pay.upiId && (
                  <div className="rounded-xl border border-border bg-secondary/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          UPI / Google Pay
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                          {pay.upiId}
                          <CopyButton value={pay.upiId} label="UPI ID" />
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={paying}
                        onClick={() => handlePay('upi')}
                      >
                        <Smartphone className="h-4 w-4" /> Pay via UPI
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Google Pay · PhonePe · Paytm · any UPI app. Use{' '}
                      <span className="font-medium text-foreground">{invoice.invoiceNumber}</span> as
                      the note.
                    </p>
                  </div>
                )}

                {pay?.bankTransferEnabled && (pay.accountNumber || pay.bsb) && (
                  <div className="rounded-xl border border-border bg-secondary/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Pay by bank transfer
                    </p>
                    <dl className="mt-2 space-y-1 text-sm">
                      {pay.accountName && <BankRow label="Account name" value={pay.accountName} />}
                      {pay.bankName && <BankRow label="Bank" value={pay.bankName} />}
                      {pay.bsb && <BankRow label="BSB" value={pay.bsb} />}
                      {pay.accountNumber && <BankRow label="Account no." value={pay.accountNumber} />}
                      <BankRow label="Reference" value={invoice.invoiceNumber} />
                    </dl>
                  </div>
                )}

                {pay?.payInstructions && (
                  <p className="text-center text-xs text-muted-foreground">{pay.payInstructions}</p>
                )}
                <p className="text-center text-xs text-muted-foreground">
                  {pay?.provider === 'mock'
                    ? 'Test checkout — no real funds are transferred.'
                    : 'Secure checkout'}{' '}
                  · You can also scan the QR from your invoice to pay.
                </p>
              </>
            )}

            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Secured by {org?.companyName || brand.companyName}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Copy-to-clipboard — a BSB or account number should never be re-typed. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy — please select the text manually');
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function BankRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5 font-medium text-foreground">
        {value}
        <CopyButton value={value} label={label} />
      </dd>
    </div>
  );
}
