-- Per-product GST on the invoice-line snapshot.
--
-- GST rate and basis were only captured per line, but each product assignment
-- agrees its own, so an invoice could not state them per product. These carry
-- each product's own rate and basis as at issue time.
--
-- Additive and nullable: two columns on a table added in the previous migration.
-- No existing table, column or row is touched; rows without these values fall
-- back to the line's rate and basis.
ALTER TABLE "InvoiceItemProduct" ADD COLUMN IF NOT EXISTS "taxRate" DECIMAL(5,2);
ALTER TABLE "InvoiceItemProduct" ADD COLUMN IF NOT EXISTS "gstType" TEXT;
