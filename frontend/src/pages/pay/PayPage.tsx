import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck,
  CreditCard,
  Smartphone,
  AlertTriangle,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
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

type CheckoutResult = 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'PENDING';

/**
 * Public, unauthenticated pay page. With ANZ Worldline the card button sends
 * the payer to Worldline's hosted checkout; they come back here with a
 * `hostedCheckoutId`, and the API asks Worldline for the real outcome. Secret
 * keys are never exposed here.
 */
export default function PayPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const confirmedRef = useRef(false);
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
  // The exact figure the API will charge for a card payment.
  const { data: quote } = useQuery({
    queryKey: ['public-quote', id],
    queryFn: () => paymentApi.quote(id!),
    enabled: !!id,
  });

  // Back from Worldline: confirm once, then drop the ids from the address bar
  // so a refresh does not re-confirm.
  const hostedCheckoutId = searchParams.get('hostedCheckoutId');
  useEffect(() => {
    if (!id || !hostedCheckoutId || confirmedRef.current) return;
    confirmedRef.current = true;
    setPaying(true);
    paymentApi
      .confirmCheckout(id, hostedCheckoutId)
      .then((r) => {
        const status: CheckoutResult =
          r.status === 'SUCCESS' || r.status === 'FAILED' || r.status === 'CANCELLED'
            ? r.status
            : 'PENDING';
        setResult(status);
        if (status === 'SUCCESS') toast.success('Payment successful — thank you!');
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not confirm the payment')))
      .finally(() => {
        setPaying(false);
        setSearchParams({}, { replace: true });
        refetch();
      });
  }, [id, hostedCheckoutId, refetch, setSearchParams]);

  if (isLoading) return <LoadingBlock label="Loading invoice…" />;
  if (isError || !invoice) return <div className="p-10"><ErrorState onRetry={refetch} /></div>;

  const balance = Number(invoice.total) - Number(invoice.amountPaid);
  const paid = balance <= 0;
  const overdue = daysOverdue(invoice);
  const isWorldline = pay?.provider === 'worldline';
  const cardAvailable = (!pay || pay.cardPaymentsEnabled) && pay?.cardGatewayReady !== false;

  const handlePay = async (method: string) => {
    if (!id) return;
    setPaying(true);
    if (isWorldline) {
      try {
        const { redirectUrl } = await paymentApi.startCheckout(id);
        // Leave `paying` on — the browser is navigating to Worldline.
        window.location.assign(redirectUrl);
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Could not open the secure checkout'));
        setPaying(false);
      }
      return;
    }
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
            {result && <CheckoutBanner result={paid ? 'SUCCESS' : result} />}

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

                {pay?.cardPaymentsEnabled && !cardAvailable && (
                  <p className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-center text-sm text-muted-foreground">
                    Card payments are temporarily unavailable. Please use one of the options below
                    or contact us.
                  </p>
                )}

                {cardAvailable && (
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

                    <Button className="w-full" size="lg" disabled={paying} onClick={() => handlePay('card')}>
                      {paying ? <Spinner /> : <CreditCard className="h-4 w-4" />}
                      {paying
                        ? isWorldline
                          ? 'Opening secure checkout…'
                          : 'Processing…'
                        : `Pay ${formatCurrency(quote?.total ?? balance)} now`}
                    </Button>
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
                      {/* Marks the invoice paid on trust — only for the mock checkout. */}
                      {pay.provider === 'mock' && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={paying}
                          onClick={() => handlePay('upi')}
                        >
                          <Smartphone className="h-4 w-4" /> Pay via UPI
                        </Button>
                      )}
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
                    : isWorldline
                      ? 'Card details are entered on the secure ANZ Worldline page.'
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

const BANNERS: Record<CheckoutResult, { icon: ReactNode; title: string; body: string; tone: string }> = {
  SUCCESS: {
    icon: <CheckCircle2 className="h-5 w-5" />,
    title: 'Payment received',
    body: 'Thank you — your payment has been processed.',
    tone: 'border-success/30 bg-success/10 text-success',
  },
  PENDING: {
    icon: <Clock className="h-5 w-5" />,
    title: 'Payment processing',
    body: 'Your bank is still confirming the payment. This page will show it as paid once it clears.',
    tone: 'border-border bg-secondary/50 text-foreground',
  },
  FAILED: {
    icon: <XCircle className="h-5 w-5" />,
    title: 'Payment declined',
    body: 'Your card was not charged. Please try again or use another card.',
    tone: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  CANCELLED: {
    icon: <XCircle className="h-5 w-5" />,
    title: 'Payment cancelled',
    body: 'No payment was taken. You can try again whenever you are ready.',
    tone: 'border-border bg-secondary/50 text-foreground',
  },
};

/** Outcome of a Worldline checkout, shown once the payer returns. */
function CheckoutBanner({ result }: { result: CheckoutResult }) {
  const b = BANNERS[result];
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${b.tone}`} role="status">
      <span className="mt-0.5 shrink-0">{b.icon}</span>
      <div>
        <p className="text-sm font-semibold">{b.title}</p>
        <p className="text-xs opacity-90">{b.body}</p>
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
