-- Invoicing/payment term agreed when a product is assigned, shown to the client
-- in their portal's Invoicing Details. Additive + nullable — no data loss.
ALTER TABLE "CustomerProduct" ADD COLUMN IF NOT EXISTS "invoicingTerm" TEXT;
