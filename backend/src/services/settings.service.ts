import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';

/**
 * Payment configuration for EG Digital. Stored as a single Setting row under the
 * `payment` key. Secret keys are persisted but NEVER returned in full — admin
 * reads get a masked hint (last 4 chars) instead.
 */
export interface PaymentSettings {
  provider: 'mock' | 'stripe' | 'razorpay';
  publishableKey: string;
  secretKey: string;
  cardPaymentsEnabled: boolean;
  cardSurchargePct: number;
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
  provider: 'mock',
  publishableKey: '',
  secretKey: '',
  cardPaymentsEnabled: true,
  cardSurchargePct: 0,
  upiEnabled: false,
  upiId: '',
  bankTransferEnabled: false,
  bankName: '',
  accountName: 'EG Digital Australia Pty Ltd',
  bsb: '',
  accountNumber: '',
  payInstructions: '',
};

async function readRaw(): Promise<PaymentSettings> {
  const row = await prisma.setting.findUnique({ where: { key: PAYMENT_KEY } });
  if (!row) return { ...DEFAULTS };
  return { ...DEFAULTS, ...(row.value as Partial<PaymentSettings>) };
}

/** Mask the secret key for admin display. */
function mask(settings: PaymentSettings) {
  const { secretKey, ...rest } = settings;
  return {
    ...rest,
    hasSecretKey: Boolean(secretKey),
    secretKeyLast4: secretKey ? secretKey.slice(-4) : '',
  };
}

/** Admin read — secret key masked. */
export async function getPaymentSettings() {
  return mask(await readRaw());
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
    cardPaymentsEnabled: s.cardPaymentsEnabled,
    cardSurchargePct: s.cardSurchargePct,
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
 * Update settings. `secretKey` is only overwritten when a non-empty value is
 * provided, so admins can save the form without re-typing the secret each time.
 */
export async function updatePaymentSettings(input: Partial<PaymentSettings>) {
  const current = await readRaw();
  const next: PaymentSettings = {
    ...current,
    ...input,
    secretKey: input.secretKey ? input.secretKey : current.secretKey,
  };
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
  companyName: 'EG Digital',
  legalName: 'EG Digital Australia Pty Ltd',
  abn: '76593175012',
  addressLine1: '71 Gipps Street',
  addressLine2: '',
  city: 'Collingwood',
  state: 'VIC',
  postcode: '3066',
  country: 'Australia',
  billingEmail: 'billing@egdigital.com.au',
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
