-- Advance recurring billing (per licence group). Additive + nullable/defaulted
-- — no data loss, no existing rows touched.
ALTER TABLE "CustomerProduct" ADD COLUMN IF NOT EXISTS "advancePayment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerProduct" ADD COLUMN IF NOT EXISTS "nextInvoiceDate" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "CustomerProduct_nextInvoiceDate_idx" ON "CustomerProduct"("nextInvoiceDate");
