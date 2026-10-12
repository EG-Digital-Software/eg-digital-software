-- Product country (ISO-3166 alpha-2 code, e.g. 'AU').
--
-- Additive only: one new nullable column. No existing row or column is changed.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "country" TEXT;
