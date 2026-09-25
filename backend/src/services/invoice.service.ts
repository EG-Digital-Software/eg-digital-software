import { Prisma, InvoiceStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { PageQuery } from '../utils/http.js';
import { computeInvoiceTotals, computeLine, D, round2, type Money } from '../utils/money.js';
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
  /** 'client' groups the list by customer (alphabetical) for Manage Billing. */
  sort?: 'client';
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

  // Client-wise view keeps each customer's invoices together (alphabetical by
  // company, newest invoice first within a client); default is newest-first.
  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] =
    params.sort === 'client'
      ? [{ customer: { companyName: 'asc' } }, { customer: { clientId: 'asc' } }, { invoiceDate: 'desc' }]
      : [{ createdAt: 'desc' }];

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy,
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
    include: {
      // The invoice template shows each line's product and its details.
      items: {
        // products = the per-product snapshot taken when the invoice was issued.
        include: { product: true, products: { orderBy: { position: 'asc' } } },
      },
      payments: true,
      customer: {
        include: {
          addresses: true,
          // The template breaks each line down per product exactly as the create
          // and edit forms do — agreed price, Unit/Hours and net per product —
          // and those live on the customer's product assignments.
          customerProducts: { include: { product: true, licence: true } },
        },
      },
    },
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

/**
 * The reference the next created invoice will get, without consuming it. Peeked
 * (not incremented), so it can shift if another invoice is created first — good
 * enough to preview in the create form.
 */
export async function previewNextInvoiceReference(): Promise<string> {
  const counter = await prisma.counter.findUnique({ where: { key: 'invoiceReference' } });
  return formatInvoiceReference((counter?.value ?? 0) + 1);
}

/**
 * The due date: invoice date + the term's payment window. The term decides only
 * how long the client has to pay — never what is billed or when the next invoice
 * is raised (that is nextBillingDate). Mirrors termToDays in the frontend's
 * lib/proration so both sides agree on the day.
 *
 * Only two terms are offered now, but invoices and product assignments written
 * before the split still carry longer ones, so those keep resolving to their own
 * length instead of silently becoming net 7.
 */
function resolveDueDate(invoiceDate: Date, term?: string, customDays?: number, dueDate?: Date): Date {
  if (dueDate) return dueDate;
  const base = new Date(invoiceDate);
  const add = (days: number) => new Date(base.getTime() + days * 86_400_000);
  switch ((term ?? '').trim()) {
    case '':
    case 'DUE_ON_RECEIPT':
    case 'Due on Receipt':
      return base;
    case 'NET_7':
    case '7 Days':
      return add(7);
    case 'Custom':
      return add(customDays ?? 0);
    default: {
      // Legacy terms (NET_30, "90 Days", a hand-typed "Net 21 days"…).
      const m = /(\d+)/.exec(term ?? '');
      return add(m ? parseInt(m[1], 10) : 0);
    }
  }
}

/**
 * Default next billing date for monthly billing: the 1st of the month after the
 * invoice date. Used when a caller does not supply one, so every invoice carries
 * the billing cycle it belongs to.
 */
function defaultNextBillingDate(invoiceDate: Date): Date {
  return new Date(invoiceDate.getFullYear(), invoiceDate.getMonth() + 1, 1);
}

type CreateInput = {
  clientId: string;
  invoiceDate?: Date;
  dueDate?: Date;
  /** The payment window only — how long the client has to pay. */
  term?: string;
  /** Start of the next billing period; defaults to the 1st of the next month. */
  nextBillingDate?: Date;
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
    contractType?: 'LOCKED' | 'TRIAL';
    gstType?: 'INCLUSIVE' | 'EXCLUSIVE';
  }>;
};

/** A customer's product assignment, with what the snapshot needs off it. */
type Assignment = {
  id: string;
  productId: string;
  price: Prisma.Decimal;
  unit: string | null;
  unitHoursEnabled: boolean;
  unitHours: Prisma.Decimal | null;
  taxRate: Prisma.Decimal | null;
  gstType: string | null;
  product: { name: string; sku: string | null; productCode: string };
  licence: { licenceKey: string } | null;
};

