-- Split the payment term from the billing cycle.
--
-- "term" now means only the payment window (how long the client has to pay:
-- due on receipt, or net 7). What is billed, and when the next invoice is
-- raised, is this new column instead.
--
-- Additive and nullable: existing invoices keep every value they have and read
-- back NULL here, which the app falls back to the monthly default for.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "nextBillingDate" TIMESTAMP(3);
