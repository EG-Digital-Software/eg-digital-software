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
}

export interface LineResult {
  lineNet: Money;
  taxAmount: Money;
  lineTotal: Money;
}

export function computeLine(line: LineInput): LineResult {
  const lineNet = round2(D(line.unitPrice).mul(line.quantity));
  const taxAmount = round2(lineNet.mul(D(line.taxRate).div(100)));
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
