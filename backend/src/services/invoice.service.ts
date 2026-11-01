import { Prisma, InvoiceStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { PageQuery } from '../utils/http.js';
import { computeInvoiceTotals, computeLine, D, periodFactor, round2, type Money } from '../utils/money.js';
import {
  nextSequence,
  formatInvoiceNumber,
  formatInvoiceReference,
  INVOICE_NUMBER_COUNTER,
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
  discountPercent: Prisma.Decimal | null;
  unit: string | null;
  unitHoursEnabled: boolean;
  unitHours: Prisma.Decimal | null;
  taxRate: Prisma.Decimal | null;
  gstType: string | null;
  contractType: string;
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
      unit: true,
      unitHoursEnabled: true,
      unitHours: true,
      taxRate: true,
      gstType: true,
      contractType: true,
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
  return assignmentNet(a).mul(periodFactor(a.product.billingPeriod, period.billedDays, period.periodDays));
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

export async function createInvoice(input: CreateInput) {
  const customer = await prisma.customer.findUnique({ where: { clientId: input.clientId } });
  if (!customer) throw ApiError.notFound('Customer not found');

  const invoiceDate = input.invoiceDate ?? new Date();
  const dueDate = resolveDueDate(invoiceDate, input.term, input.customDays, input.dueDate);
  const nextBillingDate = input.nextBillingDate ?? defaultNextBillingDate(invoiceDate);
  const totals = computeInvoiceTotals(input.items, input.discount);
  const assignments = await loadAssignments(customer.id);
  const period = billedPeriod(invoiceDate, nextBillingDate);

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = formatInvoiceNumber(await nextSequence(tx, INVOICE_NUMBER_COUNTER));

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
                create: snapshotLineProducts(assignments, it, line.lineTotal, period),
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

/**
 * Re-price every unpaid invoice (no payment received yet) against the current
 * product assignments, so a change to a product or a customer's agreed terms
 * shows on those invoices straight away — the same result as opening the
 * invoice, letting the form re-price it and saving. Each line backed by a
 * licence group gets that group's current billed amount, names, licence key,
 * GST and per-product snapshot; manual lines are left alone. Paid, part-paid
 * and cancelled invoices are never touched.
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

  const assignmentsByCustomer = new Map<string, Assignment[]>();
  const changes: InvoiceSyncChange[] = [];

  for (const inv of invoices) {
    let assignments = assignmentsByCustomer.get(inv.customerId);
    if (!assignments) {
      assignments = await loadAssignments(inv.customerId);
      assignmentsByCustomer.set(inv.customerId, assignments);
    }
    const period = billedPeriod(inv.invoiceDate, inv.nextBillingDate ?? defaultNextBillingDate(inv.invoiceDate));

    let changed = false;
    const lines: Array<{
      id: string;
      calc: Parameters<typeof computeLine>[0];
      update: { data: Prisma.InvoiceItemUncheckedUpdateInput; snapshot: SnapshotRow[] } | null;
    }> = [];

    for (const item of inv.items) {
      const gstOf = (v: string | null) => (v === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE') as 'INCLUSIVE' | 'EXCLUSIVE';
      const group = lineGroup(assignments, item);
      if (!group.length) {
        lines.push({
          id: item.id,
          calc: { quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate, gstType: gstOf(item.gstType) },
          update: null,
        });
        continue;
      }

      // Same as picking the group on the invoice form: one line for the whole
      // group, priced at what it bills for this invoice's period.
      const rep = group[0];
      const calc = {
        quantity: item.quantity,
        unitPrice: round2(group.reduce((sum, a) => sum.add(assignmentBilled(a, period)), D(0))),
        taxRate: round2(D(rep.taxRate ?? 10)),
        gstType: gstOf(rep.gstType),
      };
      const line = computeLine(calc);
      const sku = rep.licence?.licenceKey || rep.product.sku || rep.product.productCode || null;
      const data = {
        productId: rep.productId,
        sku,
        description: group.map((a) => a.product.name).join('\n'),
        unitPrice: calc.unitPrice,
        taxRate: calc.taxRate,
        gstType: calc.gstType,
        contractType: rep.contractType === 'TRIAL' ? 'TRIAL' : 'LOCKED',
        taxAmount: line.taxAmount,
        lineTotal: line.lineTotal,
      };
      const snapshot = snapshotLineProducts(assignments, { productId: rep.productId, sku }, line.lineTotal, period);

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
    if (!changed) continue;

    // A discount can't exceed what is left to bill.
    const calcs = lines.map((l) => l.calc);
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
