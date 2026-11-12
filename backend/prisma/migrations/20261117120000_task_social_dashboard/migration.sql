-- Social Media Dashboard tab: shown only on the tasks where an admin or team
-- member ticks it in the task form.
-- Additive only: one new column, off by default. No existing row or value is changed.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "showSocialDashboard" BOOLEAN NOT NULL DEFAULT false;
