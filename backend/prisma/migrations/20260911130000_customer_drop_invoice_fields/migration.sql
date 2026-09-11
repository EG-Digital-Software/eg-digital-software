-- Remove three Customer invoicing fields that are no longer captured:
-- invoiceCustomer, invoiceTerm and paymentMethod. Only these columns are
-- dropped; every other Customer field and all related data stay untouched.
-- IF EXISTS keeps the migration safe to re-run.
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "invoiceCustomer";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "invoiceTerm";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "paymentMethod";
