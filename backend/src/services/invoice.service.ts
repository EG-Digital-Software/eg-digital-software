import { Prisma, InvoiceStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { PageQuery } from '../utils/http.js';
import { computeInvoiceTotals, computeLine, D, periodFactor, round2, type Money } from '../utils/money.js';
import {
  nextSequence,
  generateInvoiceNumber,
  formatInvoiceReference,
} from '../utils/sequence.js';
import { paymentProvider, generateQrDataUrl } from './payments/index.js';
import { notify } from './notification.service.js';
import { deliverEmail } from './email/index.js';
import { buildInvoiceEmail } from './email/templates.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

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
/** A date with its time of day cleared. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

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
  /** Raised by a scheduled job (rollover / advance billing), not by an admin. */
  auto?: boolean;
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
  discountPercent: Prisma.Decimal | null;
  priceBasis: string | null;
  unit: string | null;
  unitHoursEnabled: boolean;
  unitHours: Prisma.Decimal | null;
  taxRate: Prisma.Decimal | null;
  gstType: string | null;
  contractType: string;
  status: string;
  approvalStatus: string;
  advancePayment: boolean;
  issueDate: Date;
  expiryDate: Date | null;
  product: { name: string; sku: string | null; productCode: string; billingPeriod: string | null };
  licence: { licenceKey: string } | null;
};

/**
 * The customer's product assignments, needed to snapshot what each line bills.
 * Fetched once per invoice write.
 */
async function loadAssignments(
  customerId: string,
  db: Prisma.TransactionClient = prisma
): Promise<Assignment[]> {
  return db.customerProduct.findMany({
    where: { customerId },
    // Stable order, so a group's products (and its representative) never shuffle.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      productId: true,
      price: true,
      discountPercent: true,
      priceBasis: true,
      unit: true,
      unitHoursEnabled: true,
      unitHours: true,
      taxRate: true,
      gstType: true,
      contractType: true,
      status: true,
      approvalStatus: true,
      advancePayment: true,
      issueDate: true,
      expiryDate: true,
      product: { select: { name: true, sku: true, productCode: true, billingPeriod: true } },
      licence: { select: { licenceKey: true } },
    },
  }) as unknown as Promise<Assignment[]>;
}

/** The Unit/Hours multiplier on an assignment (1 when it is not unit-priced). */
const assignmentUnits = (a: Assignment): Money => (a.unitHoursEnabled ? D(a.unitHours ?? 0) : D(1));
/** The agreed price after the assignment's discount (%). */
const assignmentUnitPrice = (a: Assignment): Money =>
  D(a.price ?? 0).mul(D(100).sub(D(a.discountPercent ?? 0))).div(100);
/** An assignment's agreed net: discounted agreed price x Unit/Hours. */
const assignmentNet = (a: Assignment): Money => assignmentUnitPrice(a).mul(assignmentUnits(a));

/** The days an invoice bills: invoice date up to (not including) the next billing date. */
type BilledPeriod = { billedDays: number; periodDays: number };
function billedPeriod(invoiceDate: Date, nextBillingDate: Date): BilledPeriod {
  const periodDays = new Date(invoiceDate.getFullYear(), invoiceDate.getMonth() + 1, 0).getDate();
  const billedDays = Math.round((nextBillingDate.getTime() - invoiceDate.getTime()) / 86_400_000);
  return { billedDays, periodDays };
}

/**
 * What an assignment bills for the period, per its product's charge period (see
 * periodFactor). Mirrors productBilled in the frontend's lib/proration. An empty
 * period falls back to the agreed net.
 */
function assignmentBilled(a: Assignment, period: BilledPeriod): Money {
  if (period.billedDays <= 0) return assignmentNet(a);
  // An admin-set price basis (per day / per month) wins over the product's own.
  return assignmentNet(a).mul(
    periodFactor(a.priceBasis ?? a.product.billingPeriod, period.billedDays, period.periodDays)
  );
}

