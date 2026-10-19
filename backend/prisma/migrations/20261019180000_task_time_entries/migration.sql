-- Task time sheet: hours worked on a task, logged by an admin or team member
-- against one of the customer's purchased hours (a CustomerProduct with
-- Unit/Hours on).
--
-- Additive only: one new table. No existing row or column is changed. Removing
-- a task or a product assignment sets the link to NULL instead of deleting the
-- entry, so logged hours are never lost.
CREATE TABLE IF NOT EXISTS "TaskTimeEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "taskId" TEXT,
    "customerProductId" TEXT,
    "workDate" DATE NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "note" TEXT,
    "authorId" TEXT NOT NULL,
    "authorType" "Role" NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTimeEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TaskTimeEntry_customerId_idx" ON "TaskTimeEntry"("customerId");
CREATE INDEX IF NOT EXISTS "TaskTimeEntry_taskId_idx" ON "TaskTimeEntry"("taskId");
CREATE INDEX IF NOT EXISTS "TaskTimeEntry_customerProductId_idx" ON "TaskTimeEntry"("customerProductId");

ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_customerProductId_fkey" FOREIGN KEY ("customerProductId") REFERENCES "CustomerProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
