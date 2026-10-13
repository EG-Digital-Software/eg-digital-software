/**
 * Central branding configuration. Replace the logo by swapping the file in
 * `public/` (or updating `logo` below) — no other file references the asset
 * directly. `logo` is the full horizontal wordmark (includes the company name),
 * so components render it without a separate text label.
 */
export const brand = {
  companyName: 'EG Eloma',
  logo: '/eg-eloma-logo.png', // full lockup for light backgrounds (navy body)
  logoLight: '/eg-eloma-logo-light.png', // full lockup for dark backgrounds (white body)
  icon: '/eg-eloma-mark.png', // hummingbird mark only (transparent bg, navy body)
  iconLight: '/eg-eloma-mark-light.png', // hummingbird mark for dark backgrounds
  favicon: '/favicon.ico',
  wordmark: true,
  colors: {
    navy: '#0B223B',
    green: '#34B98C',
  },
  primaryColor: '#4f46e5',
  secondaryColor: '#0f172a',
  tagline: 'Business & Licence Management',
  legal: {
    country: 'Australia',
    locale: 'en-AU',
    currency: 'AUD',
  },
  /** Seller / issuing entity — printed on every tax invoice. */
  seller: {
    legalName: 'EG Eloma Australia Pty Ltd',
    addressLines: ['71 Gipps Street', 'Collingwood VIC 3066'],
    abn: '76 593 175 012',
    billingEmail: 'connect@egdigital.com.au',
    disputeWindowDays: 10,
  },
} as const;
