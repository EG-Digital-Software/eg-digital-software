import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentResult,
} from './PaymentProvider.js';

/**
 * Development/placeholder provider. Generates a hosted payment URL pointing at the
 * frontend pay page. Swap for a real gateway by implementing PaymentProvider and
 * exposing it through the factory in index.ts.
 */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock';

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const transactionId = `mock_${crypto.randomBytes(8).toString('hex')}`;
    return {
      provider: this.name,
      transactionId,
      paymentUrl: await this.generatePaymentLink(input),
      status: 'PENDING',
    };
  }

  async getPaymentStatus(): Promise<'PENDING' | 'SUCCESS' | 'FAILED'> {
    return 'PENDING';
  }

  async generatePaymentLink(input: CreatePaymentInput): Promise<string> {
    const base = env.PAYMENT_PUBLIC_BASE_URL.replace(/\/$/, '');
    return `${base}/pay/${input.invoiceId}`;
  }

  verifyWebhook(): boolean {
    return true; // no signature verification for the mock provider
  }
}
