-- Rollover cursor: automatic invoices have billed the customer up to this date;
-- each run claims its period through it so nothing is invoiced twice.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "billedThrough" TIMESTAMP(3);

-- Set when the customer's latest invoice is deleted: automatic invoicing stops
-- until an admin creates their next invoice by hand.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "autoInvoicePausedAt" TIMESTAMP(3);

-- Both additive and nullable, so existing rows are unchanged.
