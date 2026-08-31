import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be set'),
  JWT_REFRESH_SECRET: z.string().min(8, 'JWT_REFRESH_SECRET must be set'),
  // Key for encrypting admin-provisioned client passwords so an admin can reveal
  // them. 32-byte key as 64 hex chars or base64. Without it, credential reveal is
  // disabled (logins still work — they use the argon2 hash).
  CREDENTIAL_ENC_KEY: z.string().optional(),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  SUPER_ADMIN_EMAIL: z.string().email().default('admin@egdigital.com.au'),
  SUPER_ADMIN_PASSWORD: z.string().default('ChangeMe!2026'),
  SUPER_ADMIN_FIRST_NAME: z.string().default('EG'),
  SUPER_ADMIN_LAST_NAME: z.string().default('Admin'),

  STORAGE_DRIVER: z.enum(['local', 'azure']).default('local'),
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().default('eg-digital'),

  PAYMENT_PROVIDER: z.string().default('mock'),
  PAYMENT_SECRET_KEY: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_PUBLIC_BASE_URL: z.string().default('http://localhost:5173'),

  // 'console' (dev), 'smtp' (real send), or unset. When 'smtp' is selected but
  // SMTP_HOST is missing, the provider degrades to console with a warning.
  EMAIL_PROVIDER: z.string().default('console'),
  EMAIL_API_KEY: z.string().optional(),
  // The visible sender. For best inbox delivery this should be a real, hosted
  // mailbox on a domain with SPF + DKIM + DMARC (e.g. the admin's address).
  EMAIL_FROM: z.string().default('no-reply@egdigital.com.au'),
  EMAIL_FROM_NAME: z.string().default('EG Digital'),
  // Where replies go if it differs from EMAIL_FROM (e.g. a no-reply sender).
  EMAIL_REPLY_TO: z.string().optional(),

  // ── SMTP transport (EMAIL_PROVIDER=smtp) ───────────────
  // Use the admin mailbox's SMTP host + an app password. Authenticated sends
  // from a domain with SPF/DKIM/DMARC land in the inbox, not spam.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true' || v === '1'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  APP_URL: z.string().default('http://localhost:5173'),

  // ── Geocoding (address auto-fill) ──────────────────────
  // z.coerce.boolean() would read the string "false" as true — parse explicitly.
  GEOCODING_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false' && v !== '0'),
  GEOCODER_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
  GEOCODER_USER_AGENT: z.string().default('EG-Digital-SaaS/1.0 (admin address autofill)'),
  GEOCODER_EMAIL: z.string().optional(),
  // When set, address search/reverse lookups use Google's Geocoding API instead
  // of Nominatim. The key stays server-side — it is never shipped to the browser.
  // Restrict it to the Geocoding API (and by IP) in the Google Cloud console.
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // ── ABN lookup (Australian Business Register) ──────────
  // The GUID is issued per registered party at
  // https://abr.business.gov.au/Documentation/WebServiceRegistration
  ABN_LOOKUP_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false' && v !== '0'),
  ABR_URL: z.string().url().default('https://abr.business.gov.au'),
  ABR_GUID: z.string().optional(),
  ABR_USER_AGENT: z.string().default('EG-Digital-SaaS/1.0 (customer ABN autofill)'),

  DEFAULT_CURRENCY: z.string().default('AUD'),
  DEFAULT_LOCALE: z.string().default('en-AU'),
})
  // Fail at boot rather than on the first upload attempt in production.
  .superRefine((cfg, ctx) => {
    if (cfg.STORAGE_DRIVER === 'azure' && !cfg.AZURE_STORAGE_CONNECTION_STRING) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AZURE_STORAGE_CONNECTION_STRING'],
        message: 'Required when STORAGE_DRIVER=azure',
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
   
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
