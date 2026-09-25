-- Per-product snapshot of what each invoice line bills.
--
-- A line can bill a whole licence group, so the breakdown an invoice shows is per
-- product. These rows capture the product's identity and agreed commercials at
-- issue time, so changing an agreed price on the customer's assignment later can
-- never rewrite an invoice that has already gone out.
--
-- Purely additive: a new table only. No existing table, column or row is touched.
-- Invoices issued before this have no rows and keep rendering from what the line
-- itself stores.
CREATE TABLE IF NOT EXISTS "InvoiceItemProduct" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" TEXT,
    "agreedPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unitHours" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceItemProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InvoiceItemProduct_itemId_idx" ON "InvoiceItemProduct"("itemId");
CREATE INDEX IF NOT EXISTS "InvoiceItemProduct_productId_idx" ON "InvoiceItemProduct"("productId");

-- Deleting a line removes its snapshot rows; a product can never be orphaned
-- into a dangling reference, but the snapshot keeps its own copy of the details.
ALTER TABLE "InvoiceItemProduct"
  ADD CONSTRAINT "InvoiceItemProduct_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InvoiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceItemProduct"
  ADD CONSTRAINT "InvoiceItemProduct_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