/**
 * The per-product snapshot rows for one line.
 *
 * A line can bill a whole licence group, so it is split across that group's
 * products by what each bills for the period (see assignmentBilled), with the last row
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
  lineTotal: Money,
  period: BilledPeriod
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

  const nets = group.map((a) => assignmentBilled(a, period));
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
    // Net of any discount, so agreed price x Unit/Hours reads true on the invoice.
    agreedPrice: round2(assignmentUnitPrice(a)),
    unitHours: a.unitHoursEnabled ? round2(D(a.unitHours ?? 0)) : null,
    // Each assignment agrees its own GST, so the invoice can state it per product.
    taxRate: a.taxRate != null ? round2(D(a.taxRate)) : null,
    gstType: a.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : a.gstType === 'EXCLUSIVE' ? 'EXCLUSIVE' : null,
    amount: amounts[i],
    position: i,
  }));
}

/** Tell the customer's linked, active client logins that an invoice was issued. */
async function notifyClientUsers(
  customerId: string,
  invoiceId: string,
  invoiceNumber: string,
  currency: string,
  total: string
) {
  const clientUsers = await prisma.clientUser.findMany({
    where: { customerId, isActive: true },
    select: { id: true },
  });
  for (const u of clientUsers) {
    notify({
      userId: u.id,
      userType: 'CLIENT',
      type: 'invoice',
      title: 'New invoice issued',
      body: `${invoiceNumber} — ${currency} ${total}`,
      link: `/client/invoices/${invoiceId}`,
      entityType: 'Invoice',
      entityId: invoiceId,
    });
  }
}

export async function createInvoice(input: CreateInput) {
  const customer = await prisma.customer.findUnique({ where: { clientId: input.clientId } });
  if (!customer) throw ApiError.notFound('Customer not found');

  // Date only — a time of day would skew the billed-day count against the form's.
  const invoiceDate = startOfDay(input.invoiceDate ?? new Date());
  const dueDate = resolveDueDate(invoiceDate, input.term, input.customDays, input.dueDate);
  const nextBillingDate = input.nextBillingDate ?? defaultNextBillingDate(invoiceDate);
  const totals = computeInvoiceTotals(input.items, input.discount);
  const assignments = await loadAssignments(customer.id);
  const period = billedPeriod(invoiceDate, nextBillingDate);

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await generateInvoiceNumber(tx);

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
        // A new invoice stays a DRAFT — hidden from the client's portal and
        // never emailed — until the admin clicks "Send to customer".
        status: (input.status as InvoiceStatus) ?? InvoiceStatus.DRAFT,
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
                create: snapshotLineProducts(assignments, it, line.lineTotal, period),
              },
            };
          }),
        },
      },
    });

    // An admin raising an invoice by hand resumes automatic invoicing that a
    // deleted invoice paused.
    if (!input.auto && customer.autoInvoicePausedAt) {
      await tx.customer.update({ where: { id: customer.id }, data: { autoInvoicePausedAt: null } });
    }

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

  // Only an invoice that has been issued reaches the client's portal; a draft
  // notifies them when it is sent (see sendInvoiceEmail).
  if (invoice.status !== InvoiceStatus.DRAFT) {
    await notifyClientUsers(customer.id, invoice.id, invoice.invoiceNumber, invoice.currency, totals.total.toString());
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
  // A draft only now becomes visible in the client's portal — tell them.
  if (invoice.status === InvoiceStatus.DRAFT) {
    await notifyClientUsers(
      invoice.customerId,
      invoice.id,
      invoice.invoiceNumber,
      invoice.currency,
      invoice.total.toString()
    );
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
  const period = billedPeriod(invoiceDate, nextBillingDate);

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
                create: snapshotLineProducts(assignments, it, line.lineTotal, period),
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
 * any recorded payments and the invoice's notifications are removed in the same
 * transaction (the Payment → Invoice relation has no cascade), so no orphan rows
 * are left behind. Deleting a customer's latest invoice also pauses their
 * automatic invoicing (see Customer.autoInvoicePausedAt).
 */
export async function deleteInvoice(id: string): Promise<{ invoiceNumber: string; customerId: string }> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id },
    select: { id: true, invoiceNumber: true, customerId: true },
  });
  await prisma.$transaction(async (tx) => {
    // Was this the invoice the daily rollover would raise the next one from?
    const latest = await tx.invoice.findFirst({
      where: { customerId: invoice.customerId, status: { not: InvoiceStatus.CANCELLED } },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });

    await tx.payment.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.delete({ where: { id } }); // items + per-product snapshots cascade
    // Its "new invoice" / overdue / payment alerts would only link to nothing.
    await tx.notification.deleteMany({ where: { entityType: 'Invoice', entityId: id } });

    // Deleting the latest invoice ends the billing it started: no automatic
    // invoice follows from it (or from the one before it) until an admin raises
    // the customer's next invoice by hand.
    if (latest?.id === id) {
      await tx.customer.update({
        where: { id: invoice.customerId },
        data: { autoInvoicePausedAt: new Date() },
      });
    }
  });
  return { invoiceNumber: invoice.invoiceNumber, customerId: invoice.customerId };
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