/**
 * The customer's product assignments, needed to snapshot what each line bills.
 * Fetched once per invoice write.
 */
async function loadAssignments(customerId: string): Promise<Assignment[]> {
  return prisma.customerProduct.findMany({
    where: { customerId },
    select: {
      id: true,
      productId: true,
      price: true,
      unit: true,
      unitHoursEnabled: true,
      unitHours: true,
      taxRate: true,
      gstType: true,
      product: { select: { name: true, sku: true, productCode: true } },
      licence: { select: { licenceKey: true } },
    },
  }) as unknown as Promise<Assignment[]>;
}

/** The Unit/Hours multiplier on an assignment (1 when it is not unit-priced). */
const assignmentUnits = (a: Assignment): Money => (a.unitHoursEnabled ? D(a.unitHours ?? 0) : D(1));
/** An assignment's agreed net: agreed price x Unit/Hours. */
const assignmentNet = (a: Assignment): Money => D(a.price ?? 0).mul(assignmentUnits(a));

/**
 * The per-product snapshot rows for one line.
 *
 * A line can bill a whole licence group, so it is split across that group's
 * products by each one's agreed net (price x Unit/Hours), with the last row
 * absorbing the rounding so the shares always sum to the line's total. The
 * product's name, SKU, unit and agreed commercials are copied in, so a later
 * change to the assignment cannot rewrite an invoice that has gone out.
 *
 * Returns an empty array for a line with no assignment behind it (a manually
 * typed one) — such a line renders from what it stores itself.
 */
function snapshotLineProducts(
  assignments: Assignment[],
  item: { productId?: string | null; sku?: string | null },
  lineTotal: Money
) {
  // A line carries its licence number as its sku, which is how a group is
  // identified; fall back to the representative product it was built from.
  let group = item.sku
    ? assignments.filter((a) => a.licence?.licenceKey && a.licence.licenceKey === item.sku)
    : [];
  if (!group.length && item.productId) {
    const rep = assignments.find((a) => a.productId === item.productId);
    if (rep) {
      const key = rep.licence?.licenceKey;
      group = key ? assignments.filter((a) => a.licence?.licenceKey === key) : [rep];
    }
  }
  if (!group.length) return [];

  const nets = group.map(assignmentNet);
  const base = nets.reduce((sum, n) => sum.add(n), D(0));
  const last = group.length - 1;
  const amounts: Money[] = group.map((_, i) =>
    i === last
      ? D(0)
      : base.gt(0)
        ? round2(lineTotal.mul(nets[i]).div(base))
        : round2(lineTotal.div(group.length))
  );
  amounts[last] = round2(lineTotal.sub(amounts.reduce((sum, n) => sum.add(n), D(0))));

  return group.map((a, i) => ({
    productId: a.productId,
    name: a.product.name,
    sku: a.product.sku || a.product.productCode || null,
    unit: a.unit,
    agreedPrice: round2(D(a.price ?? 0)),
    unitHours: a.unitHoursEnabled ? round2(D(a.unitHours ?? 0)) : null,
    // Each assignment agrees its own GST, so the invoice can state it per product.
    taxRate: a.taxRate != null ? round2(D(a.taxRate)) : null,
    gstType: a.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : a.gstType === 'EXCLUSIVE' ? 'EXCLUSIVE' : null,
    amount: amounts[i],
    position: i,
  }));
}

