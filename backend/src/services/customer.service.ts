import {
  Prisma,
  CustomerStatus,
  CustomerAccountStatus,
  AddressType,
  LicenceStatus,
  BusinessType,
} from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { PageQuery } from '../utils/http.js';
import { reserveStock } from './product.service.js';
import { nextSequence, formatClientId, formatLicenceKey } from '../utils/sequence.js';
import { computeLicenceStatus } from '../utils/licence.js';
import { effectiveAccountStatus } from '../utils/accountStatus.js';

interface ListParams extends PageQuery {
  search?: string;
  status?: CustomerStatus;
  businessType?: BusinessType;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function listCustomers(params: ListParams) {
  const where: Prisma.CustomerWhereInput = {};
  where.status = params.status ?? CustomerStatus.ACTIVE;
  if (params.businessType) where.businessType = params.businessType;

  if (params.search) {
    const q = params.search.trim();
    const like = { contains: q, mode: 'insensitive' as const };
    where.OR = [
      { companyName: like },
      { tradingAs: like },
      { clientId: like },
      { contactPerson: like },
      { contactEmail: like },
      { billingEmail: like },
      // ABN/ACN are stored as bare digits — match on what the operator typed
      // with any spacing removed, so "51 824 753 556" finds 51824753556.
      { abn: { contains: q.replace(/\D/g, '') || q } },
      { acn: { contains: q.replace(/\D/g, '') || q } },
      { contactMobile: { contains: q.replace(/\D/g, '') || q } },
      // The list shows a Location column, so let operators search by it too.
      { addresses: { some: { OR: [{ city: like }, { country: like }] } } },
    ];
  }

  const orderBy: Prisma.CustomerOrderByWithRelationInput = params.sortBy
    ? { [params.sortBy]: params.sortDir ?? 'asc' }
    : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy,
      skip: params.skip,
      take: params.take,
      include: {
        _count: { select: { customerProducts: true } },
        invoices: { select: { status: true, total: true, amountPaid: true, invoiceDate: true } },
        customerProducts: { select: { status: true, expiryDate: true } },
        addresses: { select: { type: true, city: true, country: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  const withStatus = items.map((c) => ({
    ...c,
    accountStatusEffective: effectiveAccountStatus(
      c.accountStatus,
      c.invoices.map((i) => i.invoiceDate)
    ),
  }));

  return { items: withStatus, total };
}

/**
 * Best-effort preview of the Client ID the next customer will receive, shown on
 * the Add form. It peeks at the counter without incrementing, so it can shift if
 * another customer is created first — the real ID is assigned atomically on save.
 */
export async function previewNextClientId(): Promise<string> {
  const counter = await prisma.counter.findUnique({ where: { key: 'clientId' } });
  return formatClientId((counter?.value ?? 0) + 1);
}

export async function getCustomerByClientId(clientId: string) {
  const customer = await prisma.customer.findUnique({
    where: { clientId },
    include: {
      addresses: true,
      directors: true,
      customerProducts: { include: { product: true, licence: true } },
      invoices: { include: { payments: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!customer) throw ApiError.notFound('Customer not found');
  return {
    ...customer,
    accountStatusEffective: effectiveAccountStatus(
      customer.accountStatus,
      customer.invoices.map((i) => i.invoiceDate)
    ),
  };
}

type AddressInput = Record<string, string | undefined>;

type CreateInput = {
  // Company Information
  registrationCountry?: string;
  /** Country-specific identifiers keyed by field, e.g. { abn, acn } or { companyNumber, vat }. */
  companyIdentifiers?: Record<string, string>;
  companyName?: string;
  tradingAs?: string;
  tradingNames?: string[];
  businessType?: BusinessType | '';
  principalAddress?: AddressInput;
  billingAddress?: AddressInput;
  sameAsPrincipal?: boolean;

  // Contact Information
  contactPerson?: string;
  contactEmail?: string;
  contactMobile?: string;
  contactMobileCountry?: string;
  contactPosition?: string;
  authorized?: boolean;
  authorizedPerson?: string;
  authorizedEmail?: string;
  authorizedMobile?: string;
  authorizedMobileCountry?: string;

  // Company C-Suite Details
  directors?: Array<{
    designation?: string;
    email?: string;
    contactNumber?: string;
    contactNumberCountry?: string;
  }>;

  // Invoicing Details
  billingEmail?: string;
  billingContactPerson?: string;
  billingContactNumber?: string;
  billingContactNumberCountry?: string;
  creditScore?: number | '';

  reference?: string;
  accountStatus?: CustomerAccountStatus;
  assignedProducts?: Array<{
    productId: string;
    quantity: number;
    price?: number;
    licence?: string;
    status?: 'ACTIVE' | 'SUSPENDED';
    issueDate?: Date;
    expiryDate?: Date;
    notes?: string;
  }>;
};

/** Empty strings arrive from cleared form inputs - persist them as NULL. */
const orNull = (v?: string) => (v?.trim() ? v.trim() : null);
const digitsOrNull = (v?: string) => {
  const d = (v ?? '').replace(/\D/g, '');
  return d ? d : null;
};
/**
 * Trading names arrive as a list from the form (the ABR hands back every name a
 * business is registered under). Blanks and duplicates are dropped, and the
 * first survivor is mirrored into `tradingAs` so search and the list views keep
 * working off a single column.
 */
function tradingNameFields(input: Partial<CreateInput>) {
  const seen = new Set<string>();
  const names = (input.tradingNames ?? [])
    .map((n) => n.trim())
    .filter((n) => {
      const key = n.toLowerCase();
      if (!n || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // An older client that only knows `tradingAs` must not be silently dropped.
  if (!names.length && input.tradingAs?.trim()) names.push(input.tradingAs.trim());

  return { tradingAs: names[0] ?? null, tradingNames: names };
}

const numOrNull = (v?: number | '') =>
  v === '' || v === undefined || v === null || Number.isNaN(v) ? null : Number(v);

/** Keep only the non-empty identifier values; return null when nothing is set. */
function cleanIdentifiers(map?: Record<string, string>) {
  if (!map) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    const trimmed = (v ?? '').trim();
    if (trimmed) out[k] = trimmed;
  }
  return Object.keys(out).length ? out : null;
}

/** Column values shared by create and update, derived from the form payload. */
function customerFields(input: Partial<CreateInput>) {
  const registrationCountry = orNull(input.registrationCountry) ?? 'AU';
  const identifiers = cleanIdentifiers(input.companyIdentifiers);
  // Mirror Australia's ABN/ACN into their own columns so the ABN lookup and the
  // list search (which query these columns) keep working; other countries store
  // everything in companyIdentifiers only.
  const isAu = registrationCountry.toUpperCase() === 'AU';

  return {
    registrationCountry,
    // DbNull (not undefined) so switching to a country with no values actually
    // clears a previously-saved set rather than leaving it behind.
    companyIdentifiers: identifiers ?? Prisma.DbNull,
    abn: isAu ? digitsOrNull(identifiers?.abn) : null,
    acn: isAu ? digitsOrNull(identifiers?.acn) : null,
    companyName: orNull(input.companyName),
    ...tradingNameFields(input),
    businessType: (input.businessType || null) as BusinessType | null,

    contactPerson: orNull(input.contactPerson),
    contactEmail: orNull(input.contactEmail),
    contactMobile: orNull(input.contactMobile),
    contactMobileCountry: orNull(input.contactMobileCountry) ?? 'AU',
    contactPosition: orNull(input.contactPosition),
    authorized: input.authorized ?? false,
    // Representative details are captured when Authorised is "No"; a "Yes" answer
    // clears them so no stale contact data is left behind.
    authorizedPerson: !input.authorized ? orNull(input.authorizedPerson) : null,
    authorizedEmail: !input.authorized ? orNull(input.authorizedEmail) : null,
    authorizedMobile: !input.authorized ? orNull(input.authorizedMobile) : null,
    authorizedMobileCountry: !input.authorized
      ? (orNull(input.authorizedMobileCountry) ?? 'AU')
      : null,

    billingEmail: orNull(input.billingEmail),
    billingContactPerson: orNull(input.billingContactPerson),
    billingContactNumber: orNull(input.billingContactNumber),
    billingContactNumberCountry: orNull(input.billingContactNumberCountry) ?? 'AU',
    creditScore: numOrNull(input.creditScore),

    reference: orNull(input.reference),
    // Left undefined on create, Prisma falls back to the ACTIVE default; on
    // update, undefined leaves the admin's pinned standing untouched.
    accountStatus: input.accountStatus,
  };
}

export async function createCustomer(input: CreateInput) {
  return prisma.$transaction(async (tx) => {
    // Client ID is always system-generated - it is the immutable business key
    // and is never accepted from the client.
    const clientId = formatClientId(await nextSequence(tx, 'clientId'));

    const billing = input.sameAsPrincipal ? input.principalAddress : input.billingAddress;

    const customer = await tx.customer.create({
      data: {
        clientId,
        ...customerFields(input),
        addresses: {
          create: [
            ...(input.principalAddress
              ? [{ type: AddressType.PRINCIPAL, ...cleanAddress(input.principalAddress) }]
              : []),
            ...(billing ? [{ type: AddressType.BILLING, ...cleanAddress(billing) }] : []),
          ],
        },
      },
    });

    for (const ap of input.assignedProducts ?? []) {
      await reserveStock(tx, ap.productId, ap.quantity);
      const status = (ap.status as LicenceStatus) ?? computeLicenceStatus(ap.expiryDate);
      const cp = await tx.customerProduct.create({
        data: {
          customerId: customer.id,
          productId: ap.productId,
          quantity: ap.quantity,
          price: new Prisma.Decimal(ap.price ?? 0),
          issueDate: ap.issueDate ?? new Date(),
          expiryDate: ap.expiryDate ?? null,
          status,
          notes: ap.notes,
        },
      });
      await tx.licence.create({
        data: {
          customerProductId: cp.id,
          licenceKey: ap.licence?.trim() || formatLicenceKey(),
          issueDate: ap.issueDate ?? new Date(),
          expiryDate: ap.expiryDate ?? null,
          status,
        },
      });
    }

    const directors = cleanDirectors(input.directors);
    if (directors.length) {
      await tx.director.createMany({
        data: directors.map((d) => ({ ...d, customerId: customer.id })),
      });
    }

    return tx.customer.findUniqueOrThrow({
      where: { id: customer.id },
      include: {
        addresses: true,
        directors: true,
        customerProducts: { include: { product: true, licence: true } },
      },
    });
  });
}

/** Drop blank director rows; a row counts once it has an email. */
function cleanDirectors(list?: CreateInput['directors']) {
  return (list ?? [])
    .filter((d) => d.email?.trim())
    .map((d) => ({
      designation: d.designation?.trim() || null,
      email: d.email!.trim(),
      contactNumber: (d.contactNumber ?? '').replace(/\D/g, '') || null,
      contactNumberCountry: d.contactNumberCountry?.trim() || 'AU',
    }));
}

function cleanAddress(a: Record<string, string | undefined>) {
  return {
    line1: a.line1 || null,
    line2: a.line2 || null,
    city: a.city || null,
    state: a.state || null,
    postcode: a.postcode || null,
    country: a.country || 'Australia',
  };
}

export async function updateCustomer(clientId: string, input: Partial<CreateInput>) {
  const existing = await prisma.customer.findUnique({ where: { clientId } });
  if (!existing) throw ApiError.notFound('Customer not found');

  return prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { clientId },
      data: customerFields(input),
    });

    const billing = input.sameAsPrincipal ? input.principalAddress : input.billingAddress;
    await upsertAddress(tx, existing.id, AddressType.PRINCIPAL, input.principalAddress);
    await upsertAddress(tx, existing.id, AddressType.BILLING, billing);

    // Directors are a full list from the form — replace the set outright so a
    // removed director actually disappears rather than lingering.
    if (input.directors !== undefined) {
      await tx.director.deleteMany({ where: { customerId: existing.id } });
      const directors = cleanDirectors(input.directors);
      if (directors.length) {
        await tx.director.createMany({
          data: directors.map((d) => ({ ...d, customerId: existing.id })),
        });
      }
    }

    return tx.customer.findUniqueOrThrow({
      where: { id: existing.id },
      include: { addresses: true, directors: true },
    });
  });
}

/** Create the address row on first save, update it on every save after that. */
async function upsertAddress(
  tx: Prisma.TransactionClient,
  customerId: string,
  type: AddressType,
  address?: AddressInput
) {
  if (!address) return;
  const current = await tx.address.findFirst({ where: { customerId, type } });
  if (current) {
    await tx.address.update({ where: { id: current.id }, data: cleanAddress(address) });
  } else {
    await tx.address.create({ data: { customerId, type, ...cleanAddress(address) } });
  }
}

export async function archiveCustomer(clientId: string) {
  const existing = await prisma.customer.findUnique({ where: { clientId } });
  if (!existing) throw ApiError.notFound('Customer not found');
  return prisma.customer.update({
    where: { clientId },
    data: { status: CustomerStatus.ARCHIVED },
  });
}
