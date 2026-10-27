import crypto from 'node:crypto';
import { Prisma, InvoiceStatus, PaymentStatus, ActivityAction, type Invoice } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { round2, D } from '../utils/money.js';
import { logActivity } from './activity.service.js';
import { notifySuperAdmins } from './notification.service.js';
import { logger } from '../config/logger.js';
import { getPaymentSettings, getPaymentSettingsWithSecrets } from './settings.service.js';
import * as worldline from './payments/worldline.js';
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
        { invoice: { customer: { contactPerson: like } } },
        { invoice: { customer: { contactEmail: like } } },
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
              select: { clientId: true, companyName: true, contactPerson: true },
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

/**
 * Add a successful payment to the invoice's paid total, move its status on and
 * tell the super admins. Runs inside the caller's transaction.
 */
async function creditInvoice(tx: Prisma.TransactionClient, invoice: Invoice, amount: number) {
  let invoiceStatus = invoice.status;
  const amountPaid = round2(D(invoice.amountPaid).add(amount));
  if (amountPaid.gte(invoice.total)) invoiceStatus = InvoiceStatus.PAID;
  else if (amountPaid.gt(0)) invoiceStatus = InvoiceStatus.PARTIALLY_PAID;

  await tx.invoice.update({
    where: { id: invoice.id },
    data: { amountPaid, status: invoiceStatus },
  });

  notifySuperAdmins({
    type: 'payment',
    title: 'Payment received',
    body: `${invoice.invoiceNumber} — ${invoice.currency} ${amount}`,
    link: `/admin/billing/${invoice.id}`,
    entityType: 'Invoice',
    entityId: invoice.id,
  });
  return { invoiceStatus, amountPaid };
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
      ({ invoiceStatus, amountPaid } = await creditInvoice(tx, invoice, input.amount));
    }

    return { payment, invoiceStatus, amountPaid: amountPaid as Prisma.Decimal };
  });
}

/**
 * What a public payment will cost: the outstanding balance, nothing on top.
 * Card surcharges are banned in Australia from 1 October 2026 (RBA reforms),
 * so no payment method ever adds one.
 */
export async function quotePublicPayment(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw ApiError.notFound('Invoice not found');

  const balance = Number(round2(D(invoice.total).sub(invoice.amountPaid)));
  return { balance, total: balance, currency: invoice.currency };
}

/**
 * Client-initiated payment from the public pay page / invoice QR. Only enabled
 * for the mock provider (dev). With a real gateway, payment confirmation must
 * arrive via the verified webhook — never a client call — so this refuses to
 * run outside mock mode.
 */
