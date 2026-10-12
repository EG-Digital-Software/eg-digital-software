-- Product GST type for products that carry their own price: INCLUSIVE (the
-- price already includes 10% GST) or EXCLUSIVE (10% GST is added on top).
--
-- Additive only: one new nullable column. No existing row or column is changed.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "gstType" TEXT;
