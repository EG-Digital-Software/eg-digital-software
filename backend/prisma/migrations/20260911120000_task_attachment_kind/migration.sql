-- Split task-level files into their tab: TASK = the Attachments tab (also chat
-- and approval files), ARCHIVE = the Archive tab (admin-managed media the
-- client/team can only view). Existing rows default to TASK, so nothing changes
-- for them. Additive only — no data is altered or removed.
ALTER TABLE "TaskAttachment" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'TASK';

CREATE INDEX IF NOT EXISTS "TaskAttachment_taskId_kind_idx" ON "TaskAttachment"("taskId", "kind");
