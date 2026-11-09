-- What an admin-set agreed price is per: DAILY or MONTHLY. Null = follow the
-- product's own charge period. Additive and nullable, so existing rows are
-- unchanged and keep billing exactly as before.
ALTER TABLE "CustomerProduct" ADD COLUMN IF NOT EXISTS "priceBasis" TEXT;
