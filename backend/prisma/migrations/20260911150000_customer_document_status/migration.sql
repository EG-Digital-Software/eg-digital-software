-- Admin review state for agreement documents (Agreement tab). Existing rows
-- default to PENDING. Additive only — no data is altered or removed.
ALTER TABLE "CustomerDocument" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
