import { useState } from 'react';
import { Check, Copy, CreditCard, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import type { Invoice } from '@/types';

/**
 * "Pay now" popup: the invoice's payment QR code and its payment link side by
 * side. Clicking either one opens the same link — the invoice's own payment link
 * when the admin set one, otherwise the built-in pay page.
 */
export function PayNowDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: Pick<Invoice, 'invoiceNumber' | 'paymentUrl' | 'paymentQrUrl' | 'total' | 'amountPaid'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = invoice.paymentUrl ?? '';
  const due = Math.max(Number(invoice.total) - Number(invoice.amountPaid), 0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link is still selectable */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {invoice.invoiceNumber}</DialogTitle>
          <DialogDescription>
            {formatCurrency(due)} due. Scan the QR code or open the payment link — both go to the same
            secure payment page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {invoice.paymentQrUrl && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              title="Open the payment page"
              className="rounded-xl bg-white p-2 ring-1 ring-black/10 transition-shadow hover:shadow-md"
            >
              <img src={invoice.paymentQrUrl} alt="Scan to pay" className="h-48 w-48" />
            </a>
          )}
          <p className="text-xs text-muted-foreground">Scan with your phone camera, or click the QR code</p>

          <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 break-all text-sm font-medium text-[#2563eb] hover:underline"
            >
              {url}
            </a>
            <button
              type="button"
              onClick={copy}
              title="Copy link"
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <CreditCard className="h-4 w-4" /> Pay now <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
