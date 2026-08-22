import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import type { PaymentProvider } from './PaymentProvider.js';
import { MockProvider } from './MockProvider.js';

function build(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    // case 'stripe':   return new StripeProvider();
    // case 'razorpay': return new RazorpayProvider();
    case 'mock':
    default:
      return new MockProvider();
  }
}

export const paymentProvider: PaymentProvider = build();

/** Generate a data-URL QR code from an arbitrary payment URL. */
export async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 320 });
}
