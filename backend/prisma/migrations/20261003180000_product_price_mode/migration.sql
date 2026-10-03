-- Product price mode.
--
-- AUTOMATIC products are priced per customer when assigned (as today). MANUAL
-- products carry their own price (the existing "pricePerQty" column), a billing
-- period (MONTHLY / ANNUALLY) and a contract term (CONTRACTUAL / PERMANENT).
--
-- Additive only: three new columns. "priceMode" defaults to 'AUTOMATIC', which is
-- how every product is priced today; the other two are nullable. No existing row
-- or column is changed.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "priceMode" TEXT NOT NULL DEFAULT 'AUTOMATIC';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "billingPeriod" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "contractTerm" TEXT;