/** Invoices still awaiting payment — these follow live changes to what they bill. */
const LIVE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.SENT,
  InvoiceStatus.PENDING,
  InvoiceStatus.OVERDUE,
];

export interface InvoiceSyncChange {
  invoiceNumber: string;
  clientId: string;
  oldTotal: string;
  newTotal: string;
}

type SyncScope = { customerIds?: string[]; productId?: string };
type SnapshotRow = ReturnType<typeof snapshotLineProducts>[number];

const gstOf = (v: string | null) => (v === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE') as 'INCLUSIVE' | 'EXCLUSIVE';

/**
 * One invoice line billing a whole licence group for a period — the same line
 * the invoice form builds when the group is picked: priced at what the group
 * bills for the period, named after its products, keyed by its licence.
 */
function groupLine(group: Assignment[], period: BilledPeriod, quantity = 1) {
  const rep = group[0];
  const calc = {
    quantity,
    unitPrice: round2(group.reduce((sum, a) => sum.add(assignmentBilled(a, period)), D(0))),
    taxRate: round2(D(rep.taxRate ?? 10)),
    gstType: gstOf(rep.gstType),
  };
  const line = computeLine(calc);
  const data = {
    productId: rep.productId,
    sku: rep.licence?.licenceKey || rep.product.sku || rep.product.productCode || null,
    description: group.map((a) => a.product.name).join('\n'),
    quantity,
    unitPrice: calc.unitPrice,
    taxRate: calc.taxRate,
    gstType: calc.gstType,
    contractType: rep.contractType === 'TRIAL' ? 'TRIAL' : 'LOCKED',
    taxAmount: line.taxAmount,
    lineTotal: line.lineTotal,
  };
  return { calc, data };
}

/** A licence group's identity: its licence key, or the lone assignment. */
const groupKeyOf = (a: Assignment) => a.licence?.licenceKey || a.id;

/** Licence statuses that still bill (expired and suspended ones don't). */
const BILLABLE_LICENCE = ['ACTIVE', 'EXPIRING_SOON', 'CRITICAL'];

/**
 * The customer's licence groups that bill for the period [start, end): approved
 * and live, issued before the period ends and not expired before it starts.
 * Groups on advance billing are left out — recurringBilling invoices those on
 * their own cycle, so including them here would bill them twice.
 */
function billableGroups(assignments: Assignment[], start: Date, end: Date): Assignment[][] {
  const groups = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const k = groupKeyOf(a);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(a);
  }
  const bills = (a: Assignment) =>
    BILLABLE_LICENCE.includes(a.status) &&
    a.approvalStatus === 'APPROVED' &&
    !a.advancePayment &&
    a.issueDate < end &&
    (!a.expiryDate || a.expiryDate >= start);
  return [...groups.values()].filter((g) => g.some(bills));
}

/** Each customer's most recent invoice (cancelled ones aside). */
async function latestInvoiceIds(customerIds: string[]): Promise<Set<string>> {
  const latest = await prisma.invoice.findMany({
    where: { customerId: { in: customerIds }, status: { not: InvoiceStatus.CANCELLED } },
    orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    distinct: ['customerId'],
    select: { id: true },
  });
  return new Set(latest.map((i) => i.id));
}

/**
 * Re-price every unpaid invoice (no payment received yet) against the current
 * product assignments, so a change to a product or a customer's agreed terms
 * shows on those invoices straight away — the same result as opening the
 * invoice, letting the form re-price it and saving. Each line backed by a
 * licence group gets that group's current billed amount, names, licence key,
 * GST and per-product snapshot; manual lines are left alone.
 *
 * The customer's latest invoice, while unpaid, also picks up any billable
 * licence group it doesn't bill yet (e.g. a product assigned after it was
 * raised), as a new line for its period. Once that invoice is paid, new
 * products wait for the next cycle's invoice instead. Paid, part-paid and
 * cancelled invoices are never touched.
 *
 * Scope with `customerIds` and/or `productId` (any customer holding it). With
 * `dryRun`, nothing is written — it only reports what would change.
 */
