-- SEO Dashboard, Local Listing and Azure Performance tabs: shown only on tasks
-- where an admin or team member ticks them. Report figures are entered by the
-- team and kept per task and report kind.
--
-- Additive only: three new Task columns with defaults and one new table.
-- No existing table, row or value is changed.

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "showSeoDashboard" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "showLocalListing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "showAzurePerformance" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ReportDashboard" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportDashboard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReportDashboard_taskId_kind_key" ON "ReportDashboard"("taskId", "kind");
ALTER TABLE "ReportDashboard" ADD CONSTRAINT "ReportDashboard_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
