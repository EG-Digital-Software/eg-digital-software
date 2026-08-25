import { Prisma, InvoiceStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { PageQuery } from '../utils/http.js';
import { computeInvoiceTotals, computeLine, D } from '../utils/money.js';
import { nextSequence, formatInvoiceNumber, formatInvoiceReference } from '../utils/sequence.js';
import { paymentProvider, generateQrDataUrl } from './payments/index.js';
import { notify } from './notification.service.js';
import { deliverEmail } from './email/index.js';
import { buildInvoiceEmail } from './email/templates.js';
import { env } from '../config/env.js';

interface ListParams extends PageQuery {
  search?: string;
  status?: string;
  /** Billing tab: computed from balance + due date, not the stored status. */
  filter?: 'all' | 'outstanding' | 'paid' | 'overdue' | 'draft';
  clientId?: string;
}

/** Statuses that can never carry a balance the customer still owes. */
const SETTLED: InvoiceStatus[] = [InvoiceStatus.PAID, InvoiceStatus.CANCELLED];

/** Anything still owed: a real balance, not cancelled, not a draft. */
function unpaidWhere(): Prisma.InvoiceWhereInput {
  return {
    status: { notIn: [...SETTLED, InvoiceStatus.DRAFT] },
    amountPaid: { lt: prisma.invoice.fields.total },
  };
}

export async function listInvoices(params: ListParams) {
  const and: Prisma.InvoiceWhereInput[] = [];

  if (params.status) and.push({ status: params.status as InvoiceStatus });
  if (params.clientId) and.push({ customer: { clientId: params.clientId } });

  switch (params.filter) {
    case 'outstanding':
      and.push(unpaidWhere());
      break;
    case 'overdue':
      // Due date has passed and money is still owed — derived, so it stays
      // correct without a job flipping statuses.
      and.push(unpaidWhere(), { dueDate: { lt: new Date() } });
      break;
    case 'paid':
      and.push({ status: InvoiceStatus.PAID });
      break;
    case 'draft':
      and.push({ status: InvoiceStatus.DRAFT });
      break;
    default:
      break;
  }

  if (params.search) {
    const like = { contains: params.search.trim(), mode: 'insensitive' as const };
    and.push({
      OR: [
        { invoiceNumber: like },
        { reference: like },
        { customer: { companyName: like } },
        { customer: { tradingAs: like } },
        { customer: { clientId: like } },
        { customer: { contactPerson: like } },
        { customer: { contactEmail: like } },
      ],
    });
  }

  const where: Prisma.InvoiceWhereInput = and.length ? { AND: and } : {};

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
      include: {
        customer: {
          select: {
            clientId: true,
            companyName: true,
            tradingAs: true,
            contactPerson: true,
            contactEmail: true,
          },
        },
      },
    }),
    prisma.invoice.count({ where }),
  ]);
  return { items, total };
}

export async function getInvoice(id: string) {
  await ensurePayable(id);
  return prisma.invoice.findUniqueOrThrow({
    where: { id },
    include: { items: true, payments: true, customer: { include: { addresses: true } } },
  });
}

/**
 * Guarantee an invoice has a payment link + QR code. Older invoices (and any
 * created before payment wiring) are backfilled lazily on first read, so every
 * invoice a client opens shows a scannable QR and a working pay link.
 */
export async function ensurePayable(
  invoiceId: string
): Promise<{ paymentUrl: string; paymentQrUrl: string }> {
  const inv = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      total: true,
      currency: true,
      paymentUrl: true,
      paymentQrUrl: true,
      customer: { select: { contactEmail: true, billingEmail: true } },
    },
  });

  if (inv.paymentUrl && inv.paymentQrUrl) {
    return { paymentUrl: inv.paymentUrl, paymentQrUrl: inv.paymentQrUrl };
  }

  const payment = await paymentProvider.createPayment({
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    amount: inv.total.toString(),
    currency: inv.currency,
    customerEmail: inv.customer?.billingEmail ?? inv.customer?.contactEmail ?? '',
    description: `Payment for ${inv.invoiceNumber}`,
  });
  const paymentQrUrl = await generateQrDataUrl(payment.paymentUrl);

  await prisma.invoice.update({
    where: { id: inv.id },
    data: { paymentUrl: payment.paymentUrl, paymentQrUrl },
  });
  return { paymentUrl: payment.paymentUrl, paymentQrUrl };
}

function resolveDueDate(invoiceDate: Date, term?: string, customDays?: number, dueDate?: Date): Date {
  if (dueDate) return dueDate;
  const base = new Date(invoiceDate);
  const add = (days: number) => new Date(base.getTime() + days * 86_400_000);
  switch (term) {
    case 'Due on Receipt':
      return base;
    case '7 Days':
      return add(7);
    case '15 Days':
      return add(15);
    case '30 Days':
      return add(30);
    case 'Custom':
      return add(customDays ?? 30);
    default:
      return add(30);
  }
}

type CreateInput = {
  clientId: string;
  invoiceDate?: Date;
  dueDate?: Date;
  term?: string;
  customDays?: number;
  reference?: string;
  discount: number;
  notes?: string;
  status?: 'DRAFT' | 'SENT' | 'PENDING';
  items: Array<{
    productId?: string;
    sku?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
  }>;
};

