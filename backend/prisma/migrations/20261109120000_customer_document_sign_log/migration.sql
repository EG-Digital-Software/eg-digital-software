-- Agreements: append-only record of who submitted / filled each document and
-- from which IP. Additive and nullable, so existing rows are unchanged.
ALTER TABLE "CustomerDocument" ADD COLUMN IF NOT EXISTS "signLog" JSONB;
