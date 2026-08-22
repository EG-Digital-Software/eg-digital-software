import { Prisma, InvoiceStatus, PaymentStatus, ActivityAction } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { round2, D } from '../utils/money.js';
import { logActivity } from './activity.service.js';
import { notifySuperAdmins } from './notification.service.js';
import { getPaymentSettings } from './settings.service.js';
import type { PageQuery } from '../utils/http.js';

/** Record a payment against an invoice and recompute the invoice status. */
interface ListParams extends PageQuery {
  search?: string;
  status?: PaymentStatus;
  method?: string;
  provider?: string;
  invoiceId?: string;
}

/**
 * Payments across every invoice. Until now a payment could only be seen on the
 * invoice that produced it — there was no way to answer "what came in this
 * week?" without opening invoices one by one.
 */
export async function listPayments(params: ListParams) {
  const and: Prisma.PaymentWhereInput[] = [];
  if (params.status) and.push({ status: params.status });
  if (params.method) and.push({ paymentMethod: params.method });
  if (params.provider) and.push({ provider: params.provider });
  if (params.invoiceId) and.push({ invoiceId: params.invoiceId });

  if (params.search) {
    const like = { contains: params.search.trim(), mode: 'insensitive' as const };
    and.push({
      OR: [
        { transactionId: like },
        { paymentMethod: like },
        { invoice: { invoiceNumber: like } },
        { invoice: { reference: like } },
        { invoice: { customer: { companyName: like } } },
        { invoice: { customer: { clientId: like } } },
        { invoice: { customer: { firstName: like } } },
        { invoice: { customer: { lastName: like } } },
        { invoice: { customer: { email: like } } },
      ],
    });
  }

  const where: Prisma.PaymentWhereInput = and.length ? { AND: and } : {};

  const [items, total, collected] = await Promise.all([
    prisma.payment.findMany({
      where,
      // Newest money first; a pending payment has no paidAt, so fall back to
      // when the row was created rather than sorting it to the bottom forever.
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      skip: params.skip,
      take: params.take,
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
            customer: {
              select: { clientId: true, companyName: true, firstName: true, lastName: true },
            },
          },
        },
      },
    }),
    prisma.payment.count({ where }),
    // Value of the successful payments inside the current filter.
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { AND: [where, { status: PaymentStatus.SUCCESS }] },
    }),
  ]);

  return { items, total, collected: Number(collected._sum.amount ?? 0) };
}

/** Distinct payment methods in use, for the transactions filter. */
export async function listPaymentMethods() {
  const rows = await prisma.payment.findMany({
    where: { paymentMethod: { not: null } },
    distinct: ['paymentMethod'],
    select: { paymentMethod: true },
    orderBy: { paymentMethod: 'asc' },
  });
  return rows.map((r) => r.paymentMethod).filter((m): m is string => !!m);
}

export async function recordPayment(input: {
  invoiceId: string;
  /** Credited against the invoice balance. */
  amount: number;
  /** Processing fee charged on top; never credited to the invoice. */
  surcharge?: number;
  method?: string;
  provider?: string;
  transactionId?: string;
  status?: PaymentStatus;
}) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
    if (!invoice) throw ApiError.notFound('Invoice not found');

    const status = input.status ?? PaymentStatus.SUCCESS;
    const payment = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        provider: input.provider ?? 'mock',
        transactionId: input.transactionId,
        amount: D(input.amount),
        surcharge: D(input.surcharge ?? 0),
        currency: invoice.currency,
        status,
        paymentMethod: input.method,
        paidAt: status === PaymentStatus.SUCCESS ? new Date() : null,
      },
    });

    let invoiceStatus = invoice.status;
    let amountPaid = invoice.amountPaid;
    if (status === PaymentStatus.SUCCESS) {
      amountPaid = round2(D(invoice.amountPaid).add(input.amount));
      if (amountPaid.gte(invoice.total)) invoiceStatus = InvoiceStatus.PAID;
      else if (amountPaid.gt(0)) invoiceStatus = InvoiceStatus.PARTIALLY_PAID;

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid, status: invoiceStatus },
      });

      notifySuperAdmins({
        type: 'payment',
        title: 'Payment received',
        body: `${invoice.invoiceNumber} — ${invoice.currency} ${input.amount}`,
        link: `/admin/billing/${invoice.id}`,
        entityType: 'Invoice',
        entityId: invoice.id,
      });
    }

    return { payment, invoiceStatus, amountPaid: amountPaid as Prisma.Decimal };
  });
}

