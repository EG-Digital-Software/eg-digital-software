import { Prisma } from '@prisma/client';

/**
 * Financial math helpers. We use Prisma.Decimal (decimal.js) for all money
 * arithmetic to avoid JS floating-point errors. Values are rounded to 2 dp.
 */
export type Money = Prisma.Decimal;

export const D = (v: Prisma.Decimal.Value): Money => new Prisma.Decimal(v);

export function round2(v: Prisma.Decimal.Value): Money {
  return new Prisma.Decimal(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export interface LineInput {
  quantity: number;
  unitPrice: Prisma.Decimal.Value;
  taxRate: Prisma.Decimal.Value; // percentage, e.g. 10 for 10%
  /**
   * How GST relates to unitPrice. EXCLUSIVE (default): unitPrice is net, GST is
   * added on top. INCLUSIVE: unitPrice already contains GST, so it is backed out
   * — the line total is unchanged and the net is derived.
   */
  gstType?: 'INCLUSIVE' | 'EXCLUSIVE';
}

export interface LineResult {
  lineNet: Money;
  taxAmount: Money;
  lineTotal: Money;
}

export function computeLine(line: LineInput): LineResult {
  const rate = D(line.taxRate).div(100);
  if (line.gstType === 'INCLUSIVE') {
    // unitPrice is GST-inclusive: gross stays as entered, net + tax are derived.
    const gross = round2(D(line.unitPrice).mul(line.quantity));
    const lineNet = round2(gross.div(D(1).add(rate)));
    const taxAmount = round2(gross.sub(lineNet));
    return { lineNet, taxAmount, lineTotal: gross };
  }
  const lineNet = round2(D(line.unitPrice).mul(line.quantity));
  const taxAmount = round2(lineNet.mul(rate));
  const lineTotal = round2(lineNet.add(taxAmount));
  return { lineNet, taxAmount, lineTotal };
}

export interface InvoiceTotals {
  subtotal: Money;
  tax: Money;
  discount: Money;
  total: Money;
}

export function computeInvoiceTotals(
  lines: LineInput[],
  discount: Prisma.Decimal.Value = 0
): InvoiceTotals {
  let subtotal = D(0);
  let tax = D(0);
  for (const l of lines) {
    const r = computeLine(l);
    subtotal = subtotal.add(r.lineNet);
    tax = tax.add(r.taxAmount);
  }
  subtotal = round2(subtotal);
  tax = round2(tax);
  const disc = round2(discount);
  const total = round2(subtotal.add(tax).sub(disc));
  return { subtotal, tax, discount: disc, total };
}
