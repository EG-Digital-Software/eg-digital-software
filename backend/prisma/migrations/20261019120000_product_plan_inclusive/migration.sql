-- Product "Plan Inclusive": optional free text describing what the plan
-- includes. **double asterisks** mark bold runs.
--
-- Additive only: one new nullable column. No existing row or column is changed.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "planInclusive" TEXT;