/**
 * Client-initiated payment from the public pay page / invoice QR. Only enabled
 * for the mock provider (dev). With a real gateway, payment confirmation must
 * arrive via the verified webhook — never a client call — so this refuses to
 * run outside mock mode.
 */
/** Card-like methods attract the configured surcharge; bank/UPI do not. */
const SURCHARGED_METHODS = new Set(['card', 'visa', 'mastercard', 'amex', 'gpay']);

/**
 * What a public payment will actually cost — the outstanding balance plus any
 * card surcharge. Exposed so the pay page can show the same figure it charges.
 */
export async function quotePublicPayment(invoiceId: string, method = 'card') {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw ApiError.notFound('Invoice not found');

  const balance = round2(D(invoice.total).sub(invoice.amountPaid));
  const settings = await getPaymentSettings();
  const pct = SURCHARGED_METHODS.has(method) ? Number(settings.cardSurchargePct ?? 0) : 0;
  const surcharge = pct > 0 ? round2(balance.mul(pct).div(100)) : D(0);

  return {
    balance: Number(balance),
    surchargePct: pct,
    surcharge: Number(surcharge),
    total: Number(round2(balance.add(surcharge))),
    currency: invoice.currency,
  };
}

export async function payInvoicePublic(invoiceId: string, method = 'card') {
  if (env.PAYMENT_PROVIDER !== 'mock') {
    throw ApiError.badRequest('Live payments are processed by the payment gateway');
  }
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw ApiError.notFound('Invoice not found');

  // A cancelled or draft invoice is not collectable — anyone holding the link
  // could previously still pay one.
  if (invoice.status === InvoiceStatus.CANCELLED) {
    throw ApiError.badRequest('This invoice has been cancelled');
  }
  if (invoice.status === InvoiceStatus.DRAFT) {
    throw ApiError.badRequest('This invoice has not been issued yet');
  }

  const balance = round2(D(invoice.total).sub(invoice.amountPaid));
  if (balance.lte(0)) {
    return { alreadyPaid: true, invoiceNumber: invoice.invoiceNumber };
  }

  // The surcharge was displayed on the pay page but never actually charged.
  const quote = await quotePublicPayment(invoiceId, method);

  const result = await recordPayment({
    invoiceId,
    amount: Number(balance),
    surcharge: quote.surcharge,
    method,
    provider: 'mock',
    transactionId: `pay_${Date.now()}`,
    status: PaymentStatus.SUCCESS,
  });
  logActivity({
    action: ActivityAction.PAYMENT_RECEIVED,
    entityType: 'Invoice',
    entityId: invoiceId,
    metadata: {
      amount: Number(balance),
      surcharge: quote.surcharge,
      method,
      source: 'public-pay',
    },
  });
  return {
    alreadyPaid: false,
    invoiceNumber: invoice.invoiceNumber,
    charged: quote.total,
    surcharge: quote.surcharge,
    ...result,
  };
}

export async function createPaymentIntent(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.total.toString(),
    currency: invoice.currency,
    paymentUrl: invoice.paymentUrl,
    paymentQrUrl: invoice.paymentQrUrl,
  };
}

/**
 * Webhook entry point. In production, verify the signature via
 * paymentProvider.verifyWebhook before trusting the payload.
 */
export async function handleWebhook(payload: {
  invoiceId: string;
  transactionId?: string;
  amount: number;
  status: 'SUCCESS' | 'FAILED';
  provider?: string;
}) {
  const result = await recordPayment({
    invoiceId: payload.invoiceId,
    amount: payload.amount,
    provider: payload.provider,
    transactionId: payload.transactionId,
    status: payload.status === 'SUCCESS' ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
    method: 'gateway',
  });
  if (payload.status === 'SUCCESS') {
    logActivity({
      action: ActivityAction.PAYMENT_RECEIVED,
      entityType: 'Invoice',
      entityId: payload.invoiceId,
      metadata: { amount: payload.amount, transactionId: payload.transactionId },
    });
  }
  return result;
}
