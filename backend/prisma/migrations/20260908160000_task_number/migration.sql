-- Give every task a human-readable unique number (TSK-EGD-5000, 5001, …).
-- The uuid id stays the primary key; this is a unique business identifier.

-- 1. Add the column (nullable first, so existing rows can be backfilled).
ALTER TABLE "Task" ADD COLUMN "taskNumber" TEXT;

-- 2. Backfill existing tasks in creation order, starting at TSK-EGD-5000.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "Task"
)
UPDATE "Task" t
SET "taskNumber" = 'TSK-EGD-' || (4999 + o.rn)
FROM ordered o
WHERE t."id" = o."id";

-- 3. Seed the shared counter so new tasks continue after the last backfilled
--    number (nextSequence returns value+1, mapped to TSK-EGD-(4999+value)).
INSERT INTO "Counter" ("key", "value")
VALUES ('taskNumber', (SELECT COUNT(*) FROM "Task"))
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";

-- 4. Enforce not-null + uniqueness.
ALTER TABLE "Task" ALTER COLUMN "taskNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Task_taskNumber_key" ON "Task"("taskNumber");
