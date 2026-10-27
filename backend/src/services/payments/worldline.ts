import onlinePaymentsSdk, {
  type Client,
  type Domain,
  type SdkResponse,
} from 'onlinepayments-sdk-nodejs';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../config/logger.js';
import type { PaymentSettings, WorldlineEnvironment } from '../settings.service.js';

/**
 * ANZ Worldline — Worldline Global Online Pay (the "Online Payments" platform).
 *
 * Integration is the Hosted Checkout Page: we create a checkout session server
 * side, redirect the payer to Worldline, and card details never touch this
 * server. Completion is learned two ways, both trusted only because they come
 * from Worldline: the GetHostedCheckout status call when the payer returns, and
 * the HMAC-signed webhook (which also covers a payer who closes the tab).
 *
 * Surcharging is deliberately absent — the RBA reforms ended card surcharges
 * in Australia from 1 October 2026.
 */

const HOSTS: Record<WorldlineEnvironment, string> = {
  live: 'payment.anzworldline-solutions.com.au',
  test: 'payment.preprod.anzworldline-solutions.com.au',
};

const INTEGRATOR = 'EG Eloma';

export interface WorldlineCredentials {
  environment: WorldlineEnvironment;
  merchantId: string;
  apiKeyId: string;
  apiSecret: string;
}

export function credentialsFrom(s: PaymentSettings): WorldlineCredentials {
  if (!s.worldlineMerchantId || !s.worldlineApiKeyId || !s.worldlineApiSecret) {
    throw ApiError.badRequest(
      'Card payments are not set up yet. Please pay by bank transfer or contact us.'
    );
  }
  return {
    environment: s.worldlineEnvironment,
    merchantId: s.worldlineMerchantId,
    apiKeyId: s.worldlineApiKeyId,
    apiSecret: s.worldlineApiSecret,
  };
}

// One SDK client per credential set — rebuilt only when an admin changes them.
let cached: { key: string; client: Client } | null = null;

function clientFor(c: WorldlineCredentials): Client {
  const key = `${c.environment}|${c.apiKeyId}|${c.apiSecret}`;
  if (cached?.key === key) return cached.client;
  const client = onlinePaymentsSdk.init({
    integrator: INTEGRATOR,
    host: HOSTS[c.environment],
    scheme: 'https',
    port: 443,
    enableLogging: false,
    apiKeyId: c.apiKeyId,
    secretApiKey: c.apiSecret,
  });
  cached = { key, client };
  return client;
}

/** The first readable message from a Worldline error body. */
function describeError(body: unknown): string {
  const errors = (body as Domain.ErrorResponse | undefined)?.errors;
  const first = errors?.[0];
  return first?.message || first?.id || first?.errorCode || 'Unknown gateway error';
}

function unwrap<T>(res: SdkResponse<T, Domain.ErrorResponse>, action: string): T {
  if (res.isSuccess) return res.body;
  logger.error({ status: res.status, body: res.body }, `Worldline ${action} failed`);
  const gatewayError = describeError(res.body);
  if (res.status === 401 || res.status === 403) {
    throw new ApiError(502, 'The payment gateway rejected our credentials. Please contact us.', {
      gatewayError,
    });
  }
  throw new ApiError(502, `Payment gateway error: ${gatewayError}`, { gatewayError });
}

/** Amounts go to Worldline in minor units (cents). */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export interface CreateCheckoutInput {
  /** Our Payment row id — echoed back on every webhook for this payment. */
  paymentId: string;
  /** Shown in the Worldline portal; must be unique per attempt. */
  merchantReference: string;
  amount: number;
  currency: string;
  returnUrl: string;
  customerEmail?: string | null;
  merchantCustomerId?: string | null;
}

