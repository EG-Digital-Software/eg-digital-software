import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { brand } from '@/config/brand';
import { Logo } from '@/components/layout/Logo';
import type { Invoice } from '@/types';
import { InvoiceBadge } from '@/components/shared/status';
import { settingsApi } from '@/api/resources';
import { formatCurrency, formatDate } from '@/lib/utils';
import { formatAbn } from '@/lib/customer';
import { formatPhone } from '@/components/shared/PhoneInput';

/**
 * Premium tax-invoice layout — modelled on the EG Digital / Xero reference and
 * tuned for web, print (A4) and PDF export. Print styling is handled via the
 * `print:` utilities and @page in index.css.
 */
export function InvoicePreview({ invoice }: { invoice: Invoice }) {
  const c = invoice.customer;

  // Non-sensitive payment config (bank details, surcharge) — cached across views.
  const { data: pay } = useQuery({
    queryKey: ['public-payment-settings'],
    queryFn: settingsApi.publicPayment,
    staleTime: 5 * 60 * 1000,
  });

  // Issuing entity. Editable from Settings and stored in the database; the
  // build-time brand constants are only the fallback while it loads.
  const { data: org } = useQuery({
    queryKey: ['public-organisation'],
    queryFn: settingsApi.publicOrganisation,
    staleTime: 5 * 60 * 1000,
  });

  const seller = {
    legalName: org?.legalName || org?.companyName || brand.seller.legalName,
    addressLines: org
      ? [
          org.addressLine1,
          org.addressLine2,
          [org.city, org.state, org.postcode].filter(Boolean).join(' '),
          org.country,
        ].filter((l): l is string => !!l && l.trim().length > 0)
      : brand.seller.addressLines,
    abn: org?.abn || brand.seller.abn,
    billingEmail: org?.billingEmail || brand.seller.billingEmail,
    disputeWindowDays: org?.disputeWindowDays ?? brand.seller.disputeWindowDays,
  };

  const total = Number(invoice.total);
  const paid = Number(invoice.amountPaid);
  const amountDue = Math.max(total - paid, 0);

  const customerName = c?.companyName || c?.contactPerson || c?.clientId || '—';
  const customerEmail = c?.billingEmail || c?.contactEmail;
  const gstRate = invoice.items?.[0]?.taxRate ? Number(invoice.items[0].taxRate) : 10;
  const payUrl = invoice.paymentUrl ?? undefined;

  return (
    <div className="invoice-sheet mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-white shadow-card print:rounded-none print:border-0 print:shadow-none">
      {/* Top accent hairline */}
      <div
        className="h-1.5 w-full"
        style={{ background: `linear-gradient(90deg, ${brand.colors.navy}, ${brand.colors.green})` }}
      />

      <div className="p-8 sm:p-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1
              className="text-[26px] font-bold leading-none tracking-tight"
              style={{ color: brand.colors.navy }}
            >
              Tax Invoice
            </h1>
            <div className="mt-2">
              <InvoiceBadge status={invoice.status} />
            </div>
          </div>
          <div className="text-right">
            <Logo className="text-2xl" />
          </div>
        </div>

        {/* Parties */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="text-[13px] leading-relaxed">
            <p className="font-semibold text-foreground">{customerName}</p>
            {c?.abn && <p className="text-muted-foreground">ABN {formatAbn(c.abn)}</p>}
            {customerEmail && <p className="text-muted-foreground">{customerEmail}</p>}
            {c?.contactMobile && (
              <p className="text-muted-foreground">{formatPhone(c.contactMobile, c.contactMobileCountry)}</p>
            )}
            {c?.clientId && <p className="mt-1 text-xs text-muted-foreground">Client {c.clientId}</p>}
          </div>
          <div className="text-[13px] leading-relaxed sm:text-right">
            <p className="font-semibold text-foreground">{seller.legalName}</p>
            {seller.addressLines.map((line) => (
              <p key={line} className="text-muted-foreground">
                {line}
              </p>
            ))}
            <p className="text-muted-foreground">ABN {formatAbn(seller.abn) || seller.abn}</p>
          </div>
        </div>

        {/* Key figures strip */}
        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-6 sm:grid-cols-5">
          <Figure label="Amount due">
            <span className="text-xl font-bold tabular-nums" style={{ color: brand.colors.navy }}>
              {formatCurrency(amountDue)}
            </span>
          </Figure>
          <Figure label="Due date">
            <span className="text-xl font-bold tabular-nums" style={{ color: brand.colors.navy }}>
              {formatDate(invoice.dueDate)}
            </span>
          </Figure>
          <Figure label="Issue date">
            <span className="text-sm font-medium">{formatDate(invoice.invoiceDate)}</span>
          </Figure>
          <Figure label="Invoice number">
            <span className="font-mono text-sm font-medium">{invoice.invoiceNumber}</span>
          </Figure>
          <Figure label="Reference">
            <span className="text-sm font-medium">{invoice.reference || '—'}</span>
          </Figure>
        </div>

        {/* Pay online */}
        {payUrl && (
          <a
            href={payUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex text-sm font-semibold text-[#2563eb] hover:underline print:no-underline"
          >
            View and pay online
          </a>
        )}

        {/* Line items */}
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2.5 pr-3 text-left font-semibold">Description</th>
              <th className="px-3 py-2.5 text-right font-semibold">Quantity</th>
              <th className="px-3 py-2.5 text-right font-semibold">Price</th>
              <th className="px-3 py-2.5 text-right font-semibold">Tax</th>
              <th className="py-2.5 pl-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoice.items?.map((it) => (
              <tr key={it.id} className="align-top">
                <td className="py-3 pr-3">
                  <p className="font-medium text-foreground">{it.description}</p>
                  {it.sku && <p className="mt-0.5 text-xs text-muted-foreground">{it.sku}</p>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{it.quantity}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(it.unitPrice)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {Number(it.taxRate) ? `${Number(it.taxRate)}%` : '—'}
                </td>
                <td className="py-3 pl-3 text-right font-medium tabular-nums">
                  {formatCurrency(it.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Payment + totals */}
        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
          {/* Left — pay online + bank transfer */}
          <div className="space-y-5">
            {invoice.paymentQrUrl && (
              <div className="flex items-start gap-4">
                {payUrl ? (
                  <a href={payUrl} target="_blank" rel="noreferrer" title="Open secure payment page">
                    <img
                      src={invoice.paymentQrUrl}
                      alt="Scan to pay"
                      className="h-24 w-24 rounded-lg border border-border transition-shadow hover:shadow-md"
                    />
                  </a>
                ) : (
                  <img
                    src={invoice.paymentQrUrl}
                    alt="Scan to pay"
                    className="h-24 w-24 rounded-lg border border-border"
                  />
                )}
                <div>
                  {payUrl ? (
                    <a
                      href={payUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-[#2563eb] hover:underline print:no-underline"
                    >
                      View and pay online
                    </a>
                  ) : (
                    <p className="text-sm font-semibold text-foreground">Scan to pay</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">Scan the QR or tap a card to pay</p>
                  {(!pay || pay.cardPaymentsEnabled) && (
                    <div className="mt-3">
                      <CardMarks href={payUrl} />
                    </div>
                  )}
                  {pay && pay.cardSurchargePct > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      A {pay.cardSurchargePct}% surcharge applies to card payments.
                    </p>
                  )}
                </div>
              </div>
            )}

            {pay?.upiEnabled && pay.upiId && (
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Pay by UPI / Google Pay
                </p>
                <dl className="mt-1.5 space-y-0.5 text-xs">
                  <BankRow label="UPI ID" value={pay.upiId} />
                  <BankRow label="Reference" value={invoice.invoiceNumber} />
                </dl>
              </div>
            )}

            {pay?.bankTransferEnabled && (pay.accountNumber || pay.bsb) && (
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Or pay by bank transfer
                </p>

                <dl className="mt-1.5 space-y-0.5 text-xs">
                  {pay.accountName && <BankRow label="Account name" value={pay.accountName} />}
                  {pay.bankName && <BankRow label="Bank" value={pay.bankName} />}
                  {pay.bsb && <BankRow label="BSB" value={pay.bsb} />}
                  {pay.accountNumber && <BankRow label="Account no." value={pay.accountNumber} />}
                  <BankRow label="Reference" value={invoice.invoiceNumber} />
                </dl>
              </div>
            )}
          </div>

          {/* Right — totals */}
          <div className="sm:pl-6">
            <dl className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatCurrency(invoice.subtotal)} />
              {Number(invoice.tax) > 0 && (
                <Row
                  label={`GST ${gstRate}%`}
                  value={formatCurrency(invoice.tax)}
                  muted
                />
              )}
              {Number(invoice.discount) > 0 && (
                <Row label="Discount" value={`- ${formatCurrency(invoice.discount)}`} muted />
              )}
              <div className="flex items-center justify-between border-t border-border pt-3 text-[15px] font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(invoice.total)}</span>
              </div>
              {paid > 0 && (
                <Row label="Amount paid" value={`- ${formatCurrency(paid)}`} muted />
              )}
              <div
                className="mt-1 flex items-center justify-between rounded-lg px-3 py-2.5"
                style={{ background: `${brand.colors.navy}0a` }}
              >
                <span className="text-sm font-semibold">Amount due ({invoice.currency})</span>
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{ color: brand.colors.navy }}
                >
                  {formatCurrency(amountDue)}
                </span>
              </div>
            </dl>
          </div>
        </div>

        {/* Notes */}
        {pay?.payInstructions && (
          <p className="mt-8 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
            {pay.payInstructions}
          </p>
        )}
        {invoice.notes && (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{invoice.notes}</p>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Note — For any dispute on this invoice, please reach us at{' '}
          <span className="font-medium text-foreground">{seller.billingEmail}</span> within{' '}
          {seller.disputeWindowDays} days.
        </p>
      </div>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

function BankRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? 'text-muted-foreground' : 'text-foreground'}>{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

/** Accepted-card marks shown next to the pay-online link. Each is a pay link. */
function CardMarks({ href }: { href?: string }) {
  const base =
    'flex h-6 w-9 items-center justify-center rounded-md border border-border bg-white transition-shadow';
  const marks = [
    {
      key: 'visa',
      title: 'Pay with Visa',
      node: <span className="text-[9px] font-bold italic tracking-tight text-[#1A1F71]">VISA</span>,
    },
    {
      key: 'mc',
      title: 'Pay with Mastercard',
      node: (
        <svg viewBox="0 0 32 20" className="h-4 w-6" aria-hidden>
          <circle cx="13" cy="10" r="6" fill="#EB001B" />
          <circle cx="19" cy="10" r="6" fill="#F79E1B" fillOpacity="0.9" />
        </svg>
      ),
    },
    {
      key: 'amex',
      title: 'Pay with American Express',
      node: <span className="rounded-sm bg-[#2E77BC] px-1 text-[7px] font-bold text-white">AMEX</span>,
    },
    {
      key: 'gpay',
      title: 'Pay with Google Pay',
      node: (
        <span className="text-[9px] font-semibold text-foreground">
          <span className="text-[#4285F4]">G</span> Pay
        </span>
      ),
    },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {marks.map((m) =>
        href ? (
          <a
            key={m.key}
            href={href}
            target="_blank"
            rel="noreferrer"
            title={m.title}
            className={`${base} hover:shadow-md`}
          >
            {m.node}
          </a>
        ) : (
          <div key={m.key} className={base} title={m.title}>
            {m.node}
          </div>
        )
      )}
    </div>
  );
}
