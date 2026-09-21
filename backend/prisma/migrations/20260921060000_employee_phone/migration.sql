-- Optional contact number for team members, shown to clients when the team
-- member is their assigned account manager. Additive + nullable — no data loss.
ALTER TABLE "EmployeeUser" ADD COLUMN IF NOT EXISTS "phone" TEXT;
