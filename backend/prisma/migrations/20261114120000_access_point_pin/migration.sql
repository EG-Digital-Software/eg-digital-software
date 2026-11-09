-- Access Point lock: every admin, team member and client login gets its own
-- unique 6-digit PIN, asked before a task's Access Point tab opens. Each unlock
-- and every change made inside the tab is recorded on that task.
-- Additive only: two new tables, nothing existing is touched.
CREATE TABLE IF NOT EXISTS "AccessPin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" "Role" NOT NULL,
    "pin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessPin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccessPin_pin_key" ON "AccessPin"("pin");
CREATE UNIQUE INDEX IF NOT EXISTS "AccessPin_userId_userType_key" ON "AccessPin"("userId", "userType");

CREATE TABLE IF NOT EXISTS "AccessPointLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" "Role" NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessPointLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccessPointLog_taskId_idx" ON "AccessPointLog"("taskId");
CREATE INDEX IF NOT EXISTS "AccessPointLog_userId_action_createdAt_idx" ON "AccessPointLog"("userId", "action", "createdAt");

ALTER TABLE "AccessPointLog" ADD CONSTRAINT "AccessPointLog_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
