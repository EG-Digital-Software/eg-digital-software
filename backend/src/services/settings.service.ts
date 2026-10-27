import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { encryptSecret, decryptSecret } from '../utils/secretBox.js';

/**
 * Payment configuration for EG Eloma. Stored as a single Setting row under the
 * `payment` key. Secret keys are persisted but NEVER returned in full — admin
 * reads get a masked hint (last 4 chars) instead.
 */
export type PaymentProviderName = 'worldline' | 'mock' | 'stripe' | 'razorpay';
export type WorldlineEnvironment = 'live' | 'test';

export interface PaymentSettings {
  provider: PaymentProviderName;
  publishableKey: string;
  secretKey: string;
  /**
   * ANZ Worldline (Global Online Pay). The PSPID and key ids are identifiers;
   * the two secrets are encrypted at rest when CREDENTIAL_ENC_KEY is set.
   */
  worldlineEnvironment: WorldlineEnvironment;
  worldlineMerchantId: string;
  worldlineApiKeyId: string;
  worldlineApiSecret: string;
  worldlineWebhookKeyId: string;
  worldlineWebhookSecret: string;
  cardPaymentsEnabled: boolean;
  upiEnabled: boolean;
  upiId: string;
  bankTransferEnabled: boolean;
  bankName: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
  payInstructions: string;
}

const PAYMENT_KEY = 'payment';

const DEFAULTS: PaymentSettings = {
  // Every invoice payment goes through ANZ Worldline unless an admin changes it.
  provider: 'worldline',
  publishableKey: '',
  secretKey: '',
  worldlineEnvironment: 'live',
  worldlineMerchantId: '',
  worldlineApiKeyId: '',
  worldlineApiSecret: '',
  worldlineWebhookKeyId: '',
  worldlineWebhookSecret: '',
  cardPaymentsEnabled: true,
  upiEnabled: false,
  upiId: '',
  bankTransferEnabled: false,
  bankName: '',
  accountName: 'EG Eloma Australia Pty Ltd',
  bsb: '',
  accountNumber: '',
  payInstructions: '',
};

async function readRaw(): Promise<PaymentSettings> {
  const row = await prisma.setting.findUnique({ where: { key: PAYMENT_KEY } });
  if (!row) return { ...DEFAULTS };
  // A card surcharge % saved before the RBA ban (1 Oct 2026) is dropped on read
  // so it can never reach an invoice or the pay page again.
  const { cardSurchargePct: _banned, ...stored } = row.value as Partial<PaymentSettings> & {
    cardSurchargePct?: unknown;
  };
  return { ...DEFAULTS, ...stored };
}

/** Secrets that are only ever written, never read back to a browser. */
const SECRET_FIELDS = ['secretKey', 'worldlineApiSecret', 'worldlineWebhookSecret'] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

// Encrypted values carry this prefix so plaintext saved before encryption was
// configured (or while CREDENTIAL_ENC_KEY is unset) still reads back.
const ENC_PREFIX = 'enc:';

function sealSecret(plain: string): string {
  const sealed = encryptSecret(plain);
  return sealed ? `${ENC_PREFIX}${sealed}` : plain;
}

function openSecret(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  return decryptSecret(stored.slice(ENC_PREFIX.length)) ?? '';
}

/** Last four characters of a stored secret, for the "Saved · ends ••1234" hint. */
function last4(stored: string): string {
  const plain = openSecret(stored);
  return plain ? plain.slice(-4) : '';
}

/** Whether ANZ Worldline has everything it needs to take a card payment. */
export function worldlineReady(s: PaymentSettings): boolean {
  return Boolean(s.worldlineMerchantId && s.worldlineApiKeyId && openSecret(s.worldlineApiSecret));
}

/** Mask every secret for admin display. */
function mask(settings: PaymentSettings) {
  const { secretKey, worldlineApiSecret, worldlineWebhookSecret, ...rest } = settings;
  return {
    ...rest,
    hasSecretKey: Boolean(secretKey),
    secretKeyLast4: last4(secretKey),
    hasWorldlineApiSecret: Boolean(worldlineApiSecret),
    worldlineApiSecretLast4: last4(worldlineApiSecret),
    hasWorldlineWebhookSecret: Boolean(worldlineWebhookSecret),
    worldlineWebhookSecretLast4: last4(worldlineWebhookSecret),
    worldlineReady: worldlineReady(settings),
  };
}

/** Admin read — secrets masked. */
export async function getPaymentSettings() {
  return mask(await readRaw());
}

/**
 * Server-only read with secrets decrypted, for the gateway client. Never pass
 * the result to a response.
 */
export async function getPaymentSettingsWithSecrets(): Promise<PaymentSettings> {
  const s = await readRaw();
  return {
    ...s,
    secretKey: openSecret(s.secretKey),
    worldlineApiSecret: openSecret(s.worldlineApiSecret),
    worldlineWebhookSecret: openSecret(s.worldlineWebhookSecret),
  };
}

/**
 * Public read for the pay page / invoice — only non-sensitive fields. The
 * publishable key is safe to expose; the secret key is never included.
 */
