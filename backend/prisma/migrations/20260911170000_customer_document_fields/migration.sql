-- Admin-placed editable regions for agreement PDFs. Most uploaded PDFs are flat
-- (no AcroForm fields), so the admin marks where the client should fill/sign.
-- Additive only — one new nullable JSONB column; no data is altered or removed.
ALTER TABLE "CustomerDocument" ADD COLUMN IF NOT EXISTS "fields" JSONB;
