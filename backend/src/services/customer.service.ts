import { Prisma, CustomerStatus, AddressType, LicenceStatus, BusinessType } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { PageQuery } from '../utils/http.js';
import { reserveStock } from './product.service.js';
import { nextSequence, formatClientId, formatLicenceKey } from '../utils/sequence.js';
import { computeLicenceStatus } from '../utils/licence.js';

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
      { firstName: like },
      { lastName: like },
      { companyName: like },
      { tradingAs: like },
      { email: like },
      { clientId: like },
      { contactPerson: like },
      { contactEmail: like },
      { billingEmail: like },
      // ABN/ACN are stored as bare digits — match on what the operator typed
      // with any spacing removed, so "51 824 753 556" finds 51824753556.
      { abn: { contains: q.replace(/\D/g, '') || q } },
      { acn: { contains: q.replace(/\D/g, '') || q } },
      { phoneNumber: { contains: q.replace(/\D/g, '') || q } },
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
        invoices: { select: { status: true, total: true, amountPaid: true } },
        customerProducts: { select: { status: true, expiryDate: true } },
        addresses: { select: { type: true, city: true, country: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, total };
}

export async function getCustomerByClientId(clientId: string) {
  const customer = await prisma.customer.findUnique({
    where: { clientId },
    include: {
      addresses: true,
      customerProducts: { include: { product: true, licence: true } },
      invoices: { include: { payments: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
}

type AddressInput = Record<string, string | undefined>;

type CreateInput = {
  // Basic Information
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  phoneNumberCountry?: string;

  // Company Information
  abn?: string;
  acn?: string;
  companyName?: string;
  tradingAs?: string;
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

  // Invoicing Details
  billingEmail?: string;
  billingContactPerson?: string;
  billingContactNumber?: string;
  billingContactNumberCountry?: string;
  creditScore?: number | '';

  reference?: string;
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
const numOrNull = (v?: number | '') =>
  v === '' || v === undefined || v === null || Number.isNaN(v) ? null : Number(v);

/** Column values shared by create and update, derived from the form payload. */
function customerFields(input: Partial<CreateInput>) {
  return {
    phoneNumber: orNull(input.phoneNumber),
    phoneNumberCountry: orNull(input.phoneNumberCountry) ?? 'AU',

    abn: digitsOrNull(input.abn),
    acn: digitsOrNull(input.acn),
    companyName: orNull(input.companyName),
    tradingAs: orNull(input.tradingAs),
    businessType: (input.businessType || null) as BusinessType | null,

    contactPerson: orNull(input.contactPerson),
    contactEmail: orNull(input.contactEmail),
    contactMobile: orNull(input.contactMobile),
    contactMobileCountry: orNull(input.contactMobileCountry) ?? 'AU',
    contactPosition: orNull(input.contactPosition),
    authorized: input.authorized ?? false,
    // Clearing the Authorised flag clears the representative's details with it,
    // so a "No" answer can never leave stale contact data behind.
    authorizedPerson: input.authorized ? orNull(input.authorizedPerson) : null,
    authorizedEmail: input.authorized ? orNull(input.authorizedEmail) : null,
    authorizedMobile: input.authorized ? orNull(input.authorizedMobile) : null,
    authorizedMobileCountry: input.authorized
      ? (orNull(input.authorizedMobileCountry) ?? 'AU')
      : null,

    billingEmail: orNull(input.billingEmail),
    billingContactPerson: orNull(input.billingContactPerson),
    billingContactNumber: orNull(input.billingContactNumber),
    billingContactNumberCountry: orNull(input.billingContactNumberCountry) ?? 'AU',
    creditScore: numOrNull(input.creditScore),

    reference: orNull(input.reference),
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
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
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

    return tx.customer.findUniqueOrThrow({
      where: { id: customer.id },
      include: { addresses: true, customerProducts: { include: { product: true, licence: true } } },
    });
  });
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
      data: {
        ...customerFields(input),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
      },
    });

    const billing = input.sameAsPrincipal ? input.principalAddress : input.billingAddress;
    await upsertAddress(tx, existing.id, AddressType.PRINCIPAL, input.principalAddress);
    await upsertAddress(tx, existing.id, AddressType.BILLING, billing);

    return tx.customer.findUniqueOrThrow({
      where: { id: existing.id },
      include: { addresses: true },
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
