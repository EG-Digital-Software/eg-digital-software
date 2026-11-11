-- Time Sheet entries: client approval (PENDING / APPROVED / REJECTED) with a
-- rejection reason and who decided.
--
-- Additive only: five new columns. No row is deleted and no existing value is
-- changed. Existing entries take the default 'APPROVED' (they were already
-- accepted); new entries are saved as 'PENDING' by the app.

ALTER TABLE "TaskTimeEntry"
    ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN IF NOT EXISTS "rejectReason" TEXT,
    ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "decidedById" TEXT,
    ADD COLUMN IF NOT EXISTS "decidedByName" TEXT;
