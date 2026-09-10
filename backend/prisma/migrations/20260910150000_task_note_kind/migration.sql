-- Split the notes thread into NOTE (Notes section) and ACCESS_POINT (Access
-- Point tab). Existing rows default to NOTE, so nothing changes for them.
-- ACCESS_POINT entries also carry a Subject alongside the note body.
ALTER TABLE "TaskNote" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'NOTE';
ALTER TABLE "TaskNote" ADD COLUMN IF NOT EXISTS "subject" TEXT;

CREATE INDEX IF NOT EXISTS "TaskNote_taskId_kind_idx" ON "TaskNote"("taskId", "kind");