export async function syncUnpaidInvoices(
  scope: SyncScope,
  opts: { dryRun?: boolean } = {}
): Promise<InvoiceSyncChange[]> {
  const where: Prisma.InvoiceWhereInput = { status: { in: LIVE_STATUSES }, amountPaid: { lte: 0 } };
  if (scope.customerIds) where.customerId = { in: scope.customerIds };
  if (scope.productId) where.customer = { customerProducts: { some: { productId: scope.productId } } };

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      customer: { select: { clientId: true } },
      items: { orderBy: { id: 'asc' }, include: { products: { orderBy: { position: 'asc' } } } },
    },
  });
  const latest = await latestInvoiceIds([...new Set(invoices.map((i) => i.customerId))]);

  const assignmentsByCustomer = new Map<string, Assignment[]>();
  const changes: InvoiceSyncChange[] = [];

  for (const inv of invoices) {
    let assignments = assignmentsByCustomer.get(inv.customerId);
    if (!assignments) {
      assignments = await loadAssignments(inv.customerId);
      assignmentsByCustomer.set(inv.customerId, assignments);
    }
    const nextBillingDate = inv.nextBillingDate ?? defaultNextBillingDate(inv.invoiceDate);
    const period = billedPeriod(inv.invoiceDate, nextBillingDate);

    let changed = false;
    const lines: Array<{
      id: string;
      calc: Parameters<typeof computeLine>[0];
      update: { data: Prisma.InvoiceItemUncheckedUpdateInput; snapshot: SnapshotRow[] } | null;
    }> = [];
    const billedGroups = new Set<string>();

    for (const item of inv.items) {
      const group = lineGroup(assignments, item);
      if (!group.length) {
        lines.push({
          id: item.id,
          calc: { quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate, gstType: gstOf(item.gstType) },
          update: null,
        });
        continue;
      }
      billedGroups.add(groupKeyOf(group[0]));

      const { calc, data } = groupLine(group, period, item.quantity);
      const snapshot = snapshotLineProducts(assignments, data, data.lineTotal, period);
      const same =
        item.productId === data.productId &&
        item.sku === data.sku &&
        item.description === data.description &&
        D(item.unitPrice).eq(data.unitPrice) &&
        D(item.taxRate).eq(data.taxRate) &&
        item.gstType === data.gstType &&
        item.contractType === data.contractType &&
        D(item.lineTotal).eq(data.lineTotal) &&
        sameSnapshot(item.products, snapshot);
      if (!same) changed = true;
      lines.push({ id: item.id, calc, update: same ? null : { data, snapshot } });
    }

    // The current (latest) invoice also bills any group it is missing.
    const additions = latest.has(inv.id)
      ? billableGroups(assignments, inv.invoiceDate, nextBillingDate)
          .filter((g) => !billedGroups.has(groupKeyOf(g[0])))
          .map((g) => {
            const { calc, data } = groupLine(g, period);
            return { calc, data, snapshot: snapshotLineProducts(assignments, data, data.lineTotal, period) };
          })
      : [];
    if (additions.length) changed = true;
    if (!changed) continue;

    // A discount can't exceed what is left to bill.
    const calcs = [...lines.map((l) => l.calc), ...additions.map((a) => a.calc)];
    const gross = computeInvoiceTotals(calcs, 0);
    const discount = D(inv.discount).gt(gross.total) ? gross.total : inv.discount;
    const totals = computeInvoiceTotals(calcs, discount);
    changes.push({
      invoiceNumber: inv.invoiceNumber,
      clientId: inv.customer.clientId,
      oldTotal: D(inv.total).toFixed(2),
      newTotal: totals.total.toFixed(2),
    });
    if (opts.dryRun) continue;

    await prisma.$transaction(async (tx) => {
      for (const l of lines) {
        if (!l.update) continue;
        await tx.invoiceItem.update({ where: { id: l.id }, data: l.update.data });
        await tx.invoiceItemProduct.deleteMany({ where: { itemId: l.id } });
        if (l.update.snapshot.length) {
          await tx.invoiceItemProduct.createMany({
            data: l.update.snapshot.map((s) => ({ ...s, itemId: l.id })),
          });
        }
      }
      for (const a of additions) {
        await tx.invoiceItem.create({
          data: { ...a.data, invoiceId: inv.id, products: { create: a.snapshot } },
        });
      }
      await tx.invoice.update({
        where: { id: inv.id },
        data: { subtotal: totals.subtotal, tax: totals.tax, discount: totals.discount, total: totals.total },
      });
    });
  }
  return changes;
}

/**
 * Take lines off a customer's unpaid invoices (no payment received) when the
 * assignments they bill are being removed. Call inside the removal's
 * transaction, BEFORE the assignments are deleted, so each line can still be
 * matched to its licence group. A line is removed only when every product in
 * the group it bills is among `customerProductIds` — a group that keeps some
 * products is re-priced by syncUnpaidInvoices instead. Each touched invoice's
 * totals are recomputed. Returns how many invoices were changed.
 */
