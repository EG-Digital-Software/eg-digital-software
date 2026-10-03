-- Approval resubmissions.
--
-- When the customer rejects an approval request, the team can resubmit. The
-- resubmission is a new TaskApproval row pointing at the original (rejected)
-- request through "parentId", so the rejected request stays exactly as it was
-- and its resubmissions show nested under it.
--
-- Additive and nullable: one new column, an index and a foreign key. No
-- existing row or column is touched; every current request keeps parentId NULL
-- and stays a top-level request.
ALTER TABLE "TaskApproval" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

CREATE INDEX IF NOT EXISTS "TaskApproval_parentId_idx" ON "TaskApproval"("parentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskApproval_parentId_fkey') THEN
    ALTER TABLE "TaskApproval" ADD CONSTRAINT "TaskApproval_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "TaskApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
