import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import {
  billingApi,
  type AdminInvoice,
  type AdminInvoiceItem,
  type OrganisationSettings,
  type PublicPaymentSettings,
} from '../../api/admin/billing';
import { INVOICE_STATUS } from './shared';
import {
  buildLicenceGroups,
  computeProration,
  discountedPrice,
  findLicenceGroup,
  fmtDay,
  invoiceTermLabel,
  licenceGroupNet,
  productNet,
  productUnits,
  round2,
  type LicenceGroup,
} from './proration';

/**
 * The printable tax invoice — the same content and layout as the web's
 * `components/invoice/InvoicePreview.tsx` (header, bill to, amount due, from,
 * billing cycle, per-product lines, how to pay, totals, notes, dispute note),
 * rendered to HTML for expo-print. A4 portrait.
 */

const NAVY = '#0B223B';
const GREEN = '#34B98C';
const A4 = { width: 595, height: 842 };

// Fallback issuer while the organisation settings can't be read (web brand.seller).
const SELLER = {
  legalName: 'EG Eloma',
  addressLines: ['71 Gipps Street', 'Collingwood VIC 3066'],
  abn: '76 593 175 012',
  disputeEmail: 'connect@egeloma.com.au',
  disputeWindowDays: 10,
};

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtMoney = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? Number(v) : (v ?? 0);
  const x = Number.isFinite(n) ? n : 0;
  const s = Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${x < 0 ? '-' : ''}$${s}`;
};

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const formatAbn = (v?: string | null) => (v ? v.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4') : '');

const DIAL: Record<string, string> = { AU: '+61', NZ: '+64', GB: '+44', US: '+1', IN: '+91' };
const formatPhone = (n?: string | null, country?: string | null) =>
  n ? `${DIAL[(country || 'AU').toUpperCase()] ?? '+61'} ${n.replace(/\D/g, '')}` : '';

/** Linkify plain text (notes) safely. */
const linkify = (t: string) =>
  esc(t)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, '<br>');

// ─── Line rows (snapshot → assignments → the line itself) ─────────────

interface ProductRow {
  name: string;
  sku?: string | null;
  unit?: string | null;
  units: number;
  agreedPrice: number;
  taxRate: number;
  inclusive: boolean;
  amount: number;
}

function buildFromAssignments(item: AdminInvoiceItem, group: LicenceGroup | undefined, lineRate: number, lineInclusive: boolean): ProductRow[] {
  if (!group || group.items.length === 0) return [];
  const lineTotal = Number(item.lineTotal) || 0;
  const base = licenceGroupNet(group);
  const products = group.items;
  const amounts = products.map((cp, i) =>
    i === products.length - 1 ? 0 : round2(base > 0 ? (lineTotal * productNet(cp)) / base : lineTotal / products.length)
  );
  amounts[products.length - 1] = round2(lineTotal - amounts.reduce((s, n) => s + n, 0));
  return products.map((cp, i) => ({
    name: cp.product.name,
    sku: cp.product.sku || cp.product.productCode,
    unit: cp.unit,
    units: productUnits(cp),
    agreedPrice: discountedPrice(cp),
    taxRate: cp.taxRate != null ? Number(cp.taxRate) || 0 : lineRate,
    inclusive: cp.gstType ? cp.gstType === 'INCLUSIVE' : lineInclusive,
    amount: amounts[i]!,
  }));
}

const gstCell = (rate: number, inclusive: boolean) =>
  `<div class="b">${rate ? `${rate}%` : '—'}</div><div class="tiny up">${inclusive ? 'Inclusive' : 'Exclusive'}</div>`;

function lineRows(item: AdminInvoiceItem, group: LicenceGroup | undefined): string {
  const lineRate = Number(item.taxRate) || 0;
  const lineInclusive = item.gstType === 'INCLUSIVE';
  const snapshot = item.products ?? [];
  const rows: ProductRow[] = snapshot.length
    ? snapshot.map((p) => ({
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

  if (rows.length === 0) {
    const names = (item.description ?? '').split('\n').map((n) => n.trim()).filter(Boolean);
    return `<tr class="row">
      <td class="pl"><div class="b">${esc(names[0] || item.product?.name || '—')}</div>${names
        .slice(1)
        .map((n) => `<div class="mu">${esc(n)}</div>`)
        .join('')}</td>
      <td class="mono mu">${esc(item.product?.sku || item.product?.productCode || item.sku || '—')}</td>
      <td class="r">${item.quantity}</td>
      <td class="r">${fmtMoney(item.unitPrice)}</td>
      <td class="c">${gstCell(lineRate, lineInclusive)}</td>
      <td class="r pr b">${fmtMoney(item.lineTotal)}</td>
    </tr>`;
  }

  const head =
    licenceKey || item.contractType === 'TRIAL'
      ? `<tr><td colspan="6" class="pl pr lic">${
          licenceKey ? `<span class="tiny up mu">Licence</span> <span class="mono b">${esc(licenceKey)}</span>` : ''
        }${item.contractType === 'TRIAL' ? ' <span class="trial">Trial</span>' : ''}</td></tr>`
      : '';
  return (
    head +
    rows
      .map(
        (r) => `<tr class="row">
      <td class="pl"><div class="b">${esc(r.name)}</div>${r.unit ? `<div class="tiny mu">per ${esc(r.unit)}</div>` : ''}</td>
      <td class="mono mu">${esc(r.sku || '—')}</td>
      <td class="r">${r.units}</td>
      <td class="r">${fmtMoney(r.agreedPrice)}</td>
      <td class="c">${gstCell(r.taxRate, r.inclusive)}</td>
      <td class="r pr b">${fmtMoney(r.amount)}</td>
    </tr>`
      )
      .join('')
  );
}

// ─── Logo ─────────────────────────────────────────────────

let logoCache: string | null | undefined;
async function logoDataUri(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const asset = Asset.fromModule(require('../../../assets/eg-eloma-mark.png'));
    await asset.downloadAsync();
    const b64 = await new File(asset.localUri ?? asset.uri).base64();
    logoCache = `data:image/png;base64,${b64}`;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

// ─── HTML ─────────────────────────────────────────────────

export function invoiceHtml(
  invoice: AdminInvoice,
  org: OrganisationSettings | null,
  pay: PublicPaymentSettings | null,
  logo: string | null
): string {
  const c = invoice.customer;
  const seller = {
    legalName: org?.legalName || org?.companyName || SELLER.legalName,
    addressLines: org
      ? [org.addressLine1, org.addressLine2, [org.city, org.state, org.postcode].filter(Boolean).join(' '), org.country].filter(
          (l): l is string => !!l && l.trim().length > 0
        )
      : SELLER.addressLines,
    abn: org?.abn || SELLER.abn,
    billingEmail: org?.billingEmail || SELLER.disputeEmail,
    disputeWindowDays: org?.disputeWindowDays ?? SELLER.disputeWindowDays,
  };
  const total = Number(invoice.total);
  const paid = Number(invoice.amountPaid);
  const amountDue = Math.max(total - paid, 0);
  const customerName = c?.companyName || c?.contactPerson || c?.clientId || '—';
  const customerEmail = c?.billingEmail || c?.contactEmail;
  // One rate across all lines → "GST 10%"; mixed rates → plain "GST".
  const rates = [...new Set((invoice.items ?? []).map((it) => Number(it.taxRate)))];
  const gstRate: number | null = rates.length === 1 && Number.isFinite(rates[0]) ? rates[0]! : rates.length ? null : 10;
  const payUrl = invoice.paymentUrl ?? '';
  const period = computeProration(invoice.invoiceDate?.slice(0, 10), invoice.nextBillingDate?.slice(0, 10) ?? undefined);
  const groups = buildLicenceGroups(c?.customerProducts);
  const hasBank = !!pay?.bankTransferEnabled && !!(pay.accountNumber || pay.bsb);
  const hasUpi = !!pay?.upiEnabled && !!pay.upiId;
  const cardsOn = !pay || pay.cardPaymentsEnabled;
  const st = INVOICE_STATUS[invoice.status] ?? INVOICE_STATUS.DRAFT;
  const bankRow = (l: string, v?: string | null) => (v ? `<div class="kv"><span class="mu">${esc(l)}</span><span class="b">${esc(v)}</span></div>` : '');
  const sumRow = (l: string, v: string, muted?: boolean) =>
    `<div class="kv"><span class="${muted ? 'mu' : ''}">${esc(l)}</span><span>${v}</span></div>`;

  const payOnline =
    payUrl || invoice.paymentQrUrl || cardsOn
      ? `<div class="paycard"><div class="pt"><span class="bar"></span>Pay online</div>
          <div class="flex">
            ${invoice.paymentQrUrl ? `<img class="qr" src="${esc(invoice.paymentQrUrl)}" alt="Scan to pay">` : ''}
            <div>
              ${payUrl ? `<a class="paylink" href="${esc(payUrl)}">View and pay online</a>` : '<div class="b">Scan to pay</div>'}
              <div class="tiny mu">Scan the QR or tap a card</div>
              ${
                cardsOn
                  ? '<div class="cards"><span style="color:#1A1F71;font-style:italic;font-weight:700">VISA</span><span>●●</span><span style="background:#2E77BC;color:#fff;padding:0 3px;border-radius:2px">AMEX</span><span><b style="color:#4285F4">G</b> Pay</span></div>'
                  : ''
              }
              ${payUrl ? `<div class="tiny mu mono url">${esc(payUrl)}</div>` : ''}
            </div>
          </div></div>`
      : '';

  const payments = (invoice.payments ?? []).filter((p) => p.status === 'SUCCESS');

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; font-size: 12px; }
  .mu { color: #64748b; } .b { font-weight: 600; } .tiny { font-size: 10px; } .up { text-transform: uppercase; letter-spacing: .08em; }
  .mono { font-family: Menlo, Consolas, monospace; font-size: 11px; }
  .r { text-align: right; } .c { text-align: center; } .pl { padding-left: 14px !important; } .pr { padding-right: 14px !important; }
  .flex { display: flex; gap: 12px; align-items: flex-start; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 700; color: ${NAVY}; }
  .brand img { width: 40px; height: 40px; }
  .title { text-align: right; }
  .title .ti { font-size: 12px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: ${NAVY}; }
  .title .no { font-family: Menlo, Consolas, monospace; font-size: 14px; font-weight: 600; margin-top: 3px; }
  .badge { display: inline-block; margin-top: 6px; padding: 2px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 600; background: #EEF1F5; color: #44546A; }
  .grid { display: flex; gap: 12px; margin-top: 14px; }
  .panel { border: 1px solid ${NAVY}1f; background: #f8fafc; border-radius: 10px; padding: 12px 14px; }
  .lbl { font-size: 9.5px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; }
  .due { background: ${NAVY}0d; border-color: ${NAVY}47; }
  .big { font-size: 28px; font-weight: 700; color: ${NAVY}; line-height: 1; }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; margin: 0; }
  dt { font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; } dd { margin: 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  .tbl { margin-top: 14px; border: 1px solid ${NAVY}2e; border-radius: 10px; overflow: hidden; }
  th { background: ${NAVY}0f; color: ${NAVY}; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; padding: 8px 8px; text-align: left; border-bottom: 1px solid ${NAVY}2e; }
  td { padding: 8px 8px; vertical-align: top; }
  tr.row td { border-bottom: 1px solid ${NAVY}12; }
  .lic { padding-top: 10px !important; padding-bottom: 2px !important; }
  .trial { border: 1px solid #fde68a; background: #fffbeb; color: #b45309; font-size: 9px; font-weight: 600; text-transform: uppercase; padding: 1px 5px; border-radius: 4px; }
  .paycard { border: 1px solid ${GREEN}52; background: #f8fafc; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
  .pt { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 11.5px; margin-bottom: 8px; }
  .bar { width: 4px; height: 13px; border-radius: 4px; background: ${GREEN}; }
  .qr { width: 74px; height: 74px; border-radius: 8px; background: #fff; border: 1px solid #0000001a; }
  .paylink { color: #2563eb; font-weight: 600; text-decoration: none; font-size: 12px; }
  .cards { display: flex; gap: 6px; margin-top: 6px; font-size: 9px; } .cards span { border: 1px solid #e2e8f0; border-radius: 5px; padding: 2px 5px; background: #fff; }
  .url { word-break: break-all; margin-top: 4px; }
  .kv { display: flex; justify-content: space-between; gap: 10px; margin: 4px 0; }
  .tot { border-top: 1px solid ${NAVY}2e; padding-top: 8px; margin-top: 6px; font-weight: 600; font-size: 13px; }
  .duebox { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; border: 1px solid ${NAVY}47; background: ${NAVY}0d; border-radius: 8px; padding: 8px 10px; }
  .duebox .v { font-size: 17px; font-weight: 700; color: ${NAVY}; }
  .note { margin-top: 14px; font-size: 11px; line-height: 1.5; color: #64748b; }
  .foot { margin-top: 16px; border-top: 1px solid ${NAVY}1f; padding-top: 10px; font-size: 10.5px; color: #64748b; }
  a { color: #2563eb; }
</style></head><body>
  <div class="head">
    <div class="brand">${logo ? `<img src="${logo}" alt="">` : ''}EG Eloma</div>
    <div class="title">
      <div class="ti">Tax Invoice</div>
      <div class="no">${esc(invoice.invoiceNumber)}</div>
      <div class="badge">${esc(st.label)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="panel" style="flex:3">
      <div class="lbl">Bill to</div>
      <div class="b" style="font-size:14px">${esc(customerName)}</div>
      <div class="mu" style="line-height:1.55;margin-top:2px">
        ${c?.abn ? `<div>ABN ${esc(formatAbn(c.abn))}</div>` : ''}
        ${customerEmail ? `<div>${esc(customerEmail)}</div>` : ''}
        ${c?.contactMobile ? `<div>${esc(formatPhone(c.contactMobile, c.contactMobileCountry))}</div>` : ''}
        ${c?.clientId ? `<div style="color:#94a3b8">Client ${esc(c.clientId)}</div>` : ''}
      </div>
    </div>
    <div class="panel due" style="flex:2">
      <div class="lbl">Amount due (${esc(invoice.currency)})</div>
      <div class="big">${fmtMoney(amountDue)}</div>
      <div class="mu" style="margin-top:8px">Due <span class="b" style="color:#0f172a">${fmtDate(invoice.dueDate)}</span></div>
      ${invoice.term ? `<div class="mu tiny">${esc(invoiceTermLabel(invoice.term))}</div>` : ''}
    </div>
  </div>

  <div class="grid">
    <div class="panel" style="flex:2">
      <div class="lbl">From</div>
      <div class="b">${esc(seller.legalName)}</div>
      <div class="mu" style="line-height:1.55;margin-top:2px">
        ${seller.addressLines.map((l) => `<div>${esc(l)}</div>`).join('')}
        <div>ABN ${esc(formatAbn(seller.abn) || seller.abn)}</div>
      </div>
    </div>
    <div class="panel" style="flex:3">
      <div class="lbl">Billing cycle</div>
      <dl>
        <div><dt>Issue date</dt><dd>${fmtDate(invoice.invoiceDate)}</dd></div>
        <div><dt>Reference</dt><dd>${esc(invoice.reference || '—')}</dd></div>
        <div><dt>Billing period</dt><dd>${period ? `${fmtDay(period.start)} – ${fmtDay(period.end)}` : '—'}</dd></div>
        <div><dt>Days billed</dt><dd>${period ? `${period.billedDays} of ${period.periodDays}` : '—'}</dd></div>
        <div><dt>Next billing date</dt><dd style="color:${NAVY}">${invoice.nextBillingDate ? fmtDate(invoice.nextBillingDate) : '—'}</dd></div>
      </dl>
    </div>
  </div>

  <div class="tbl"><table>
    <thead><tr>
      <th class="pl">Product</th><th>SKU</th><th class="r">Qty / Hours</th><th class="r">Agreed price</th><th class="c">GST</th><th class="r pr">Amount</th>
    </tr></thead>
    <tbody>${(invoice.items ?? []).map((it) => lineRows(it, findLicenceGroup(groups, it.productId, it.sku))).join('')}</tbody>
  </table></div>

  <div class="grid">
    <div style="flex:3">
      <div class="lbl" style="margin-bottom:8px">How to pay</div>
      ${payOnline}
      ${
        hasUpi
          ? `<div class="paycard"><div class="pt"><span class="bar"></span>UPI / Google Pay</div>${bankRow('UPI ID', pay!.upiId)}${bankRow('Reference', invoice.invoiceNumber)}</div>`
          : ''
      }
      ${
        hasBank
          ? `<div class="paycard"><div class="pt"><span class="bar"></span>Bank transfer</div>${bankRow('Account name', pay!.accountName)}${bankRow(
              'Bank',
              pay!.bankName
            )}${bankRow('BSB', pay!.bsb)}${bankRow('Account no.', pay!.accountNumber)}${bankRow('Reference', invoice.invoiceNumber)}</div>`
          : ''
      }
    </div>
    <div style="flex:2">
      <div class="panel">
        ${sumRow('Subtotal', fmtMoney(invoice.subtotal))}
        ${Number(invoice.tax) > 0 ? sumRow(gstRate === null ? 'GST' : `GST ${gstRate}%`, fmtMoney(invoice.tax), true) : ''}
        ${Number(invoice.discount) > 0 ? sumRow('Discount', `- ${fmtMoney(invoice.discount)}`, true) : ''}
        <div class="kv tot"><span>Total</span><span>${fmtMoney(invoice.total)}</span></div>
        ${paid > 0 ? sumRow('Amount paid', `- ${fmtMoney(paid)}`, true) : ''}
        <div class="duebox"><span class="tiny up mu b">Amount due</span><span class="v">${fmtMoney(amountDue)}</span></div>
      </div>
      ${
        payments.length
          ? `<div class="panel" style="margin-top:10px"><div class="lbl">Payments received</div>${payments
              .map((p) => sumRow(`${fmtDate(p.paidAt)}${p.paymentMethod ? ` · ${esc(p.paymentMethod)}` : ''}`, fmtMoney(p.amount), true))
              .join('')}</div>`
          : ''
      }
    </div>
  </div>

  ${pay?.payInstructions ? `<p class="note">${esc(pay.payInstructions)}</p>` : ''}
  ${invoice.notes ? `<p class="note">${linkify(invoice.notes)}</p>` : ''}
  <p class="foot">For any dispute on this invoice, please reach us at <span class="b" style="color:#0f172a">${esc(
    seller.billingEmail
  )}</span> within ${seller.disputeWindowDays} days.</p>
</body></html>`;
}

/** Build the invoice HTML with the organisation + payment settings (both optional). */
async function buildHtml(invoice: AdminInvoice): Promise<string> {
  const [org, pay, logo] = await Promise.all([
    billingApi.organisation().catch(() => null),
    billingApi.publicPayment().catch(() => null),
    logoDataUri(),
  ]);
  return invoiceHtml(invoice, org, pay, logo);
}

/** Render the invoice to a PDF named after its number and open the share sheet. */
export async function shareInvoicePdf(invoice: AdminInvoice): Promise<void> {
  const html = await buildHtml(invoice);
  const { uri } = await Print.printToFileAsync({ html, ...A4 });
  let out = uri;
  try {
    const named = new File(Paths.cache, `${invoice.invoiceNumber.replace(/[^\w.-]+/g, '-')}.pdf`);
    if (named.exists) named.delete();
    await new File(uri).copy(named);
    out = named.uri;
  } catch {
    // Keep the generated file name.
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(out, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Invoice ${invoice.invoiceNumber}` });
}

/** Open the system print dialog for the invoice. */
export async function printInvoice(invoice: AdminInvoice): Promise<void> {
  const html = await buildHtml(invoice);
  await Print.printAsync({ html, ...A4 });
}