export async function removeAssignmentsFromUnpaidInvoices(
  tx: Prisma.TransactionClient,
  customerId: string,
  customerProductIds: string[]
): Promise<number> {
  const removing = new Set(customerProductIds);
  const assignments = await loadAssignments(customerId, tx);
  const invoices = await tx.invoice.findMany({
    where: { customerId, status: { in: LIVE_STATUSES }, amountPaid: { lte: 0 } },
    include: { items: true },
  });

  let changed = 0;
  for (const inv of invoices) {
    const dropped = new Set(
      inv.items
        .filter((item) => {
          const group = lineGroup(assignments, item);
          return group.length > 0 && group.every((a) => removing.has(a.id));
        })
        .map((item) => item.id)
    );
    if (!dropped.size) continue;

    await tx.invoiceItem.deleteMany({ where: { id: { in: [...dropped] } } }); // snapshot rows cascade
    const remaining = inv.items
      .filter((item) => !dropped.has(item.id))
      .map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        gstType: (item.gstType === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE') as 'INCLUSIVE' | 'EXCLUSIVE',
      }));
    // A discount can't exceed what is left to bill.
    const gross = computeInvoiceTotals(remaining, 0);
    const discount = D(inv.discount).gt(gross.total) ? gross.total : inv.discount;
    const totals = computeInvoiceTotals(remaining, discount);
    await tx.invoice.update({
      where: { id: inv.id },
      data: { subtotal: totals.subtotal, tax: totals.tax, discount: totals.discount, total: totals.total },
    });
    changed++;
  }
  return changed;
}

/**
 * The licence group a line bills: matched by its licence key (the line's sku),
 * else by the product it was built from — so a renamed licence key still finds
 * its group. Empty for a manual line.
 */
function lineGroup(assignments: Assignment[], item: { productId: string | null; sku: string | null }): Assignment[] {
  if (item.sku) {
    const byKey = assignments.filter((a) => a.licence?.licenceKey && a.licence.licenceKey === item.sku);
    if (byKey.length) return byKey;
  }
  if (!item.productId) return [];
  const rep = assignments.find((a) => a.productId === item.productId);
  if (!rep) return [];
  const key = rep.licence?.licenceKey;
  return key ? assignments.filter((a) => a.licence?.licenceKey === key) : [rep];
}

/** Whether a line's stored snapshot already matches the freshly built one. */
function sameSnapshot(
  current: Array<{
    productId: string | null;
    name: string;
    sku: string | null;
    unit: string | null;
    agreedPrice: Prisma.Decimal;
    unitHours: Prisma.Decimal | null;
    taxRate: Prisma.Decimal | null;
    gstType: string | null;
    amount: Prisma.Decimal;
  }>,
  next: SnapshotRow[]
): boolean {
  if (current.length !== next.length) return false;
  const dec = (a: Prisma.Decimal.Value | null, b: Prisma.Decimal.Value | null) =>
    a == null || b == null ? a == null && b == null : D(a).eq(b);
  return current.every((c, i) => {
    const n = next[i];
    return (
      c.productId === n.productId &&
      c.name === n.name &&
      c.sku === n.sku &&
      c.unit === n.unit &&
      c.gstType === n.gstType &&
      dec(c.agreedPrice, n.agreedPrice) &&
      dec(c.unitHours, n.unitHours) &&
      dec(c.taxRate, n.taxRate) &&
      dec(c.amount, n.amount)
    );
  });
}

/**
 * Sync unpaid invoices after a change, without failing the change itself: the
 * admin's edit is already saved, so a sync error is logged rather than thrown.
 */
export async function syncUnpaidInvoicesSafely(scope: SyncScope) {
  try {
    await syncUnpaidInvoices(scope);
  } catch (err) {
    logger.error({ err, scope }, 'Unpaid invoice sync failed');
  }
}

export interface RolloverInvoice {
  clientId: string;
  /** The invoice whose next billing date has arrived. */
  from: string;
  /** The new invoice's number, or null on a dry run. */
  invoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
  total: string;
  products: string[];
}

