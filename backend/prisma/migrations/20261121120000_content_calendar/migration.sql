-- Content Calendar tab: shown only on tasks where an admin or team member
-- ticks it. Posts (design + caption) are planned on the calendar, approved by
-- the client and published to the customer's connected accounts.
--
-- Additive only: two new Task columns with defaults and two new tables.
-- No existing table, row or value is changed.

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "showContentCalendar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "contentAutoPublish" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "ContentPost" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT NOT NULL DEFAULT '',
    "firstComment" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT,
    "mediaName" TEXT,
    "mediaType" TEXT,
    "mediaSize" INTEGER,
    "mediaWidth" INTEGER,
    "mediaHeight" INTEGER,
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduledAt" TIMESTAMP(3),
    "timeZone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "approvedByName" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "activity" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContentPost_taskId_scheduledAt_idx" ON "ContentPost"("taskId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "ContentPost_customerId_idx" ON "ContentPost"("customerId");
CREATE INDEX IF NOT EXISTS "ContentPost_status_scheduledAt_idx" ON "ContentPost"("status", "scheduledAt");
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ContentPublishLog" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "externalId" TEXT,
    "permalink" TEXT,
    "error" TEXT,
    "trigger" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPublishLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContentPublishLog_taskId_createdAt_idx" ON "ContentPublishLog"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContentPublishLog_postId_idx" ON "ContentPublishLog"("postId");
ALTER TABLE "ContentPublishLog" ADD CONSTRAINT "ContentPublishLog_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
