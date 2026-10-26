-- Re-open an expired resubmission window.
--
-- After a rejection the team has 48 hours to resubmit. Once that runs out, an
-- admin can re-open the window for another 48 hours; the moment (and who did
-- it) is stamped on the rejected entry, and the window is counted from there.
--
-- Additive and nullable: two new columns. No existing row or column is
-- touched; every current request keeps both NULL, so its window is still
-- counted from the rejection as before.
ALTER TABLE "TaskApproval" ADD COLUMN IF NOT EXISTS "resubmitReopenedAt" TIMESTAMP(3);
ALTER TABLE "TaskApproval" ADD COLUMN IF NOT EXISTS "resubmitReopenedByName" TEXT;
