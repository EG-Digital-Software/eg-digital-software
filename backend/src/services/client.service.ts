import { Prisma, InvoiceStatus, LicenceStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { PageQuery } from '../utils/http.js';
import { computeLicenceStatus, daysRemaining } from '../utils/licence.js';
import { ensurePayable } from './invoice.service.js';

/** Resolve the Customer a signed-in client user is linked to. */
export async function resolveCustomerId(userId: string): Promise<string> {
  const user = await prisma.clientUser.findUnique({ where: { id: userId } });
  if (!user?.customerId) throw ApiError.forbidden('No customer is linked to this account');
  return user.customerId;
}

export async function getProfile(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { addresses: true, directors: true },
  });
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
}

/**
 * Still owed — a real balance on an invoice that is neither cancelled nor a
 * draft. Mirrors the Billing page so the client and the admin never disagree
 * about what is outstanding.
 */
function unpaidWhere(customerId: string): Prisma.InvoiceWhereInput {
  return {
    customerId,
    status: {
      notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT],
    },
    amountPaid: { lt: prisma.invoice.fields.total },
  };
}

const balanceOf = (agg: {
  _sum: { total: Prisma.Decimal | null; amountPaid: Prisma.Decimal | null };
}) => Number((Number(agg._sum.total ?? 0) - Number(agg._sum.amountPaid ?? 0)).toFixed(2));

export async function getDashboard(customerId: string) {
  const [invoiceAgg, outstandingAgg, overdueAgg, invoiceCount, customerProducts] = await Promise.all([
    prisma.invoice.aggregate({ _sum: { total: true, amountPaid: true }, where: { customerId } }),
    prisma.invoice.aggregate({
      _sum: { total: true, amountPaid: true },
      _count: true,
      where: unpaidWhere(customerId),
    }),
    prisma.invoice.aggregate({
      _sum: { total: true, amountPaid: true },
      _count: true,
      where: { AND: [unpaidWhere(customerId), { dueDate: { lt: new Date() } }] },
    }),
    prisma.invoice.count({ where: { customerId } }),
    prisma.customerProduct.findMany({ where: { customerId }, select: { expiryDate: true, status: true } }),
  ]);

  const totalPaid = Number(invoiceAgg._sum.amountPaid ?? 0);

  const buckets = { active: 0, expiringSoon: 0, expired: 0 };
  for (const cp of customerProducts) {
    const status = computeLicenceStatus(cp.expiryDate, cp.status);
    if (status === LicenceStatus.EXPIRED) buckets.expired++;
    else if (status === LicenceStatus.EXPIRING_SOON || status === LicenceStatus.CRITICAL)
      buckets.expiringSoon++;
    else if (status !== LicenceStatus.SUSPENDED) buckets.active++;
  }

  return {
    outstanding: { amount: balanceOf(outstandingAgg), count: outstandingAgg._count },
    overdue: { amount: balanceOf(overdueAgg), count: overdueAgg._count },
    totalPaid: Number(totalPaid.toFixed(2)),
    invoices: invoiceCount,
    products: customerProducts.length,
    licences: buckets,
  };
}

export async function listInvoices(
  customerId: string,
  page: PageQuery,
  params: {
    status?: string;
    /** Tab: derived from balance + due date, never from the stored status. */
    filter?: 'all' | 'outstanding' | 'paid' | 'overdue';
    search?: string;
  } = {}
) {
  const and: Prisma.InvoiceWhereInput[] = [{ customerId }];
  if (params.status) and.push({ status: params.status as InvoiceStatus });

  switch (params.filter) {
    case 'outstanding':
      and.push(unpaidWhere(customerId));
      break;
    case 'overdue':
      and.push(unpaidWhere(customerId), { dueDate: { lt: new Date() } });
      break;
    case 'paid':
      and.push({ status: InvoiceStatus.PAID });
      break;
    default:
      break;
  }

  if (params.search) {
    const like = { contains: params.search.trim(), mode: 'insensitive' as const };
    and.push({ OR: [{ invoiceNumber: like }, { reference: like }] });
  }

  const where: Prisma.InvoiceWhereInput = { AND: and };
  const [items, total, outstandingAgg] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.skip,
      take: page.take,
    }),
    prisma.invoice.count({ where }),
    // Balance across the whole filtered set, not just this page.
    prisma.invoice.aggregate({ _sum: { total: true, amountPaid: true }, where }),
  ]);
  return { items, total, balance: balanceOf(outstandingAgg) };
}

export async function getInvoice(customerId: string, invoiceId: string) {
  const owned = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { customerId: true },
  });
  if (!owned || owned.customerId !== customerId) throw ApiError.notFound('Invoice not found');

  // Ensure a scannable QR + pay link exists (backfills older invoices).
  await ensurePayable(invoiceId);

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, payments: true, customer: { include: { addresses: true } } },
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  return invoice;
}

export async function listProducts(
  customerId: string,
  params: { status?: string; search?: string } = {}
) {
  const where: Prisma.CustomerProductWhereInput = { customerId };
  if (params.search) {
    const like = { contains: params.search.trim(), mode: 'insensitive' as const };
    where.OR = [
      { product: { name: like } },
      { product: { sku: like } },
      { product: { productCode: like } },
      { licence: { licenceKey: like } },
    ];
  }

  const rows = await prisma.customerProduct.findMany({
    where,
    include: { product: true, licence: true },
    orderBy: { expiryDate: 'asc' },
  });

  const mapped = rows.map((r) => ({
    id: r.id,
    product: r.product.name,
    sku: r.product.sku ?? r.product.productCode,
    quantity: r.quantity,
    licence: r.licence?.licenceKey ?? '—',
    issueDate: r.issueDate,
    expiryDate: r.expiryDate,
    daysRemaining: daysRemaining(r.expiryDate),
    status: computeLicenceStatus(r.expiryDate, r.status),
  }));

  // Status is computed from the expiry date, so it can only be filtered here.
  return params.status ? mapped.filter((r) => r.status === params.status) : mapped;
}
