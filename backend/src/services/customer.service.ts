import {
  Prisma,
  CustomerStatus,
  CustomerAccountStatus,
  AddressType,
  LicenceStatus,
  BusinessType,
} from '@prisma/client';
import argon2 from 'argon2';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { PageQuery } from '../utils/http.js';
import { encryptSecret, decryptSecret } from '../utils/secretBox.js';
import { reserveStock } from './product.service.js';
import { nextSequence, formatClientId, formatLicenceKey } from '../utils/sequence.js';
import { computeLicenceStatus } from '../utils/licence.js';
import { effectiveAccountStatus, dormancyCutoff } from '../utils/accountStatus.js';

/**
 * The customer-list filter. `ACTIVE`/`ARCHIVED` select the archive state; the
 * two account standings (`DORMANT`, `SUSPENDED`) narrow the non-archived set by
 * the *effective* status shown in the table — matching what the operator sees.
 */
export type CustomerListStatus = 'ACTIVE' | 'ARCHIVED' | 'DORMANT' | 'SUSPENDED';

interface ListParams extends PageQuery {
  search?: string;
  status?: CustomerListStatus;
  businessType?: BusinessType;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function listCustomers(params: ListParams) {
  const where: Prisma.CustomerWhereInput = {};
  const status = params.status ?? 'ACTIVE';

  if (status === 'ARCHIVED') {
    where.status = CustomerStatus.ARCHIVED;
  } else {
    // Account-status filters live inside the working (non-archived) set.
    where.status = CustomerStatus.ACTIVE;
    if (status === 'SUSPENDED') {
      // Suspended is always a pinned override, so stored == effective.
      where.accountStatus = CustomerAccountStatus.SUSPENDED;
    } else if (status === 'DORMANT') {
      // Effective dormant: pinned dormant, or active with no recent invoice.
      where.AND = [
        {
          OR: [
            { accountStatus: CustomerAccountStatus.DORMANT },
            {
              accountStatus: CustomerAccountStatus.ACTIVE,
              invoices: { none: { invoiceDate: { gte: dormancyCutoff() } } },
              createdAt: { lt: dormancyCutoff() },
            },
          ],
        },
      ];
    }
    // status === 'ACTIVE' keeps the whole non-archived set (unchanged default).
  }

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
      c.invoices.map((i) => i.invoiceDate),
      c.createdAt
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
      itContacts: true,
      customerProducts: { include: { product: true, licence: true } },
      invoices: { include: { payments: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!customer) throw ApiError.notFound('Customer not found');
  // The portal login (if any) linked to this customer. Never expose the hash or
  // the encrypted copy here — only whether a login exists and its email.
  const login = await prisma.clientUser.findFirst({
    where: { customerId: customer.id },
    select: { email: true },
    orderBy: { createdAt: 'asc' },
  });
  return {
    ...customer,
    credentialEmail: login?.email ?? null,
    hasCredential: !!login,
    accountStatusEffective: effectiveAccountStatus(
      customer.accountStatus,
      customer.invoices.map((i) => i.invoiceDate),
      customer.createdAt
    ),
  };
}

/** First + last name for a provisioned login, derived from the customer. */
function credentialName(customer: { contactPerson: string | null; companyName: string | null }) {
  const source = (customer.contactPerson || customer.companyName || 'Customer').trim();
  const [first, ...rest] = source.split(/\s+/);
  return { firstName: first || 'Customer', lastName: rest.join(' ') || 'Account' };
}

/**
 * An email may exist in AT MOST ONE portal table (see services/accounts.ts).
 * Enforce that inside the credential transaction, ignoring the login we're
 * updating.
 */
async function ensureEmailFree(
  tx: Prisma.TransactionClient,
  email: string,
  exceptClientUserId?: string
) {
  const e = email.toLowerCase();
  const [admin, client, supplier, employee] = await Promise.all([
    tx.adminUser.findUnique({ where: { email: e }, select: { id: true } }),
    tx.clientUser.findUnique({ where: { email: e }, select: { id: true } }),
    tx.supplierUser.findUnique({ where: { email: e }, select: { id: true } }),
    tx.employeeUser.findUnique({ where: { email: e }, select: { id: true } }),
  ]);
  const clash = admin || supplier || employee || (client && client.id !== exceptClientUserId);
  if (clash) throw ApiError.badRequest('That login email is already in use by another account');
}

/**
 * Create or update the customer's portal login from the admin form.
 *
 * A brand-new login is auto-approved so the customer can sign in immediately.
 * The password is stored twice: a one-way argon2 hash (used to authenticate)
 * and a reversible AES copy (so the admin can reveal it later, as required).
 */
async function upsertCredential(
  tx: Prisma.TransactionClient,
  customer: { id: string; contactPerson: string | null; companyName: string | null },
  credential?: { email?: string; password?: string }
) {
  if (!credential) return;
  const email = credential.email?.trim().toLowerCase() || '';
  const password = credential.password?.trim() || '';

  const existing = await tx.clientUser.findFirst({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'asc' },
  });

  if (!existing) {
    // Nothing typed and no login yet — leave it alone.
    if (!email && !password) return;
    if (!email) throw ApiError.badRequest('A login email is required to create customer credentials');
    if (!password) throw ApiError.badRequest('A password is required to create customer credentials');
    await ensureEmailFree(tx, email);
    const { firstName, lastName } = credentialName(customer);
    await tx.clientUser.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash: await argon2.hash(password),
        passwordEnc: encryptSecret(password),
        approvalStatus: 'APPROVED',
        customerId: customer.id,
      },
    });
    return;
  }

  // Update the existing login — change the email and/or reset the password.
  const data: Prisma.ClientUserUpdateInput = {};
  if (email && email !== existing.email) {
    await ensureEmailFree(tx, email, existing.id);
    data.email = email;
  }
  if (password) {
    data.passwordHash = await argon2.hash(password);
    const enc = encryptSecret(password);
    if (enc) data.passwordEnc = enc;
  }
  if (Object.keys(data).length) {
    await tx.clientUser.update({ where: { id: existing.id }, data });
  }
}

