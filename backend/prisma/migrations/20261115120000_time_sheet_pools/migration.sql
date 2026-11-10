-- Board Time Sheet: hour pools shared by a customer's tasks, the client's
-- approvals of extra hours beyond a pool, and request details on time entries.
--
-- Additive only: three new tables and six new NULLABLE columns on
-- "TaskTimeEntry". No existing row or column is changed or removed; existing
-- time entries keep their values and simply have no pool (poolId NULL).
-- Removing a pool leaves its time entries in place (poolId set to NULL).

CREATE TABLE IF NOT EXISTS "TimeSheetPool" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'shared-pool',
    "termStart" DATE NOT NULL,
    "termEnd" DATE NOT NULL,
    "poolHours" DECIMAL(8,2) NOT NULL,
    "monthlyAllocation" DECIMAL(8,2),
    "monthlyMax" DECIMAL(8,2) NOT NULL,
    "monthlyAlertAt" DECIMAL(8,2) NOT NULL,
    "poolAlertAt" DECIMAL(8,2) NOT NULL,
    "extraRate" DECIMAL(10,2) NOT NULL,
    "minHoursPerRequest" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "blockHours" DECIMAL(6,2) NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeSheetPool_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TimeSheetPool_customerId_idx" ON "TimeSheetPool"("customerId");

CREATE TABLE IF NOT EXISTS "TimeSheetPoolTask" (
    "poolId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "TimeSheetPoolTask_pkey" PRIMARY KEY ("poolId","taskId")
);
CREATE INDEX IF NOT EXISTS "TimeSheetPoolTask_taskId_idx" ON "TimeSheetPoolTask"("taskId");

CREATE TABLE IF NOT EXISTS "TimeSheetExtraApproval" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "approvedOn" DATE NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL,
    "reference" TEXT,
    "approvedById" TEXT NOT NULL,
    "approvedByType" "Role" NOT NULL,
    "approvedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeSheetExtraApproval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TimeSheetExtraApproval_poolId_idx" ON "TimeSheetExtraApproval"("poolId");

ALTER TABLE "TaskTimeEntry" ADD COLUMN IF NOT EXISTS "poolId" TEXT;
ALTER TABLE "TaskTimeEntry" ADD COLUMN IF NOT EXISTS "requestId" TEXT;
ALTER TABLE "TaskTimeEntry" ADD COLUMN IF NOT EXISTS "priority" TEXT;
ALTER TABLE "TaskTimeEntry" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "TaskTimeEntry" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "TaskTimeEntry" ADD COLUMN IF NOT EXISTS "staff" TEXT;
CREATE INDEX IF NOT EXISTS "TaskTimeEntry_poolId_idx" ON "TaskTimeEntry"("poolId");

ALTER TABLE "TimeSheetPoolTask" ADD CONSTRAINT "TimeSheetPoolTask_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "TimeSheetPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeSheetPoolTask" ADD CONSTRAINT "TimeSheetPoolTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeSheetExtraApproval" ADD CONSTRAINT "TimeSheetExtraApproval_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "TimeSheetPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "TimeSheetPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;