export async function payInvoicePublic(invoiceId: string, method = 'card') {
  const { provider } = await getPaymentSettings();
  if (env.PAYMENT_PROVIDER !== 'mock' || provider !== 'mock') {
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

  const result = await recordPayment({
    invoiceId,
    amount: Number(balance),
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
      method,
      source: 'public-pay',
    },
  });
  return {
    alreadyPaid: false,
    invoiceNumber: invoice.invoiceNumber,
    charged: Number(balance),
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
 * Unsigned webhook used by the mock provider only. It trusts its payload, so it
 * must never run alongside a real gateway — Worldline has its own signed
 * endpoint below.
 */
export async function handleWebhook(payload: {
  invoiceId: string;
  transactionId?: string;
  amount: number;
  status: 'SUCCESS' | 'FAILED';
  provider?: string;
}) {
  const { provider } = await getPaymentSettings();
  if (env.PAYMENT_PROVIDER !== 'mock' || provider !== 'mock') {
    throw ApiError.forbidden('This webhook is disabled');
  }
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

// ─── ANZ Worldline (Hosted Checkout) ──────────────────────

const WORLDLINE = 'worldline';

/** Worldline payment product ids → the method label stored on the payment. */
const PRODUCT_METHODS: Record<number, string> = {
  1: 'visa',
  2: 'amex',
  3: 'mastercard',
  117: 'maestro',
  125: 'jcb',
  132: 'diners',
  302: 'applepay',
  320: 'gpay',
};

function methodOf(payment: worldline.PaymentResponse | null | undefined): string {
  const out = payment?.paymentOutput;
  const id =
    out?.cardPaymentMethodSpecificOutput?.paymentProductId ??
    out?.mobilePaymentMethodSpecificOutput?.paymentProductId;
  return (id != null && PRODUCT_METHODS[id]) || 'card';
}

async function worldlineCredentials() {
  const settings = await getPaymentSettingsWithSecrets();
  if (settings.provider !== WORLDLINE) {
    throw ApiError.badRequest('Card payments are not available for this invoice');
  }
  if (!settings.cardPaymentsEnabled) {
    throw ApiError.badRequest('Card payments are currently turned off');
  }
  return worldline.credentialsFrom(settings);
}

/**
 * Start a card payment: open a Worldline hosted checkout for the invoice's
 * outstanding balance and return the page to send the payer to. A PENDING
 * payment row records the attempt; only Worldline can move it to SUCCESS.
 */
export async function startWorldlineCheckout(invoiceId: string) {
  const creds = await worldlineCredentials();
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { customer: { select: { clientId: true, billingEmail: true, contactEmail: true } } },
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (invoice.status === InvoiceStatus.CANCELLED) {
    throw ApiError.badRequest('This invoice has been cancelled');
  }
  if (invoice.status === InvoiceStatus.DRAFT) {
    throw ApiError.badRequest('This invoice has not been issued yet');
  }

  const balance = round2(D(invoice.total).sub(invoice.amountPaid));
  if (balance.lte(0)) throw ApiError.badRequest('This invoice is already paid');

  // The row id travels to Worldline before the row exists, so a checkout that
  // fails to open leaves nothing behind.
  const paymentId = crypto.randomUUID();
  const { hostedCheckoutId, redirectUrl } = await worldline.createHostedCheckout(creds, {
    paymentId,
    merchantReference: `${invoice.invoiceNumber}-${paymentId.slice(0, 8)}`.slice(0, 40),
    amount: Number(balance),
    currency: invoice.currency,
    returnUrl: `${env.APP_URL.replace(/\/$/, '')}/pay/${invoice.id}`,
    customerEmail: invoice.customer.billingEmail || invoice.customer.contactEmail,
    merchantCustomerId: invoice.customer.clientId,
  });

  await prisma.payment.create({
    data: {
      id: paymentId,
      invoiceId: invoice.id,
      provider: WORLDLINE,
      transactionId: hostedCheckoutId,
      amount: balance,
      currency: invoice.currency,
      status: PaymentStatus.PENDING,
      paymentMethod: 'card',
    },
  });

  return { redirectUrl };
}

/**
 * Move a Worldline payment row to its final state. Idempotent: the return
 * redirect and the webhook usually both arrive, and only the first SUCCESS
 * credits the invoice. A declined attempt can still turn into a success (the
 * payer may retry on the same checkout page), but a success never goes back.
 */
async function applyWorldlineOutcome(
  paymentId: string,
  outcome: worldline.Outcome | 'CANCELLED',
  wlPayment?: worldline.PaymentResponse | null
) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.payment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
    if (!row) return null;

    if (outcome === 'SUCCESS') {
      const money = wlPayment?.paymentOutput?.amountOfMoney;
      if (
        money?.amount !== worldline.toMinorUnits(Number(row.amount)) ||
        money?.currencyCode !== row.currency
      ) {
        // Never credit an amount we did not ask for — leave it for a human.
        logger.error(
          { paymentId, expected: Number(row.amount), currency: row.currency, received: money },
          'Worldline payment amount does not match the checkout'
        );
        return row.status;
      }
      const claimed = await tx.payment.updateMany({
        where: { id: row.id, status: { not: PaymentStatus.SUCCESS } },
        data: { status: PaymentStatus.SUCCESS, paidAt: new Date(), paymentMethod: methodOf(wlPayment) },
      });
      if (claimed.count === 1) {
        await creditInvoice(tx, row.invoice, Number(row.amount));
        logActivity({
          action: ActivityAction.PAYMENT_RECEIVED,
          entityType: 'Invoice',
          entityId: row.invoiceId,
          metadata: {
            amount: Number(row.amount),
            provider: WORLDLINE,
            hostedCheckoutId: row.transactionId,
            worldlinePaymentId: wlPayment?.id,
            source: 'worldline',
          },
        });
      }
      return PaymentStatus.SUCCESS;
    }

    if (outcome === 'FAILED' || outcome === 'CANCELLED') {
      const next = outcome === 'FAILED' ? PaymentStatus.FAILED : PaymentStatus.CANCELLED;
      await tx.payment.updateMany({
        where: { id: row.id, status: PaymentStatus.PENDING },
        data: { status: next },
      });
      const fresh = await tx.payment.findUnique({ where: { id: row.id }, select: { status: true } });
      return fresh?.status ?? next;
    }

    return row.status;
  });
}