/**
 * Reveal the customer's current portal password for an admin. Returns null when
 * no reveal copy exists (self-registered login, or set before encryption was
 * configured) — the admin can still reset it from the form.
 */
export async function revealCredential(clientId: string) {
  const customer = await prisma.customer.findUnique({
    where: { clientId },
    select: {
      users: {
        select: { email: true, passwordEnc: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  if (!customer) throw ApiError.notFound('Customer not found');
  const login = customer.users[0];
  if (!login) throw ApiError.notFound('This customer has no portal login yet');
  const password = decryptSecret(login.passwordEnc);
  return { email: login.email, password, available: password !== null };
}

const CREDENTIAL_SELECT = {
  id: true,
  email: true,
  isActive: true,
  approvalStatus: true,
  createdAt: true,
} as const;

/**
 * Every portal login linked to this customer. An admin can grant access to more
 * than one person, so this returns the full list (no secrets — reveal is a
 * separate, explicit call).
 */
export async function listCredentials(clientId: string) {
  const customer = await prisma.customer.findUnique({
    where: { clientId },
    select: { users: { select: CREDENTIAL_SELECT, orderBy: { createdAt: 'asc' } } },
  });
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer.users;
}

/**
 * Add an additional portal login for this customer so the admin can give access
 * to someone else. Auto-approved, exactly like the first login.
 */
export async function addCredential(clientId: string, input: { email?: string; password?: string }) {
  const customer = await prisma.customer.findUnique({
    where: { clientId },
    select: { id: true, contactPerson: true, companyName: true },
  });
  if (!customer) throw ApiError.notFound('Customer not found');
  const email = input.email?.trim().toLowerCase() || '';
  const password = input.password?.trim() || '';
  if (!email) throw ApiError.badRequest('A login email is required');
  if (!password) throw ApiError.badRequest('A password is required');
  await ensureEmailFree(prisma, email);
  const { firstName, lastName } = credentialName(customer);
  return prisma.clientUser.create({
    data: {
      firstName,
      lastName,
      email,
      passwordHash: await argon2.hash(password),
      passwordEnc: encryptSecret(password),
      approvalStatus: 'APPROVED',
      customerId: customer.id,
    },
    select: CREDENTIAL_SELECT,
  });
}

/** Reveal a specific login's password (admin only). */
export async function revealCredentialById(clientId: string, userId: string) {
  const customer = await prisma.customer.findUnique({ where: { clientId }, select: { id: true } });
  if (!customer) throw ApiError.notFound('Customer not found');
  const login = await prisma.clientUser.findFirst({
    where: { id: userId, customerId: customer.id },
    select: { email: true, passwordEnc: true },
  });
  if (!login) throw ApiError.notFound('Login not found for this customer');
  const password = decryptSecret(login.passwordEnc);
  return { email: login.email, password, available: password !== null };
}

/** Reset a specific login's password (admin only). Updates both the argon2 hash
 *  used to authenticate and the reversible copy the admin can later reveal. */
export async function changeCredentialPassword(clientId: string, userId: string, password?: string) {
  const customer = await prisma.customer.findUnique({ where: { clientId }, select: { id: true } });
  if (!customer) throw ApiError.notFound('Customer not found');
  const login = await prisma.clientUser.findFirst({
    where: { id: userId, customerId: customer.id },
    select: { id: true },
  });
  if (!login) throw ApiError.notFound('Login not found for this customer');
  const pw = password?.trim() || '';
  if (pw.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');
  await prisma.clientUser.update({
    where: { id: login.id },
    data: { passwordHash: await argon2.hash(pw), passwordEnc: encryptSecret(pw) },
  });
  return { id: login.id };
}

/** Remove a portal login from this customer, revoking that person's access. */
export async function removeCredential(clientId: string, userId: string) {
  const customer = await prisma.customer.findUnique({ where: { clientId }, select: { id: true } });
  if (!customer) throw ApiError.notFound('Customer not found');
  const login = await prisma.clientUser.findFirst({
    where: { id: userId, customerId: customer.id },
    select: { id: true },
  });
  if (!login) throw ApiError.notFound('Login not found for this customer');
  await prisma.clientUser.delete({ where: { id: login.id } });
  return { id: login.id };
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
    firstName?: string;
    middleName?: string;
    lastName?: string;
    email?: string;
    contactNumber?: string;
    contactNumberCountry?: string;
  }>;

  // IT Details — technical contacts (name / email / phone), repeatable.
  itContacts?: Array<{
    name?: string;
    email?: string;
    phone?: string;
    phoneCountry?: string;
  }>;

  // Invoicing Details
  invoiceCustomer?: string;
  billingEmail?: string;
  billingContactPerson?: string;
  billingContactNumber?: string;
  billingContactNumberCountry?: string;
  creditScore?: number | '';
  invoiceTerm?: string;
  paymentMethod?: string;

  reference?: string;
  accountStatus?: CustomerAccountStatus;

  // Customer Credential — the admin-provisioned client portal login. Optional:
  // present it only when the admin is setting or changing the login.
  credential?: {
    email?: string;
    password?: string;
  };

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

    invoiceCustomer: orNull(input.invoiceCustomer),
    billingEmail: orNull(input.billingEmail),
    billingContactPerson: orNull(input.billingContactPerson),
    billingContactNumber: orNull(input.billingContactNumber),
    billingContactNumberCountry: orNull(input.billingContactNumberCountry) ?? 'AU',
    creditScore: numOrNull(input.creditScore),
    invoiceTerm: orNull(input.invoiceTerm),
    paymentMethod: orNull(input.paymentMethod),

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

    const itContacts = cleanItContacts(input.itContacts);
    if (itContacts.length) {
      await tx.customerITContact.createMany({
        data: itContacts.map((c) => ({ ...c, customerId: customer.id })),
      });
    }

    await upsertCredential(tx, customer, input.credential);

    return tx.customer.findUniqueOrThrow({
      where: { id: customer.id },
      include: {
        addresses: true,
        directors: true,
        itContacts: true,
        customerProducts: { include: { product: true, licence: true } },
      },
    });
    // Creating a customer can assign several products + licences and a login, so
    // allow more than Prisma's 5s interactive-transaction default over the
    // remote database.
  }, { timeout: 20000, maxWait: 15000 });
}

/** Drop blank director rows; a row counts once it has an email. */
function cleanDirectors(list?: CreateInput['directors']) {
  return (list ?? [])
    .filter((d) => d.email?.trim())
    .map((d) => ({
      firstName: d.firstName?.trim() || null,
      middleName: d.middleName?.trim() || null,
      lastName: d.lastName?.trim() || null,
      email: d.email!.trim(),
      contactNumber: (d.contactNumber ?? '').replace(/\D/g, '') || null,
      contactNumberCountry: d.contactNumberCountry?.trim() || 'AU',
    }));
}

/** Drop blank IT-contact rows; a row counts once any of its fields is filled. */
function cleanItContacts(list?: CreateInput['itContacts']) {
  return (list ?? [])
    .filter((c) => c.name?.trim() || c.email?.trim() || c.phone?.trim())
    .map((c) => ({
      name: c.name?.trim() || null,
      email: c.email?.trim() || null,
      phone: (c.phone ?? '').replace(/\D/g, '') || null,
      phoneCountry: c.phoneCountry?.trim() || 'AU',
    }));
}

function cleanAddress(a: Record<string, string | undefined>) {
  return {
    line1: a.line1 || null,
    line2: a.line2 || null,
    city: a.city || null,
    suburb: a.suburb || null,
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

    // IT contacts are a full list from the form — replace the set outright so a
    // removed row actually disappears rather than lingering.
    if (input.itContacts !== undefined) {
      await tx.customerITContact.deleteMany({ where: { customerId: existing.id } });
      const itContacts = cleanItContacts(input.itContacts);
      if (itContacts.length) {
        await tx.customerITContact.createMany({
          data: itContacts.map((c) => ({ ...c, customerId: existing.id })),
        });
      }
    }

    await upsertCredential(tx, existing, input.credential);

    return tx.customer.findUniqueOrThrow({
      where: { id: existing.id },
      include: { addresses: true, directors: true, itContacts: true },
    });
    // The shared Azure DB adds round-trip latency; this transaction touches
    // addresses, directors and the portal login, so give it more than the 5s
    // interactive default.
  }, { timeout: 20000, maxWait: 15000 });
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

/**
 * Permanently delete a customer and everything scoped to it — addresses,
 * directors, assigned products and their licences cascade at the database level,
 * and portal users are unlinked. Any stock the customer's products were holding
 * is returned to available first.
 *
 * A customer with invoices is refused: invoices are financial records and must
 * be kept, so the operator is directed to archive instead. This is irreversible.
 */
export async function deleteCustomer(clientId: string) {
  const existing = await prisma.customer.findUnique({
    where: { clientId },
    include: {
      _count: { select: { invoices: true } },
      customerProducts: { select: { productId: true, quantity: true } },
    },
  });
  if (!existing) throw ApiError.notFound('Customer not found');

  if (existing._count.invoices > 0) {
    throw ApiError.badRequest(
      'This customer has invoices and cannot be permanently deleted. Archive it instead to keep the billing history.'
    );
  }

  await prisma.$transaction(async (tx) => {
    // Hand back the stock each assigned product was holding — the inverse of the
    // reservation made when the product was assigned.
    for (const cp of existing.customerProducts) {
      await tx.product.update({
        where: { id: cp.productId },
        data: {
          availableStock: { increment: cp.quantity },
          reservedStock: { decrement: cp.quantity },
        },
      });
    }
    await tx.customer.delete({ where: { id: existing.id } });
  });

  // Bare details for the audit log — the row itself is gone.
  return { id: existing.id, clientId: existing.clientId, companyName: existing.companyName };
}
