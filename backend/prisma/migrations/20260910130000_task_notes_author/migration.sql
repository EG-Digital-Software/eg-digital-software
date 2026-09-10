-- Track who last wrote a task's notes (description), and when, for display.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "descriptionAuthorName" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "descriptionUpdatedAt" TIMESTAMP(3);
