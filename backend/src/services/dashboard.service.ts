import {
  Prisma,
  CustomerStatus,
  InvoiceStatus,
  ProductStatus,
  LicenceStatus,
} from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { computeLicenceStatus, daysRemaining } from '../utils/licence.js';
import { customerDisplayName } from '../utils/customer.js';

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
  return { start, end };
}

async function sumPaid(where: Prisma.PaymentWhereInput): Promise<number> {
  const agg = await prisma.payment.aggregate({ _sum: { amount: true }, where });
  return Number(agg._sum.amount ?? 0);
}

/** Invoices that count as real trade — drafts and cancellations do not. */
const COUNTED: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PENDING,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
  InvoiceStatus.OVERDUE,
];

/** Still owed — the exact predicate the Billing page's Outstanding tab uses. */
const UNPAID: Prisma.InvoiceWhereInput = {
  status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT] },
  amountPaid: { lt: prisma.invoice.fields.total },
};

/** Value invoiced in a period — what was sold, paid or not. */
async function sumInvoiced(start: Date, end: Date): Promise<number> {
  const agg = await prisma.invoice.aggregate({
    _sum: { total: true },
    where: { invoiceDate: { gte: start, lt: end }, status: { in: COUNTED } },
  });
  return Number(agg._sum.total ?? 0);
}

export async function getSummary() {
  const thisMonth = monthRange(0);
  const lastMonth = monthRange(1);

  const [
    salesThis,
    salesLast,
    revenueThis,
    revenueLast,
    totalCustomers,
    newCustomersThis,
    newCustomersLast,
    activeProducts,
    lowStock,
    outstandingAgg,
    overdueAgg,
    customerProducts,
  ] = await Promise.all([
    // Sales = value invoiced. Revenue = cash actually collected. These were the
    // same query before, so both KPI cards always showed an identical number.
    sumInvoiced(thisMonth.start, thisMonth.end),
    sumInvoiced(lastMonth.start, lastMonth.end),
    sumPaid({ status: 'SUCCESS', paidAt: { gte: thisMonth.start, lt: thisMonth.end } }),
    sumPaid({ status: 'SUCCESS', paidAt: { gte: lastMonth.start, lt: lastMonth.end } }),
    prisma.customer.count({ where: { status: CustomerStatus.ACTIVE } }),
    prisma.customer.count({ where: { createdAt: { gte: thisMonth.start, lt: thisMonth.end } } }),
    prisma.customer.count({ where: { createdAt: { gte: lastMonth.start, lt: lastMonth.end } } }),
    prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
    // Compared in the database rather than by loading every active product.
    prisma.product.count({
      where: {
        status: ProductStatus.ACTIVE,
        availableStock: { lte: prisma.product.fields.lowStockThreshold },
      },
    }),
    prisma.invoice.aggregate({ _sum: { total: true, amountPaid: true }, _count: true, where: UNPAID }),
    prisma.invoice.aggregate({
      _sum: { total: true, amountPaid: true },
      _count: true,
      where: { AND: [UNPAID, { dueDate: { lt: new Date() } }] },
    }),
    prisma.customerProduct.findMany({ select: { expiryDate: true, status: true } }),
  ]);

  const balanceOf = (agg: { _sum: { total: Prisma.Decimal | null; amountPaid: Prisma.Decimal | null } }) =>
    Number((Number(agg._sum.total ?? 0) - Number(agg._sum.amountPaid ?? 0)).toFixed(2));

  // Licence buckets computed live from expiry dates.
  const buckets = { active: 0, expiringSoon: 0, critical: 0, expired: 0, suspended: 0 };
  for (const cp of customerProducts) {
    const status = computeLicenceStatus(cp.expiryDate, cp.status);
    if (status === LicenceStatus.SUSPENDED) buckets.suspended++;
    else if (status === LicenceStatus.EXPIRED) buckets.expired++;
    else if (status === LicenceStatus.CRITICAL) buckets.critical++;
    else if (status === LicenceStatus.EXPIRING_SOON) buckets.expiringSoon++;
    else buckets.active++;
  }

  return {
    totalSales: {
      current: salesThis,
      previous: salesLast,
      changePct: pctChange(salesThis, salesLast),
    },
    revenue: {
      current: revenueThis,
      previous: revenueLast,
      changePct: pctChange(revenueThis, revenueLast),
    },
    customers: {
      total: totalCustomers,
      new: newCustomersThis,
      changePct: pctChange(newCustomersThis, newCustomersLast),
    },
    products: { active: activeProducts, lowStock },
    outstanding: { count: outstandingAgg._count, amount: balanceOf(outstandingAgg) },
    overdue: { count: overdueAgg._count, amount: balanceOf(overdueAgg) },
    licences: {
      active: buckets.active,
      expiringSoon: buckets.expiringSoon + buckets.critical,
      expired: buckets.expired,
      suspended: buckets.suspended,
    },
  };
}

