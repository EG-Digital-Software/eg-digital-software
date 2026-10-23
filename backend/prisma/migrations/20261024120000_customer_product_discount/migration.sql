-- Per-product discount (%) on an assigned product, taken off the agreed price
-- before GST. Additive and defaulted to 0, so existing rows bill exactly as before.
ALTER TABLE "CustomerProduct" ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
