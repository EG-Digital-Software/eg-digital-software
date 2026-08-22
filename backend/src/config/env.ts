import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be set'),
  JWT_REFRESH_SECRET: z.string().min(8, 'JWT_REFRESH_SECRET must be set'),
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

  EMAIL_PROVIDER: z.string().default('console'),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('no-reply@egdigital.com.au'),
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