/**
 * Time-series for the dashboard chart. metric ∈ revenue|sales|invoices|customers.
 *
 * The window is fetched once and bucketed in memory. The previous version ran
 * one query per point — 90 sequential round trips for the 90-day range.
 */
export async function getSeries(metric: string, rangeDays: number) {
  const now = new Date();
  const useMonthly = rangeDays > 120;
  const steps = useMonthly ? Math.round(rangeDays / 30) : rangeDays;

  // Bucket boundaries, oldest first.
  const buckets: Array<{ start: Date; end: Date; label: string; value: number }> = [];
  for (let i = steps - 1; i >= 0; i--) {
    if (useMonthly) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        start,
        end,
        label: start.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
        value: 0,
      });
    } else {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      buckets.push({
        start,
        end,
        label: start.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }),
        value: 0,
      });
    }
  }
  if (buckets.length === 0) return [];

  const windowStart = buckets[0].start;
  const windowEnd = buckets[buckets.length - 1].end;

  /** Drop a row into its bucket. Rows arrive already inside the window. */
  const add = (when: Date | null, amount: number) => {
    if (!when) return;
    const t = when.getTime();
    for (const b of buckets) {
      if (t >= b.start.getTime() && t < b.end.getTime()) {
        b.value += amount;
        return;
      }
    }
  };

  if (metric === 'revenue') {
    const rows = await prisma.payment.findMany({
      where: { status: 'SUCCESS', paidAt: { gte: windowStart, lt: windowEnd } },
      select: { amount: true, paidAt: true },
    });
    for (const r of rows) add(r.paidAt, Number(r.amount));
  } else if (metric === 'sales' || metric === 'invoices') {
    const rows = await prisma.invoice.findMany({
      where: { invoiceDate: { gte: windowStart, lt: windowEnd }, status: { in: COUNTED } },
      select: { total: true, invoiceDate: true },
    });
    // "sales" is the invoiced value; "invoices" is how many were raised.
    for (const r of rows) add(r.invoiceDate, metric === 'sales' ? Number(r.total) : 1);
  } else if (metric === 'customers') {
    const rows = await prisma.customer.findMany({
      where: { createdAt: { gte: windowStart, lt: windowEnd } },
      select: { createdAt: true },
    });
    for (const r of rows) add(r.createdAt, 1);
  }

  return buckets.map((b) => ({ date: b.label, value: Number(b.value.toFixed(2)) }));
}

/** Licences expiring soon / critical / expired for the monitoring table. */
export async function getLicences() {
  // Only rows that could possibly need attention — expiring within 30 days,
  // already expired, or suspended. Previously the whole table was loaded and
  // then filtered down to 25 rows in memory.
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);

  const rows = await prisma.customerProduct.findMany({
    where: {
      OR: [{ expiryDate: { lte: horizon } }, { status: LicenceStatus.SUSPENDED }],
    },
    take: 100,
    include: {
      product: { select: { name: true, sku: true } },
      customer: { select: { clientId: true, companyName: true, contactPerson: true } },
      licence: { select: { licenceKey: true } },
    },
    orderBy: { expiryDate: 'asc' },
  });

  return rows
    .map((r) => {
      const status = computeLicenceStatus(r.expiryDate, r.status);
      return {
        id: r.id,
        clientId: r.customer.clientId,
        customer: customerDisplayName(r.customer),
        product: r.product.name,
        licence: r.licence?.licenceKey ?? '—',
        expiryDate: r.expiryDate,
        daysRemaining: daysRemaining(r.expiryDate),
        status,
      };
    })
    .filter((r) => r.status !== LicenceStatus.ACTIVE)
    .slice(0, 25);
}

export async function getLowStock() {
  const products = await prisma.product.findMany({
    where: {
      status: ProductStatus.ACTIVE,
      availableStock: { lte: prisma.product.fields.lowStockThreshold },
    },
    orderBy: { availableStock: 'asc' },
    take: 25,
  });
  return products
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku ?? p.productCode,
      available: p.availableStock,
      threshold: p.lowStockThreshold,
      status: p.availableStock <= 0 ? 'OUT_OF_STOCK' : 'LOW',
    }));
}

export async function getRecent() {
  const [customers, invoices, payments] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { clientId: true, companyName: true, contactPerson: true, createdAt: true },
    }),
    prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        status: true,
        createdAt: true,
        customer: { select: { companyName: true, clientId: true } },
      },
    }),
    prisma.payment.findMany({
      where: { status: 'SUCCESS' },
      orderBy: { paidAt: 'desc' },
      take: 5,
      select: {
        id: true,
        amount: true,
        paidAt: true,
        invoice: { select: { invoiceNumber: true } },
      },
    }),
  ]);
  return { customers, invoices, payments };
}
