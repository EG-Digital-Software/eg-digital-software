-- Time Sheet entries: who on the admin side approved or rejected a request
-- over the monthly maximum, and when — the Approvals > Time Sheet history.
--
-- Additive only: four new nullable columns. No row is deleted and no existing
-- value is changed.

ALTER TABLE "TaskTimeEntry"
    ADD COLUMN IF NOT EXISTS "adminDecision" TEXT,
    ADD COLUMN IF NOT EXISTS "adminDecidedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "adminDecidedById" TEXT,
    ADD COLUMN IF NOT EXISTS "adminDecidedByName" TEXT;
