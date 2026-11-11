-- Time Sheet entries: an end date alongside the start date (workDate).
--
-- Additive only: one new nullable column. No existing row or value is changed;
-- older entries keep a null end date and show as one-day entries.

ALTER TABLE "TaskTimeEntry" ADD COLUMN IF NOT EXISTS "workEndDate" DATE;
