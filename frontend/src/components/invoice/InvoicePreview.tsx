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
 * Every section is a soft tinted panel, so the sheet stays light throughout —
 * nothing is reversed out of a dark block, which keeps it cheap to print and easy
 * to read. Hierarchy comes from one accent (the brand navy), panel tints and type
 * size: the amount due sits in its own panel beside the customer as the largest
 * figure on the page, with the due date and payment term under it.
 *
 * Lines break down per product — product, SKU, qty/hours, agreed price, its own
 * GST basis and amount — read from the snapshot the invoice was issued with.
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
  // Borders pick up the brand colours at low alpha, so the panels read as one
  // family instead of neutral grey boxes. Navy for structure, green for payment.
  const edge = `${navy}2e`;
  const edgeSoft = `${navy}1f`;
  const edgeStrong = `${navy}47`;
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

  // The customer's product assignments, grouped by licence key — used only for
  // invoices issued before lines carried their own per-product snapshot.
  const licenceGroups = buildLicenceGroups(c?.customerProducts);

  const hasBank = !!pay?.bankTransferEnabled && !!(pay.accountNumber || pay.bsb);
  const hasUpi = !!pay?.upiEnabled && !!pay.upiId;
  const cardsOn = !pay || pay.cardPaymentsEnabled;

  return (
    <div
      className="invoice-sheet mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border bg-white shadow-card print:rounded-none print:shadow-none"
      style={{ borderColor: edge, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      <div className="px-7 py-8 sm:px-10 sm:py-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <Logo className="text-2xl" />
          </div>
          <div className="sm:text-right">
            <p
              className="text-[13px] font-bold uppercase tracking-[0.22em]"
              style={{ color: navy }}
            >
              Tax Invoice
            </p>
            <p className="mt-1 font-mono text-[15px] font-semibold text-foreground">
              {invoice.invoiceNumber}
            </p>
            <div className="mt-2 sm:flex sm:justify-end">
              <InvoiceBadge status={invoice.status} />
            </div>
          </div>
        </div>

        {/* ── Bill to · Amount due ── */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-5">
          <Panel className="sm:col-span-3" border={edgeSoft}>
            <PanelLabel>Bill to</PanelLabel>
            <p className="text-[15px] font-semibold text-foreground">{customerName}</p>
            <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {c?.abn && <p>ABN {formatAbn(c.abn)}</p>}
              {customerEmail && <p>{customerEmail}</p>}
              {c?.contactMobile && <p>{formatPhone(c.contactMobile, c.contactMobileCountry)}</p>}
              {c?.clientId && <p className="mt-0.5 text-muted-foreground/70">Client {c.clientId}</p>}
            </div>
          </Panel>

          <Panel className="sm:col-span-2" tint={`${navy}0d`} border={edgeStrong}>
            <PanelLabel>Amount due ({invoice.currency})</PanelLabel>
            {/* The largest figure on the page, by design. */}
            <p
              className="text-[30px] font-bold leading-none tracking-tight tabular-nums"
              style={{ color: navy }}
            >
              {formatCurrency(amountDue)}
            </p>
            <p className="mt-2.5 text-[12.5px] text-muted-foreground">
              Due <span className="font-semibold text-foreground">{formatDate(invoice.dueDate)}</span>
            </p>
            {invoice.term && (
              <p className="text-[12px] text-muted-foreground">{invoiceTermLabel(invoice.term)}</p>
            )}
          </Panel>
        </div>

        {/* ── Issuer · billing cycle ── */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-5">
          <Panel className="sm:col-span-2" border={edgeSoft}>
            <PanelLabel>From</PanelLabel>
            <p className="text-[13px] font-semibold text-foreground">{seller.legalName}</p>
            <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              {seller.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>ABN {formatAbn(seller.abn) || seller.abn}</p>
            </div>
          </Panel>

          <Panel className="sm:col-span-3" border={edgeSoft}>
            <PanelLabel>Billing cycle</PanelLabel>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
              <Fact label="Issue date">{formatDate(invoice.invoiceDate)}</Fact>
              <Fact label="Reference">{invoice.reference || '—'}</Fact>
              <Fact label="Billing period">
                {period ? `${fmtDay(period.start)} – ${fmtDay(period.end)}` : '—'}
              </Fact>
              <Fact label="Days billed">
                {period ? `${period.billedDays} of ${period.periodDays}` : '—'}
              </Fact>
              <Fact label="Next billing date" accent={navy}>
                {invoice.nextBillingDate ? formatDate(invoice.nextBillingDate) : '—'}
              </Fact>
            </dl>
          </Panel>
        </div>

        {/* ── Line items ── */}
        <div
          className="mt-4 overflow-hidden rounded-xl border"
          style={{ borderColor: edge, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-[13px]">
              <thead>
                <tr
                  className="border-b text-[9.5px] uppercase tracking-[0.1em]"
                  style={{
                    background: `${navy}0f`,
                    borderColor: edge,
                    color: navy,
                    printColorAdjust: 'exact',
                    WebkitPrintColorAdjust: 'exact',
                  }}
                >
                  <th className="py-2.5 pl-4 pr-3 text-left font-semibold">Product</th>
                  <th className="px-3 py-2.5 text-left font-semibold">SKU</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Qty / Hours</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Agreed price</th>
                  <th className="px-3 py-2.5 text-center font-semibold">GST</th>
                  <th className="py-2.5 pl-3 pr-4 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: edgeSoft }}>
                {invoice.items?.map((it) => (
                  <LineRows key={it.id} item={it} group={groupForItem(licenceGroups, it)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── How to pay · totals ───────────────────────────────
            Side by side: the payment methods fill the width the totals column
            leaves over, so nothing sits in dead space below. */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-5">
          <div className="sm:col-span-3">
            <PanelLabel className="mb-2">How to pay</PanelLabel>
            <div className="space-y-3">
              {(payUrl || invoice.paymentQrUrl || cardsOn) && (
                <PayCard title="Pay online" accent={green} border={`${green}52`}>
                  <div className="flex items-start gap-3.5">
                    {invoice.paymentQrUrl &&
                      (payUrl ? (
                        <a href={payUrl} target="_blank" rel="noreferrer" title="Open secure payment page">
                          <img
                            src={invoice.paymentQrUrl}
                            alt="Scan to pay"
                            className="h-[78px] w-[78px] rounded-lg bg-white ring-1 ring-black/10 transition-shadow hover:shadow-md"
                          />
                        </a>
                      ) : (
                        <img
                          src={invoice.paymentQrUrl}
                          alt="Scan to pay"
                          className="h-[78px] w-[78px] rounded-lg bg-white ring-1 ring-black/10"
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
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Scan the QR or tap a card</p>
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

              {/* Short detail cards pair up so the column does not run long. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {hasUpi && (
                  <PayCard title="UPI / Google Pay" accent={green} border={`${green}52`}>
                    <dl className="space-y-1 text-[12px]">
                      <BankRow label="UPI ID" value={pay!.upiId!} />
                      <BankRow label="Reference" value={invoice.invoiceNumber} />
                    </dl>
                  </PayCard>
                )}

                {hasBank && (
                  <PayCard title="Bank transfer" accent={green} border={`${green}52`}>
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
          </div>

          <div className="sm:col-span-2">
            <Panel border={edgeSoft}>
              <dl className="space-y-2 text-[13px]">
                <Row label="Subtotal" value={formatCurrency(invoice.subtotal)} />
                {Number(invoice.tax) > 0 && (
                  <Row label={`GST ${gstRate}%`} value={formatCurrency(invoice.tax)} muted />
                )}
                {Number(invoice.discount) > 0 && (
                  <Row label="Discount" value={`- ${formatCurrency(invoice.discount)}`} muted />
                )}
                <div
                  className="flex items-center justify-between border-t pt-2.5 text-[14px] font-semibold"
                  style={{ borderColor: edge }}
                >
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(invoice.total)}</span>
                </div>
                {paid > 0 && <Row label="Amount paid" value={`- ${formatCurrency(paid)}`} muted />}
                <div
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                  style={{
                    background: `${navy}0d`,
                    borderColor: edgeStrong,
                    printColorAdjust: 'exact',
                    WebkitPrintColorAdjust: 'exact',
                  }}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Amount due
                  </span>
                  <span className="text-[18px] font-bold tabular-nums" style={{ color: navy }}>
                    {formatCurrency(amountDue)}
                  </span>
                </div>
              </dl>
            </Panel>
          </div>
        </div>

        {/* ── Notes ── */}
        {pay?.payInstructions && (
          <p className="mt-6 text-[11.5px] leading-relaxed text-muted-foreground">{pay.payInstructions}</p>
        )}
        {invoice.notes && (
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">{invoice.notes}</p>
        )}
        <p
          className="mt-5 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground"
          style={{ borderColor: edgeSoft }}
        >
          For any dispute on this invoice, please reach us at{' '}
          <span className="font-medium text-foreground">{seller.billingEmail}</span> within{' '}
          {seller.disputeWindowDays} days.
        </p>
      </div>
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

interface ProductRow {
  key: string;
  name: string;
  sku?: string | null;
  unit?: string | null;
  units: number;
  agreedPrice: number;
  /** This product's own GST rate and basis, falling back to the line's. */
  taxRate: number;
  inclusive: boolean;
  amount: number;
}

/**
 * The rows one invoice line produces.
 *
 * A line can bill a whole licence group, so it expands into one row per product —
 * the same breakdown the create and edit forms show while the invoice is being
 * built: each product's name, SKU, Unit/Hours, agreed price, its own GST and the
 * net it contributes.
 *
 * The values come from the line's own snapshot (`item.products`), taken when the
 * invoice was issued, so a later change to an agreed price cannot rewrite a sent
 * invoice. Invoices issued before that snapshot existed have none, and fall back
 * to the customer's current assignments — the best available reading of a
 * historical line. A line with neither (a manually typed one) stays a single row
 * built from what the line itself stores.
 */
function LineRows({ item, group }: { item: InvoiceItem; group?: LicenceGroup }) {
  const lineRate = Number(item.taxRate) || 0;
  const lineInclusive = item.gstType === 'INCLUSIVE';

  const snapshot = item.products ?? [];
  const rows: ProductRow[] = snapshot.length
    ? snapshot.map((p) => ({
        key: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        units: p.unitHours != null ? Number(p.unitHours) || 0 : 1,
        agreedPrice: Number(p.agreedPrice) || 0,
        taxRate: p.taxRate != null ? Number(p.taxRate) || 0 : lineRate,
        inclusive: p.gstType ? p.gstType === 'INCLUSIVE' : lineInclusive,
        amount: Number(p.amount) || 0,
      }))
    : buildFromAssignments(item, group, lineRate, lineInclusive);
  const licenceKey = item.sku || group?.licenceKey || '';

  // Nothing identifiable behind this line — show what the line itself holds.
  if (rows.length === 0) {
    const names = (item.description ?? '')
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean);
    return (
      <tr className="align-top">
        <td className="py-3.5 pl-4 pr-3">
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
        <td className="px-3 py-3.5 text-center">
          <GstCell rate={lineRate} inclusive={lineInclusive} />
        </td>
        <td className="py-3.5 pl-3 pr-4 text-right font-semibold tabular-nums text-foreground">
          {formatCurrency(item.lineTotal)}
        </td>
      </tr>
    );
  }

  return (
    <>
      {/* The licence these products share, and the line's contract term. */}
      {(licenceKey || item.contractType === 'TRIAL') && (
        <tr>
          <td colSpan={6} className="pb-1 pl-4 pr-4 pt-3">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px]">
              {licenceKey && (
                <>
                  <span className="font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                    Licence
                  </span>
                  <span className="font-mono font-semibold text-foreground">{licenceKey}</span>
                </>
              )}
              {item.contractType === 'TRIAL' && (
                <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-amber-700">
                  Trial
                </span>
              )}
            </div>
          </td>
        </tr>
      )}
      {rows.map((r) => (
        <tr key={r.key} className="align-top">
          <td className="pb-3 pl-4 pr-3">
            <p className="font-semibold leading-snug text-foreground">{r.name}</p>
            {r.unit && <p className="text-[10.5px] text-muted-foreground">per {r.unit}</p>}
          </td>
          <td className="px-3 pb-3">
            <Sku>{r.sku}</Sku>
          </td>
          <td className="px-3 pb-3 text-right font-medium tabular-nums">{r.units}</td>
          <td className="px-3 pb-3 text-right tabular-nums">{formatCurrency(r.agreedPrice)}</td>
          <td className="px-3 pb-3 text-center">
            <GstCell rate={r.taxRate} inclusive={r.inclusive} />
          </td>
          <td className="pb-3 pl-3 pr-4 text-right font-semibold tabular-nums text-foreground">
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
function buildFromAssignments(
  item: InvoiceItem,
  group: LicenceGroup | undefined,
  lineRate: number,
  lineInclusive: boolean
): ProductRow[] {
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
    taxRate: cp.taxRate != null ? Number(cp.taxRate) || 0 : lineRate,
    inclusive: cp.gstType ? cp.gstType === 'INCLUSIVE' : lineInclusive,
    amount: amounts[i],
  }));
}

/** A product's GST: its rate, and whether its price already contains it. */
function GstCell({ rate, inclusive }: { rate: number; inclusive: boolean }) {
  return (
    <>
      <p className="font-medium tabular-nums text-foreground">{rate ? `${rate}%` : '—'}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {inclusive ? 'Inclusive' : 'Exclusive'}
      </p>
    </>
  );
}

/** A product code in the SKU column. */
function Sku({ children }: { children?: string | null }) {
  return <span className="font-mono text-[11.5px] text-muted-foreground">{children || '—'}</span>;
}

/** A soft tinted section panel — the sheet's only structural device. */
function Panel({
  children,
  className,
  tint,
  border,
}: {
  children: ReactNode;
  className?: string;
  tint?: string;
  border?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${className ?? ''}`}
      style={{
        background: tint ?? 'rgb(248 250 252)',
        borderColor: border,
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      }}
    >
      {children}
    </div>
  );
}

function PanelLabel({ children, className }: { children: ReactNode; className?: string }) {
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

/** A labelled fact inside the billing-cycle panel. */
function Fact({
  label,
  children,
  accent,
}: {
  label: string;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd
        className="font-semibold tabular-nums text-foreground"
        style={accent ? { color: accent } : undefined}
      >
        {children}
      </dd>
    </div>
  );
}

/** One payment method, as a soft card with an accent edge. */
function PayCard({
  title,
  accent,
  border,
  children,
}: {
  title: string;
  accent: string;
  border?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border bg-slate-50 p-4"
      style={{ borderColor: border, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
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
