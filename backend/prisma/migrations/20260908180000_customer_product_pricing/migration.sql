-- Per-customer pricing for assigned products (products no longer carry their
-- own price/inventory). `price` is the price per quantity; unit + taxRate are
-- captured on each customer assignment. Both nullable/defaulted, so existing
-- rows and older code keep working.
ALTER TABLE "CustomerProduct" ADD COLUMN "unit" TEXT;
ALTER TABLE "CustomerProduct" ADD COLUMN "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
