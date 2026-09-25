import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { brand } from '@/config/brand';
import { Logo } from '@/components/layout/Logo';
import type { Invoice, InvoiceItem } from '@/types';
import { InvoiceBadge } from '@/components/shared/status';
import { settingsApi } from '@/api/resources';
import { formatCurrency, formatDate } from '@/lib/utils';
import { formatAbn, invoiceTermLabel } from '@/lib/customer';
import {
  computeProration,
  fmtDay,
  buildLicenceGroups,
  findLicenceGroup,
  licenceGroupNet,
  productUnits,
  productNet,
  round2,
  type LicenceGroup,
} from '@/lib/proration';
import { formatPhone } from '@/components/shared/PhoneInput';

/**
 * Tax-invoice layout, tuned for web, print (A4) and PDF export. Print styling is
 * handled via the `print:` utilities and @page in index.css.
 *
 * A dark hero carries the three facts that decide whether an invoice gets paid —
 * the amount, the day it is due and the day the next one arrives — so none of
 * them has to be hunted for. Everything that follows sits on white: the parties,
 * then the lines (product, SKU, qty/hours, agreed price, GST basis, amount), the
 * totals, and every payment method the business accepts.
 *
 * The brand navy-to-green gradient is the only decoration; structure comes from
 * spacing and hairline rules so the sheet still reads as a financial document.
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

  const { navy, green } = brand.colors;
  const total = Number(invoice.total);
  const paid = Number(invoice.amountPaid);
  const amountDue = Math.max(total - paid, 0);

  const customerName = c?.companyName || c?.contactPerson || c?.clientId || '—';
  const customerEmail = c?.billingEmail || c?.contactEmail;
  const gstRate = invoice.items?.[0]?.taxRate ? Number(invoice.items[0].taxRate) : 10;
  const payUrl = invoice.paymentUrl ?? undefined;

  // The service period this invoice covers: the invoice date up to the day before
  // the next billing date. Invoices raised before the billing cycle was split out
  // of the term carry no next billing date, so this falls back to the monthly
  // default (see lib/proration).
  const period = computeProration(
    invoice.invoiceDate?.slice(0, 10),
    invoice.nextBillingDate?.slice(0, 10) ?? undefined
  );

  // The customer's product assignments, grouped by licence key — the same source
  // the create and edit forms read, so a line breaks down into exactly the
  // products (with agreed price and Unit/Hours) that were selected on it.
  const licenceGroups = buildLicenceGroups(c?.customerProducts);

  const hasBank = !!pay?.bankTransferEnabled && !!(pay.accountNumber || pay.bsb);
  const hasUpi = !!pay?.upiEnabled && !!pay.upiId;
  const cardsOn = !pay || pay.cardPaymentsEnabled;

  return (
    <div className="invoice-sheet mx-auto w-full max-w-3xl overflow-hidden rounded-[20px] bg-white shadow-[0_18px_50px_-24px_rgba(11,34,59,0.35)] ring-1 ring-black/5 print:rounded-none print:shadow-none print:ring-0">
      {/* ── Hero: identity + the three facts that get an invoice paid ── */}
      <div
        className="relative overflow-hidden px-8 pb-8 pt-9 text-white sm:px-11"
        style={{
          background: `radial-gradient(120% 140% at 100% 0%, ${green}38 0%, transparent 55%), ${navy}`,
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact',
        }}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/50">
              Tax Invoice
            </p>
            <p className="mt-2 font-mono text-[19px] font-bold leading-none tracking-tight">
              {invoice.invoiceNumber}
            </p>
            {invoice.reference && (
              <p className="mt-1.5 text-[11px] text-white/50">Ref {invoice.reference}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2.5">
            <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
              <Logo className="text-xl" />
            </div>
            <InvoiceBadge status={invoice.status} />
          </div>
        </div>

        {/* The money row. Amount due is deliberately the largest thing on the page. */}
        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
              Amount due ({invoice.currency})
            </p>
            <p className="mt-1.5 text-[42px] font-bold leading-none tracking-tight tabular-nums">
              {formatCurrency(amountDue)}
            </p>
          </div>
          <div className="flex gap-8 sm:gap-10">
            <HeroFact label="Due date" value={formatDate(invoice.dueDate)}>
              {invoice.term ? invoiceTermLabel(invoice.term) : undefined}
            </HeroFact>
            <HeroFact
              label="Next billing"
              value={invoice.nextBillingDate ? formatDate(invoice.nextBillingDate) : '—'}
            >
              {period ? `${period.billedDays} of ${period.periodDays} days` : undefined}
            </HeroFact>
          </div>
        </div>
      </div>

      <div className="px-8 py-9 sm:px-11">
        {/* ── Parties ── */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div className="text-[12.5px] leading-relaxed text-muted-foreground">
            <Eyebrow>Bill to</Eyebrow>
            <p className="text-[15px] font-semibold text-foreground">{customerName}</p>
            {c?.abn && <p>ABN {formatAbn(c.abn)}</p>}
            {customerEmail && <p>{customerEmail}</p>}
            {c?.contactMobile && <p>{formatPhone(c.contactMobile, c.contactMobileCountry)}</p>}
            {c?.clientId && <p className="mt-1 text-muted-foreground/70">Client {c.clientId}</p>}
          </div>
          <div className="text-[12.5px] leading-relaxed text-muted-foreground sm:text-right">
            <Eyebrow>From</Eyebrow>
            <p className="text-[15px] font-semibold text-foreground">{seller.legalName}</p>
            {seller.addressLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p>ABN {formatAbn(seller.abn) || seller.abn}</p>
            <p className="mt-1 text-muted-foreground/70">Issued {formatDate(invoice.invoiceDate)}</p>
          </div>
        </div>

        {/* ── Billing period — scopes the lines below ── */}
        {period && (
          <div
            className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-4 py-3 text-[12px]"
            style={{ background: `${navy}0a` }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              Billing period
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {fmtDay(period.start)} – {fmtDay(period.end)}
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span className="tabular-nums text-muted-foreground">
              {period.billedDays} of {period.periodDays} days billed
            </span>
          </div>
        )}

        {/* ── Line items ── */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-[13px]">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-[0.1em] text-white">
                <Th className="rounded-l-lg pl-3.5 text-left" navy={navy}>
                  Product
                </Th>
                <Th className="text-left" navy={navy}>
                  SKU
                </Th>
                <Th className="text-right" navy={navy}>
                  Qty / Hours
                </Th>
                <Th className="text-right" navy={navy}>
                  Agreed price
                </Th>
                <Th className="text-center" navy={navy}>
                  GST
                </Th>
                <Th className="rounded-r-lg pr-3.5 text-right" navy={navy}>
                  Amount
                </Th>
              </tr>
            </thead>
            <tbody>
              {invoice.items?.map((it, lineIndex) => (
                <LineRows
                  key={it.id}
                  item={it}
                  group={groupForItem(licenceGroups, it)}
                  first={lineIndex === 0}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Totals ── */}
        <div className="mt-7 flex justify-end">
          <dl className="w-full space-y-2 text-[13px] sm:w-[19.5rem]">
            <Row label="Subtotal" value={formatCurrency(invoice.subtotal)} />
            {Number(invoice.tax) > 0 && (
              <Row label={`GST ${gstRate}%`} value={formatCurrency(invoice.tax)} muted />
            )}
            {Number(invoice.discount) > 0 && (
              <Row label="Discount" value={`- ${formatCurrency(invoice.discount)}`} muted />
            )}
            <div className="flex items-center justify-between border-t border-border pt-2.5 text-[15px] font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(invoice.total)}</span>
            </div>
            {paid > 0 && <Row label="Amount paid" value={`- ${formatCurrency(paid)}`} muted />}
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3 text-white"
              style={{ background: navy, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
            >
              <span className="text-[12px] font-semibold uppercase tracking-wide text-white/70">
                Amount due
              </span>
              <span className="text-[20px] font-bold tabular-nums">{formatCurrency(amountDue)}</span>
            </div>
          </dl>
        </div>

        {/* ── How to pay — every method the business accepts ── */}
        <div className="mt-9">
          <div className="flex items-center gap-3">
            <Eyebrow className="mb-0">How to pay</Eyebrow>
            <span className="h-px flex-1" style={{ background: `${navy}1a` }} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(payUrl || invoice.paymentQrUrl || cardsOn) && (
              <PayCard title="Pay online" accent={green}>
                <div className="flex items-start gap-3.5">
                  {invoice.paymentQrUrl &&
                    (payUrl ? (
                      <a href={payUrl} target="_blank" rel="noreferrer" title="Open secure payment page">
                        <img
                          src={invoice.paymentQrUrl}
                          alt="Scan to pay"
                          className="h-[82px] w-[82px] rounded-lg bg-white ring-1 ring-black/10 transition-shadow hover:shadow-md"
                        />
                      </a>
                    ) : (
                      <img
                        src={invoice.paymentQrUrl}
                        alt="Scan to pay"
                        className="h-[82px] w-[82px] rounded-lg bg-white ring-1 ring-black/10"
                      />
                    ))}
                  <div className="min-w-0">
                    {payUrl ? (
                      <a
                        href={payUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12.5px] font-semibold text-[#2563eb] hover:underline print:no-underline"
                      >
                        View and pay online
                      </a>
                    ) : (
                      <p className="text-[12.5px] font-semibold text-foreground">Scan to pay</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Scan the QR or tap a card
                    </p>
                    {cardsOn && (
                      <div className="mt-2.5">
                        <CardMarks href={payUrl} />
                      </div>
                    )}
                    {pay && pay.cardSurchargePct > 0 && (
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        {pay.cardSurchargePct}% surcharge on card payments.
                      </p>
                    )}
                  </div>
                </div>
              </PayCard>
            )}

            {hasUpi && (
              <PayCard title="UPI / Google Pay" accent={green}>
                <dl className="space-y-1 text-[12px]">
                  <BankRow label="UPI ID" value={pay!.upiId!} />
                  <BankRow label="Reference" value={invoice.invoiceNumber} />
                </dl>
              </PayCard>
            )}

            {hasBank && (
              <PayCard title="Bank transfer" accent={green}>
                <dl className="space-y-1 text-[12px]">
                  {pay!.accountName && <BankRow label="Account name" value={pay!.accountName} />}
                  {pay!.bankName && <BankRow label="Bank" value={pay!.bankName} />}
                  {pay!.bsb && <BankRow label="BSB" value={pay!.bsb} />}
                  {pay!.accountNumber && <BankRow label="Account no." value={pay!.accountNumber} />}
                  <BankRow label="Reference" value={invoice.invoiceNumber} />
                </dl>
              </PayCard>
            )}
          </div>
        </div>

        {/* ── Notes ── */}
        {pay?.payInstructions && (
          <p className="mt-7 text-[11.5px] leading-relaxed text-muted-foreground">{pay.payInstructions}</p>
        )}
        {invoice.notes && (
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">{invoice.notes}</p>
        )}
        <p className="mt-6 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
          For any dispute on this invoice, please reach us at{' '}
          <span className="font-medium text-foreground">{seller.billingEmail}</span> within{' '}
          {seller.disputeWindowDays} days.
        </p>
      </div>

      {/* Bottom brand rule */}
      <div
        className="h-1.5 w-full"
        style={{
          background: `linear-gradient(90deg, ${navy}, ${green})`,
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact',
        }}
      />
    </div>
  );
}

/**
 * The licence group an invoice line bills.
 *
 * A line carries its licence number as its sku, which is how the forms identify a
 * group, so match on that first and fall back to the representative product the
 * line was built from.
 */
function groupForItem(groups: LicenceGroup[], item: InvoiceItem): LicenceGroup | undefined {
  if (item.sku) {
    const byLicence = groups.find((g) => g.licenceKey && g.licenceKey === item.sku);
    if (byLicence) return byLicence;
  }
  return findLicenceGroup(groups, item.productId);
}

/**
 * The rows one invoice line produces.
 *
 * A line can bill a whole licence group, so it expands into one row per product —
 * the same breakdown the create and edit forms show while the invoice is being
 * built: each product's name, its SKU, its Unit/Hours, its agreed price and the
 * net it contributes.
 *
 * The values come from the line's own snapshot (`item.products`), taken when the
 * invoice was issued, so a later change to an agreed price cannot rewrite a sent
 * invoice. Invoices issued before that snapshot existed have none, and fall back
 * to the customer's current assignments — the best available reading of a
 * historical line. A line with neither (a manually typed one) stays a single row
 * built from what the line itself stores.
 */
interface ProductRow {
  key: string;
  name: string;
  sku?: string | null;
  unit?: string | null;
  units: number;
  agreedPrice: number;
  amount: number;
}

function LineRows({
  item,
  group,
  first,
}: {
  item: InvoiceItem;
  group?: LicenceGroup;
  first: boolean;
}) {
  const gst = (
    <>
      <p className="font-medium tabular-nums text-foreground">
        {Number(item.taxRate) ? `${Number(item.taxRate)}%` : '—'}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {item.gstType === 'INCLUSIVE' ? 'Inclusive' : 'Exclusive'}
      </p>
    </>
  );
  const topRule = first ? '' : 'border-t border-border';

  // Prefer the snapshot the invoice was issued with; otherwise read the
  // customer's current assignments (invoices predating the snapshot).
  const snapshot = item.products ?? [];
  const rows: ProductRow[] = snapshot.length
    ? snapshot.map((p) => ({
        key: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        units: p.unitHours != null ? Number(p.unitHours) || 0 : 1,
        agreedPrice: Number(p.agreedPrice) || 0,
        amount: Number(p.amount) || 0,
      }))
    : buildFromAssignments(item, group);
  const licenceKey = item.sku || group?.licenceKey || '';

  // Nothing identifiable behind this line — show what the line itself holds.
  if (rows.length === 0) {
    const names = (item.description ?? '')
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean);
    return (
      <tr className={`align-top ${topRule}`}>
        <td className="py-3.5 pl-3.5 pr-3">
          <p className="font-semibold leading-snug text-foreground">
            {names[0] || item.product?.name || '—'}
          </p>
          {names.slice(1).map((n, i) => (
            <p key={`${n}-${i}`} className="leading-snug text-muted-foreground">
              {n}
            </p>
          ))}
        </td>
        <td className="px-3 py-3.5">
          <Sku>{item.product?.sku || item.product?.productCode || item.sku}</Sku>
        </td>
        <td className="px-3 py-3.5 text-right font-medium tabular-nums">{item.quantity}</td>
        <td className="px-3 py-3.5 text-right tabular-nums">{formatCurrency(item.unitPrice)}</td>
        <td className="px-3 py-3.5 text-center">{gst}</td>
        <td className="py-3.5 pl-3 pr-3.5 text-right font-semibold tabular-nums text-foreground">
          {formatCurrency(item.lineTotal)}
        </td>
      </tr>
    );
  }

  return (
    <>
      {/* Group header — the licence these products share, and the line's terms. */}
      <tr className={topRule}>
        <td colSpan={6} className="pb-1.5 pl-3.5 pr-3.5 pt-3.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px]">
            {licenceKey && (
              <>
                <span className="font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                  Licence
                </span>
                <span className="font-mono font-semibold text-foreground">{licenceKey}</span>
              </>
            )}
            {rows.length > 1 && (
              <span className="text-muted-foreground">
                {licenceKey && <span className="mr-2.5 text-muted-foreground/40">·</span>}
                {rows.length} products
              </span>
            )}
            {item.contractType === 'TRIAL' && (
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-amber-700">
                Trial
              </span>
            )}
          </div>
        </td>
      </tr>
      {rows.map((r, i) => (
        <tr key={r.key} className="align-top">
          <td className="pb-3 pl-3.5 pr-3">
            <p className="font-semibold leading-snug text-foreground">{r.name}</p>
            {r.unit && <p className="text-[10.5px] text-muted-foreground">per {r.unit}</p>}
          </td>
          <td className="px-3 pb-3">
            <Sku>{r.sku}</Sku>
          </td>
          <td className="px-3 pb-3 text-right font-medium tabular-nums">{r.units}</td>
          <td className="px-3 pb-3 text-right tabular-nums">{formatCurrency(r.agreedPrice)}</td>
          <td className="px-3 pb-3 text-center">{i === 0 ? gst : null}</td>
          <td className="pb-3 pl-3 pr-3.5 text-right font-semibold tabular-nums text-foreground">
            {formatCurrency(r.amount)}
          </td>
        </tr>
      ))}
    </>
  );
}

/**
 * Rows derived from the customer's current product assignments, for an invoice
 * issued before lines carried their own snapshot. Each product takes a share of
 * the line by its agreed net, and the last row absorbs the rounding, so the rows
 * still sum to exactly what the line bills.
 */
function buildFromAssignments(item: InvoiceItem, group?: LicenceGroup): ProductRow[] {
  if (!group || group.items.length === 0) return [];
  const lineTotal = Number(item.lineTotal) || 0;
  const base = licenceGroupNet(group);
  const products = group.items;
  const amounts = products.map((cp, i) =>
    i === products.length - 1
      ? 0
      : round2(base > 0 ? (lineTotal * productNet(cp)) / base : lineTotal / products.length)
  );
  amounts[products.length - 1] = round2(lineTotal - amounts.reduce((s, n) => s + n, 0));

  return products.map((cp, i) => ({
    key: cp.id,
    name: cp.product.name,
    sku: cp.product.sku || cp.product.productCode,
    unit: cp.unit,
    units: productUnits(cp),
    agreedPrice: Number(cp.price) || 0,
    amount: amounts[i],
  }));
}

/** A product code in the SKU column. */
function Sku({ children }: { children?: string | null }) {
  return <span className="font-mono text-[11.5px] text-muted-foreground">{children || '—'}</span>;
}

/** A table heading cell on the navy header band. */
function Th({
  children,
  className,
  navy,
}: {
  children: ReactNode;
  className?: string;
  navy: string;
}) {
  return (
    <th
      className={`px-3 py-2.5 font-semibold ${className ?? ''}`}
      style={{ background: navy, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      {children}
    </th>
  );
}

/** A supporting fact beside the amount in the hero. */
function HeroFact({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">{label}</p>
      <p className="mt-1.5 text-[15px] font-semibold tabular-nums">{value}</p>
      {children && <p className="mt-0.5 text-[10.5px] text-white/50">{children}</p>}
    </div>
  );
}

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70 ${
        className ?? 'mb-1.5'
      }`}
    >
      {children}
    </p>
  );
}

/** One payment method, as a soft card with an accent edge. */
function PayCard({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/25 p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className="h-3.5 w-1 rounded-full"
          style={{ background: accent, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
        />
        <p className="text-[11.5px] font-semibold text-foreground">{title}</p>
      </div>
      {children}
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
