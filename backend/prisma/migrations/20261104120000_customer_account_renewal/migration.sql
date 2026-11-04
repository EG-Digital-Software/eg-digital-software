-- Admin "Renew account": the account reads as ACTIVE until this date even
-- without recent invoices. Additive and nullable, so existing rows are unchanged.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "accountRenewedUntil" TIMESTAMP(3);
