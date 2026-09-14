-- Per-line contract term (LOCKED/TRIAL) and GST handling (EXCLUSIVE = GST added
-- on top / INCLUSIVE = unitPrice already contains GST) on invoice lines. Both
-- defaulted, so existing invoice items and older code keep working.
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "contractType" TEXT NOT NULL DEFAULT 'LOCKED';
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "gstType" TEXT NOT NULL DEFAULT 'EXCLUSIVE';
