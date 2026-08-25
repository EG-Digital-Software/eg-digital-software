-- Give every existing invoice its own reference (derived from the already-unique
-- invoice number) so none are blank, then enforce uniqueness going forward.
UPDATE "Invoice"
SET "reference" = REPLACE("invoiceNumber", 'EGD-INV-', 'EGD-REF-')
WHERE "reference" IS NULL OR "reference" = '';

-- Unique reference per invoice (NULLs remain allowed by Postgres, but none are
-- left after the backfill above).
CREATE UNIQUE INDEX "Invoice_reference_key" ON "Invoice"("reference");
