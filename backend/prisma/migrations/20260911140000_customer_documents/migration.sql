-- Agreement Document uploads for customers. Additive only — a brand-new table
-- plus its index and foreign key; no existing table or data is changed.
CREATE TABLE IF NOT EXISTS "CustomerDocument" (
  "id"           TEXT NOT NULL,
  "customerId"   TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "size"         INTEGER NOT NULL,
  "contentType"  TEXT,
  "uploadedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerDocument_customerId_idx" ON "CustomerDocument"("customerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerDocument_customerId_fkey'
  ) THEN
    ALTER TABLE "CustomerDocument"
      ADD CONSTRAINT "CustomerDocument_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
