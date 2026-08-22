/**
 * Provider-agnostic payment abstraction. The business may operate in Australia,
 * so no gateway is hardcoded — implement this interface for Stripe / Razorpay /
 * etc. and select via PAYMENT_PROVIDER. Secret keys live only in env, never in
 * the frontend.
 */
export interface CreatePaymentInput {
  invoiceId: string;
  invoiceNumber: string;
  amount: string; // decimal string
  currency: string;
  customerEmail?: string;
  description?: string;
}

export interface CreatePaymentResult {
  provider: string;
  transactionId: string;
  paymentUrl: string;
  status: 'PENDING';
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPaymentStatus(transactionId: string): Promise<'PENDING' | 'SUCCESS' | 'FAILED'>;
  generatePaymentLink(input: CreatePaymentInput): Promise<string>;
  verifyWebhook(signature: string, rawBody: Buffer): boolean;
}