export async function getPublicPaymentSettings() {
  const s = await readRaw();
  return {
    provider: s.provider,
    publishableKey: s.publishableKey,
    // The pay page hides the card button rather than failing at checkout.
    cardGatewayReady: s.provider === 'worldline' ? worldlineReady(s) : true,
    cardPaymentsEnabled: s.cardPaymentsEnabled,
    upiEnabled: s.upiEnabled,
    upiId: s.upiId,
    bankTransferEnabled: s.bankTransferEnabled,
    bankName: s.bankName,
    accountName: s.accountName,
    bsb: s.bsb,
    accountNumber: s.accountNumber,
    payInstructions: s.payInstructions,
  };
}

/**
 * Update settings. A secret is only overwritten when a non-empty value is
 * provided, so admins can save the form without re-typing secrets each time.
 */
export async function updatePaymentSettings(input: Partial<PaymentSettings>) {
  const current = await readRaw();
  const next: PaymentSettings = { ...current, ...input };
  for (const field of SECRET_FIELDS as readonly SecretField[]) {
    const typed = input[field]?.trim();
    next[field] = typed ? sealSecret(typed) : current[field];
  }
  // Identifiers are copied from the portal — stray whitespace breaks the HMAC.
  next.worldlineMerchantId = next.worldlineMerchantId.trim();
  next.worldlineApiKeyId = next.worldlineApiKeyId.trim();
  next.worldlineWebhookKeyId = next.worldlineWebhookKeyId.trim();
  await prisma.setting.upsert({
    where: { key: PAYMENT_KEY },
    create: { key: PAYMENT_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  });
  return mask(next);
}

// ─── Organisation ─────────────────────────────────────────

/**
 * The issuing entity printed on every tax invoice. These used to be hardcoded
 * constants in the frontend bundle, so changing the ABN, trading address or
 * billing email meant editing source and redeploying. They now live beside the
 * payment settings, editable from the Settings page.
 */
export interface OrganisationSettings {
  companyName: string;
  legalName: string;
  abn: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  billingEmail: string;
  supportEmail: string;
  phone: string;
  phoneCountry: string;
  website: string;
  /** Days a customer has to dispute an invoice — printed in the invoice note. */
  disputeWindowDays: number;
  locale: string;
  currency: string;
}

const ORG_KEY = 'organisation';

const ORG_DEFAULTS: OrganisationSettings = {
  companyName: 'EG Eloma',
  legalName: 'EG Eloma Australia Pty Ltd',
  abn: '76593175012',
  addressLine1: '71 Gipps Street',
  addressLine2: '',
  city: 'Collingwood',
  state: 'VIC',
  postcode: '3066',
  country: 'Australia',
  billingEmail: 'connect@egdigital.com.au',
  supportEmail: '',
  phone: '',
  phoneCountry: 'AU',
  website: '',
  disputeWindowDays: 10,
  locale: env.DEFAULT_LOCALE,
  currency: env.DEFAULT_CURRENCY,
};

export async function getOrganisationSettings(): Promise<OrganisationSettings> {
  const row = await prisma.setting.findUnique({ where: { key: ORG_KEY } });
  if (!row) return { ...ORG_DEFAULTS };
  return { ...ORG_DEFAULTS, ...(row.value as Partial<OrganisationSettings>) };
}

export async function updateOrganisationSettings(input: Partial<OrganisationSettings>) {
  const current = await getOrganisationSettings();
  const next: OrganisationSettings = {
    ...current,
    ...input,
    // ABN is stored as bare digits, matching how customer ABNs are held.
    abn: (input.abn ?? current.abn).replace(/\D/g, ''),
  };
  await prisma.setting.upsert({
    where: { key: ORG_KEY },
    create: { key: ORG_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  });
  return next;
}

// ─── Account Manager (single, global) ─────────────────────
//
// Every client sees the same account manager. The chosen team member is stored
// as one Setting row rather than per-customer, so it is set once from Approvals.

const ACCOUNT_MANAGER_KEY = 'accountManager';

/** The raw setting: which employee is the global account manager (or none). */
export async function getAccountManagerSetting(): Promise<{ employeeId: string | null }> {
  const row = await prisma.setting.findUnique({ where: { key: ACCOUNT_MANAGER_KEY } });
  const value = (row?.value as { employeeId?: string | null } | undefined) ?? {};
  return { employeeId: value.employeeId ?? null };
}

/** Persist the global account manager. Pass null / '' to clear it. */
export async function updateAccountManagerSetting(employeeId: string | null) {
  const value = { employeeId: employeeId || null };
  await prisma.setting.upsert({
    where: { key: ACCOUNT_MANAGER_KEY },
    create: { key: ACCOUNT_MANAGER_KEY, value },
    update: { value },
  });
  return value;
}

/**
 * Resolve the global account manager to the fields the client portal shows.
 * Returns null when unset or the employee no longer exists.
 */
export async function getResolvedAccountManager() {
  const { employeeId } = await getAccountManagerSetting();
  if (!employeeId) return null;
  return prisma.employeeUser.findUnique({
    where: { id: employeeId },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true, designation: true },
  });
}
