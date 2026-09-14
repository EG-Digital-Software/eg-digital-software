-- Contract type (LOCKED committed term / TRIAL evaluation) and GST handling
-- (EXCLUSIVE = GST added on top / INCLUSIVE = price already contains GST),
-- captured per customer-product assignment. Both defaulted, so existing rows
-- and older code keep working.
ALTER TABLE "CustomerProduct" ADD COLUMN IF NOT EXISTS "contractType" TEXT NOT NULL DEFAULT 'LOCKED';
ALTER TABLE "CustomerProduct" ADD COLUMN IF NOT EXISTS "gstType" TEXT NOT NULL DEFAULT 'EXCLUSIVE';
