-- Team a task is assigned to (shown to the client instead of employee names).
-- Additive, nullable: existing rows are untouched.
ALTER TABLE "Task" ADD COLUMN "assignedTeam" TEXT;