/**
 * The payer is back from Worldline. The query string they arrive with is not
 * trusted — the result is read from Worldline with our API key.
 */
export async function confirmWorldlineCheckout(invoiceId: string, hostedCheckoutId: string) {
  const row = await prisma.payment.findFirst({
    where: { invoiceId, provider: WORLDLINE, transactionId: hostedCheckoutId },
    select: { id: true },
  });
  if (!row) throw ApiError.notFound('Payment not found');

  const creds = await worldlineCredentials();
  const checkout = await worldline.getHostedCheckout(creds, hostedCheckoutId);
  const wlPayment = checkout.createdPaymentOutput?.payment;

  let outcome: worldline.Outcome | 'CANCELLED' = worldline.outcomeOf(wlPayment);
  if (!wlPayment && worldline.checkoutAbandoned(checkout.status)) outcome = 'CANCELLED';

  const status = await applyWorldlineOutcome(row.id, outcome, wlPayment);
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { invoiceNumber: true, status: true },
  });
  return { status, invoiceNumber: invoice?.invoiceNumber, invoiceStatus: invoice?.status };
}

/**
 * Signed Worldline webhook. Covers payers who never come back to the pay page,
 * and later status changes. Unknown or unrelated events are acknowledged so
 * Worldline stops retrying them.
 */
export async function handleWorldlineWebhook(
  rawBody: Buffer | undefined,
  headers: Record<string, string | string[] | undefined>
) {
  if (!rawBody?.length) throw ApiError.badRequest('Empty webhook body');
  const settings = await getPaymentSettingsWithSecrets();

  let event;
  try {
    event = await worldline.unmarshalWebhook(
      rawBody,
      headers,
      settings.worldlineWebhookKeyId,
      settings.worldlineWebhookSecret
    );
  } catch (err) {
    logger.warn({ err }, 'Rejected a Worldline webhook with an invalid signature');
    throw ApiError.unauthorized('Invalid webhook signature');
  }

  const wlPayment = event.payment;
  if (!wlPayment) return { handled: false, type: event.type };

  let paymentId = worldline.paymentIdOf(wlPayment);
  if (!paymentId) {
    const hostedCheckoutId = wlPayment.hostedCheckoutSpecificOutput?.hostedCheckoutId;
    const row = hostedCheckoutId
      ? await prisma.payment.findFirst({
          where: { provider: WORLDLINE, transactionId: hostedCheckoutId },
          select: { id: true },
        })
      : null;
    paymentId = row?.id ?? null;
  }
  if (!paymentId) {
    logger.info({ type: event.type, id: wlPayment.id }, 'Worldline webhook for an unknown payment');
    return { handled: false, type: event.type };
  }

  if (wlPayment.status === 'REFUNDED' || event.type?.startsWith('refund.')) {
    // Refunds are issued from the Worldline portal; the invoice is not reopened
    // automatically, but the admin is told so the books can be corrected.
    notifySuperAdmins({
      type: 'payment',
      title: 'Card payment refunded',
      body: `Worldline payment ${wlPayment.id ?? ''} was refunded`,
      link: '/admin/payments',
      entityType: 'Payment',
      entityId: paymentId,
    });
    return { handled: true, type: event.type };
  }

  const status = await applyWorldlineOutcome(paymentId, worldline.outcomeOf(wlPayment), wlPayment);
  return { handled: status !== null, type: event.type, status };
}

/** Admin "Test connection" — proves the saved PSPID + API key are accepted. */
export async function testWorldlineConnection() {
  const settings = await getPaymentSettingsWithSecrets();
  if (settings.worldlineApiKeyId && !settings.worldlineApiSecret) {
    throw ApiError.badRequest(
      'The saved API secret cannot be read on this server. Re-enter it and save again.'
    );
  }
  const creds = worldline.credentialsFrom(settings);
  const result = await worldline.testConnection(creds).catch((err: unknown) => {
    const code = (err as ApiError).errors?.gatewayError;
    throw ApiError.badRequest(
      `Worldline did not accept these details${code ? ` (${code})` : ''}. Check the PSPID, ` +
        `API Key ID and API Secret, and that Live/Test matches the account they came from.`
    );
  });
  return {
    ok: result.result === 'OK',
    result: result.result,
    environment: creds.environment,
    merchantId: creds.merchantId,
  };
}
