-- Schema audit: align indexes with the queries the app actually runs, and
-- enforce one address per type per customer.

-- A customer has at most one Principal / Billing / Shipping address. Existing
-- data could hold duplicates (the address upsert did a find-then-create, which
-- two concurrent saves could both pass), so collapse them to the newest row
-- before the unique index goes on.
DELETE FROM "Address" a
USING "Address" b
WHERE a."customerId" = b."customerId"
  AND a."type" = b."type"
  AND (a."updatedAt", a."id") < (b."updatedAt", b."id");

-- DropIndex — superseded by the (customerId, type) unique below.
DROP INDEX IF EXISTS "Address_customerId_idx";

-- DropIndex — superseded by the (status, paidAt) composite below.
DROP INDEX IF EXISTS "Payment_status_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Address_customerId_type_key" ON "Address"("customerId", "type");

-- CreateIndex — dashboard counts new customers per month.
CREATE INDEX "Customer_createdAt_idx" ON "Customer"("createdAt");

-- CreateIndex — licence reminder job scans by expiry; client portal sorts by it.
CREATE INDEX "CustomerProduct_expiryDate_idx" ON "CustomerProduct"("expiryDate");

-- CreateIndex — dashboard revenue/sales series buckets invoices by date.
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");

-- CreateIndex — "already notified today?" check runs per recipient, per job run.
CREATE INDEX "Notification_userId_type_createdAt_idx" ON "Notification"("userId", "type", "createdAt");

-- CreateIndex — every revenue figure aggregates on (status, paidAt).
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");