export async function createInvoice(input: CreateInput) {
  const customer = await prisma.customer.findUnique({ where: { clientId: input.clientId } });
  if (!customer) throw ApiError.notFound('Customer not found');

  const invoiceDate = input.invoiceDate ?? new Date();
  const dueDate = resolveDueDate(invoiceDate, input.term, input.customDays, input.dueDate);
  const totals = computeInvoiceTotals(input.items, input.discount);

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = formatInvoiceNumber(
      await nextSequence(tx, 'invoiceNumber'),
      invoiceDate
    );

    // Every invoice gets its own unique reference. An admin-supplied reference
    // wins; otherwise one is generated from a dedicated counter. The column is
    // unique, so two invoices can never share a reference.
    const reference =
      input.reference?.trim() ||
      formatInvoiceReference(await nextSequence(tx, 'invoiceReference'), invoiceDate);

    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        customerId: customer.id,
        invoiceDate,
        dueDate,
        term: input.term,
        customDays: input.customDays,
        reference,
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
        currency: customer ? 'AUD' : 'AUD',
        status: (input.status as InvoiceStatus) ?? InvoiceStatus.PENDING,
        notes: input.notes,
        items: {
          create: input.items.map((it) => {
            const line = computeLine(it);
            return {
              productId: it.productId ?? null,
              sku: it.sku ?? null,
              description: it.description,
              quantity: it.quantity,
              unitPrice: D(it.unitPrice),
              taxRate: D(it.taxRate),
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
            };
          }),
        },
      },
    });

    return created;
  });

  // Generate a provider-agnostic payment URL + QR for the invoice.
  const payment = await paymentProvider.createPayment({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: totals.total.toString(),
    currency: invoice.currency,
    customerEmail: customer.billingEmail ?? customer.contactEmail ?? undefined,
    description: `Payment for ${invoice.invoiceNumber}`,
  });
  const qr = await generateQrDataUrl(payment.paymentUrl);

  // Notify the customer's linked client users (if any).
  const clientUsers = await prisma.clientUser.findMany({
    where: { customerId: customer.id, isActive: true },
    select: { id: true },
  });
  for (const u of clientUsers) {
    notify({
      userId: u.id,
      userType: 'CLIENT',
      type: 'invoice',
      title: 'New invoice issued',
      body: `${invoice.invoiceNumber} — ${invoice.currency} ${totals.total.toString()}`,
      link: `/client/invoices/${invoice.id}`,
      entityType: 'Invoice',
      entityId: invoice.id,
    });
  }

  return prisma.invoice.update({
    where: { id: invoice.id },
    data: { paymentUrl: payment.paymentUrl, paymentQrUrl: qr },
    include: { items: true, customer: { include: { addresses: true } } },
  });
}

/**
 * Email the invoice to the client and mark it as sent.
 *
 * Recipients are gathered from the customer record (billing/contact email) and
 * every linked, active client-account login — so it reaches whichever address
 * the client actually uses. Sending is awaited so the admin sees a real
 * success/failure, and the invoice moves to SENT once it goes out.
 */
export async function sendInvoiceEmail(id: string): Promise<{ recipients: string[] }> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id },
    include: {
      customer: {
        select: {
          companyName: true,
          contactPerson: true,
          contactEmail: true,
          billingEmail: true,
          users: { where: { isActive: true }, select: { email: true } },
        },
      },
    },
  });

  const c = invoice.customer;
  // Primary goes to the accounts/billing address; the general contact and any
  // client-portal logins are CC'd. Deduped and lower-cased so the same address
  // never appears twice.
  const seen = new Set<string>();
  const dedupe = (email?: string | null): string | null => {
    const e = email?.trim().toLowerCase();
    if (!e || seen.has(e)) return null;
    seen.add(e);
    return e;
  };

  const primary = dedupe(c?.billingEmail) ?? dedupe(c?.contactEmail);
  if (!primary) {
    throw ApiError.badRequest(
      'This customer has no email address — add a billing or contact email first'
    );
  }
  const cc = [
    dedupe(c?.contactEmail),
    ...(c?.users ?? []).map((u) => dedupe(u.email)),
  ].filter((e): e is string => !!e);

  // Make sure there is a working pay link + QR, then link the client to the
  // public invoice/pay page.
  await ensurePayable(id);
  const payUrl = `${env.APP_URL.replace(/\/$/, '')}/pay/${invoice.id}`;

  const message = buildInvoiceEmail({
    to: primary,
    cc: cc.length ? cc.join(', ') : undefined,
    companyName: c?.companyName ?? 'there',
    contactName: c?.contactPerson ?? undefined,
    invoiceNumber: invoice.invoiceNumber,
    reference: invoice.reference,
    amount: invoice.total.toString(),
    currency: invoice.currency,
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    payUrl,
  });

  await deliverEmail(message);

  // Once it's out the door it's no longer a draft.
  if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.PENDING) {
    await prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.SENT } });
  }

  const recipients = [primary, ...cc];
  return { recipients };
}

export async function updateStatus(id: string, status: InvoiceStatus) {
  await prisma.invoice.findUniqueOrThrow({ where: { id } });
  return prisma.invoice.update({ where: { id }, data: { status } });
}

/** Public, sanitised invoice for the (future) client pay page. */
export async function getPublicInvoice(id: string) {
  const exists = await prisma.invoice.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.notFound('Invoice not found');
  await ensurePayable(id);
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      items: true,
      customer: { select: { clientId: true, companyName: true, contactPerson: true } },
    },
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  return invoice;
}