export async function createInvoice(input: CreateInput) {
  const customer = await prisma.customer.findUnique({ where: { clientId: input.clientId } });
  if (!customer) throw ApiError.notFound('Customer not found');

  const invoiceDate = input.invoiceDate ?? new Date();
  const dueDate = resolveDueDate(invoiceDate, input.term, input.customDays, input.dueDate);
  const nextBillingDate = input.nextBillingDate ?? defaultNextBillingDate(invoiceDate);
  const totals = computeInvoiceTotals(input.items, input.discount);
  const assignments = await loadAssignments(customer.id);

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
      formatInvoiceReference(await nextSequence(tx, 'invoiceReference'));

    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        customerId: customer.id,
        invoiceDate,
        dueDate,
        term: input.term,
        nextBillingDate,
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
              contractType: it.contractType ?? 'LOCKED',
              gstType: it.gstType ?? 'EXCLUSIVE',
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
              products: {
                create: snapshotLineProducts(assignments, it, line.lineTotal),
              },
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
    include: {
      items: {
        // products = the per-product snapshot taken when the invoice was issued.
        include: { product: true, products: { orderBy: { position: 'asc' } } },
      },
      customer: { include: { addresses: true } },
    },
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

type UpdateInput = {
  invoiceDate?: Date;
  dueDate?: Date;
  /** The payment window only — how long the client has to pay. */
  term?: string;
  /** Start of the next billing period; defaults to the 1st of the next month. */
  nextBillingDate?: Date;
  customDays?: number;
  reference?: string;
  discount: number;
  notes?: string;
  items: CreateInput['items'];
};

/**
 * Edit an existing invoice (admin only). Replaces its line items, recomputes the
 * totals and refreshes the payment link/QR for the new amount. The customer and
 * any recorded payments are left as-is — only the invoice's own fields change.
 */
export async function updateInvoice(id: string, input: UpdateInput) {
  const existing = await prisma.invoice.findUnique({
    where: { id },
    include: { customer: true },
  });
  if (!existing) throw ApiError.notFound('Invoice not found');

  const invoiceDate = input.invoiceDate ?? existing.invoiceDate;
  const dueDate = resolveDueDate(invoiceDate, input.term, input.customDays, input.dueDate);
  // Keep whatever the invoice already had when the caller sends nothing, so an
  // update never quietly moves the billing cycle.
  const nextBillingDate =
    input.nextBillingDate ?? existing.nextBillingDate ?? defaultNextBillingDate(invoiceDate);
  const totals = computeInvoiceTotals(input.items, input.discount);
  // Keep the existing reference unless a new non-empty one is supplied.
  const reference = input.reference?.trim() || existing.reference || undefined;
  // The lines are replaced below, so their per-product snapshot is rebuilt too —
  // an edit re-states what the invoice bills as of the edit.
  const assignments = await loadAssignments(existing.customerId);

  await prisma.$transaction(async (tx) => {
    // Cascades to each line's InvoiceItemProduct snapshot rows.
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({
      where: { id },
      data: {
        invoiceDate,
        dueDate,
        term: input.term,
        nextBillingDate,
        customDays: input.customDays ?? null,
        ...(reference ? { reference } : {}),
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
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
              contractType: it.contractType ?? 'LOCKED',
              gstType: it.gstType ?? 'EXCLUSIVE',
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
              products: {
                create: snapshotLineProducts(assignments, it, line.lineTotal),
              },
            };
          }),
        },
      },
    });
  });

  // Refresh the pay link + QR for the (possibly changed) total.
  const c = existing.customer;
  const payment = await paymentProvider.createPayment({
    invoiceId: id,
    invoiceNumber: existing.invoiceNumber,
    amount: totals.total.toString(),
    currency: existing.currency,
    customerEmail: c.billingEmail ?? c.contactEmail ?? undefined,
    description: `Payment for ${existing.invoiceNumber}`,
  });
  const qr = await generateQrDataUrl(payment.paymentUrl);

  return prisma.invoice.update({
    where: { id },
    data: { paymentUrl: payment.paymentUrl, paymentQrUrl: qr },
    include: {
      items: {
        // products = the per-product snapshot taken when the invoice was issued.
        include: { product: true, products: { orderBy: { position: 'asc' } } },
      },
      customer: { include: { addresses: true } },
    },
  });
}

export async function updateStatus(id: string, status: InvoiceStatus) {
  await prisma.invoice.findUniqueOrThrow({ where: { id } });
  return prisma.invoice.update({ where: { id }, data: { status } });
}

/**
 * Permanently delete an invoice (admin only). Line items cascade automatically;
 * any recorded payments are removed first in the same transaction (the Payment
 * → Invoice relation has no cascade), so no orphan rows are left behind.
 */
export async function deleteInvoice(id: string): Promise<{ invoiceNumber: string }> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id },
    select: { id: true, invoiceNumber: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.delete({ where: { id } }); // items cascade
  });
  return { invoiceNumber: invoice.invoiceNumber };
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
