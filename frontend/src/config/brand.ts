/**
 * Central branding configuration. Replace the logo by swapping the file in
 * `public/` (or updating `logo` below) — no other file references the asset
 * directly. `logo` is the full horizontal wordmark (includes the company name),
 * so components render it without a separate text label.
 */
export const brand = {
  companyName: 'EG Digital',
  logo: '/egdigital-logo.png', // full wordmark (raster)
  icon: '/egdigital-icon.png?v=2', // square kangaroo mark only (transparent bg)
  favicon: '/egdigital-icon.png?v=2',
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
    legalName: 'EG Digital Australia Pty Ltd',
    addressLines: ['71 Gipps Street', 'Collingwood VIC 3066'],
    abn: '76 593 175 012',
    billingEmail: 'billing@egdigital.com.au',
    disputeWindowDays: 10,
  },
} as const;