/** YYYY-MM-DD from local date parts (billing dates are local midnights). */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Advance billing for every customer: once the next billing date on a
 * customer's latest invoice arrives, raise the next period's invoice — dated
 * that day, running to the 1st of the following month — billing every licence
 * group that is billable for the period (see billableGroups), priced for it.
 * The new invoice is sent and emailed to the client. Earlier invoices, paid or
 * not, are never changed or removed.
 *
 * Safe to re-run: a customer's latest invoice moves forward with each one
 * raised, so a period is only ever billed once, and a lapsed run catches up
 * one period at a time. A customer with nothing billable for a period gets no
 * invoice. With `dryRun`, nothing is written — it reports what would be raised.
 */
export async function runInvoiceRollover(
  asOf: Date = new Date(),
  opts: { dryRun?: boolean } = {}
): Promise<RolloverInvoice[]> {
  const today = new Date(asOf);
  today.setHours(23, 59, 59, 999);
  const raised: RolloverInvoice[] = [];

  const latest = await prisma.invoice.findMany({
    where: { status: { not: InvoiceStatus.CANCELLED } },
    orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    distinct: ['customerId'],
    select: {
      invoiceNumber: true,
      invoiceDate: true,
      nextBillingDate: true,
      term: true,
      customerId: true,
      customer: { select: { clientId: true, billedThrough: true, autoInvoicePausedAt: true } },
    },
  });

  for (const prev of latest) {
    // Their latest invoice was deleted — wait for an admin to raise the next one.
    if (prev.customer.autoInvoicePausedAt) continue;
    try {
      let from = prev.invoiceNumber;
      let start = prev.nextBillingDate ?? defaultNextBillingDate(prev.invoiceDate);
      // Never roll back over a period an earlier run already billed.
      let cursor = prev.customer.billedThrough;
      if (cursor && cursor > start) start = cursor;
      // Capped so a bad date can never spin forever.
      for (let guard = 0; guard < 12 && start <= today; guard++) {
        const end = defaultNextBillingDate(start);
        const assignments = await loadAssignments(prev.customerId);
        const groups = billableGroups(assignments, start, end);
        if (!groups.length) break; // nothing to bill — check again on the next run

        const period = billedPeriod(start, end);
        const items = groups.map((g) => {
          const { data } = groupLine(g, period);
          return {
            productId: data.productId,
            sku: data.sku ?? undefined,
            description: data.description,
            quantity: data.quantity,
            unitPrice: Number(data.unitPrice),
            taxRate: Number(data.taxRate),
            contractType: data.contractType as 'LOCKED' | 'TRIAL',
            gstType: data.gstType,
          };
        });
        const periodEnd = new Date(end.getTime() - 86_400_000);
        const entry: RolloverInvoice = {
          clientId: prev.customer.clientId,
          from,
          invoiceNumber: null,
          periodStart: ymd(start),
          periodEnd: ymd(periodEnd),
          total: computeInvoiceTotals(items, 0).total.toFixed(2),
          products: groups.flatMap((g) => g.map((a) => a.product.name)),
        };
        if (opts.dryRun) {
          raised.push(entry);
          break; // later periods depend on this one being raised
        }

        // Claim the period before raising it: the cursor moves only if no other
        // run (a second instance, an overlapping restart) has moved it first, so
        // a period can never be invoiced twice.
        const claimed = await prisma.customer.updateMany({
          where: { id: prev.customerId, billedThrough: cursor },
          data: { billedThrough: end },
        });
        if (!claimed.count) break;

        let invoice;
        try {
          invoice = await createInvoice({
            clientId: prev.customer.clientId,
            invoiceDate: start,
            nextBillingDate: end,
            term: prev.term ?? undefined,
            discount: 0,
            status: 'SENT',
            auto: true,
            notes: `Advance billing — ${ymd(start)} to ${ymd(periodEnd)}`,
            items,
          });
        } catch (err) {
          // Nothing was raised — release the claim so the next run retries.
          await prisma.customer.updateMany({
            where: { id: prev.customerId, billedThrough: end },
            data: { billedThrough: cursor },
          });
          throw err;
        }
        cursor = end;
        entry.invoiceNumber = invoice.invoiceNumber;
        raised.push(entry);
        // Best-effort: the invoice exists and is payable in the portal even if
        // the email fails.
        try {
          await sendInvoiceEmail(invoice.id);
        } catch (err) {
          logger.warn({ err, invoiceId: invoice.id }, 'Rollover invoice email failed (invoice kept)');
        }
        from = invoice.invoiceNumber;
        start = end;
      }
    } catch (err) {
      logger.error({ err, clientId: prev.customer.clientId }, 'Invoice rollover failed for a customer');
    }
  }
  if (raised.length && !opts.dryRun) logger.info({ invoices: raised.length }, 'Invoice rollover run complete');
  return raised;
}