export async function createHostedCheckout(c: WorldlineCredentials, input: CreateCheckoutInput) {
  const body: Domain.CreateHostedCheckoutRequest = {
    order: {
      amountOfMoney: { amount: toMinorUnits(input.amount), currencyCode: input.currency },
      references: {
        merchantReference: input.merchantReference,
        merchantParameters: JSON.stringify({ paymentId: input.paymentId }),
      },
      customer: {
        merchantCustomerId: input.merchantCustomerId ?? undefined,
        contactDetails: input.customerEmail ? { emailAddress: input.customerEmail } : undefined,
      },
    },
    // Charge immediately — an authorisation alone would leave the invoice
    // waiting for a manual capture in the portal.
    cardPaymentMethodSpecificInput: { authorizationMode: 'SALE' },
    hostedCheckoutSpecificInput: {
      returnUrl: input.returnUrl,
      locale: 'en_AU',
      // Our pay page shows the outcome; skip Worldline's own result screen.
      showResultPage: false,
    },
  };
  const res = await clientFor(c).hostedCheckout.createHostedCheckout(c.merchantId, body);
  const out = unwrap(res, 'createHostedCheckout');
  if (!out.hostedCheckoutId || !out.redirectUrl) {
    throw new ApiError(502, 'The payment gateway did not return a checkout page');
  }
  return { hostedCheckoutId: out.hostedCheckoutId, redirectUrl: out.redirectUrl };
}

export async function getHostedCheckout(c: WorldlineCredentials, hostedCheckoutId: string) {
  const res = await clientFor(c).hostedCheckout.getHostedCheckout(c.merchantId, hostedCheckoutId);
  return unwrap(res, 'getHostedCheckout');
}

/** Checks the PSPID + API key pair against the selected environment. */
export async function testConnection(c: WorldlineCredentials) {
  const res = await clientFor(c).services.testConnection(c.merchantId);
  return unwrap(res, 'testConnection');
}

export type PaymentResponse = Domain.PaymentResponse;
export type Outcome = 'SUCCESS' | 'FAILED' | 'PENDING';

// CAPTURE_REQUESTED is a SALE that the acquirer has accepted for settlement.
const PAID = new Set(['CAPTURED', 'CAPTURE_REQUESTED']);
const DECLINED = new Set(['REJECTED', 'REJECTED_CAPTURE', 'CANCELLED']);

/** Map a Worldline payment onto our three-state model. */
export function outcomeOf(payment: Domain.PaymentResponse | null | undefined): Outcome {
  const status = payment?.status ?? '';
  if (PAID.has(status)) return 'SUCCESS';
  if (DECLINED.has(status)) return 'FAILED';
  return 'PENDING';
}

/** Hosted-checkout states that mean the payer left without paying. */
export function checkoutAbandoned(status: string | null | undefined): boolean {
  return (
    status === 'CANCELLED_BY_CONSUMER' ||
    status === 'CLIENT_NOT_ELIGIBLE_FOR_SELECTED_PAYMENT_PRODUCT'
  );
}

/** Our Payment row id, recovered from merchantParameters on a Worldline payment. */
export function paymentIdOf(payment: Domain.PaymentResponse | null | undefined): string | null {
  const raw = payment?.paymentOutput?.references?.merchantParameters;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { paymentId?: unknown };
    return typeof parsed.paymentId === 'string' ? parsed.paymentId : null;
  } catch {
    return null;
  }
}

/**
 * Verify the X-GCS-Signature (HMAC-SHA256 of the raw body) and parse the event.
 * Throws when the signature, key id or API version does not match.
 */
export async function unmarshalWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  webhookKeyId: string,
  webhookSecret: string
) {
  const helper = onlinePaymentsSdk.webhooks.init({
    getSecretKey: async (keyId: string) => {
      if (!webhookKeyId || !webhookSecret || keyId !== webhookKeyId) {
        throw new Error(`Unknown webhook key id ${keyId}`);
      }
      return webhookSecret;
    },
  });
  return helper.unmarshal(rawBody, headers);
}
