-- Client feedback & testimonials. Additive only: two new tables (+ indexes and
-- FKs). No existing table, row or value is changed.
CREATE TABLE "TaskFeedback" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comment" TEXT,
    "displayAs" TEXT NOT NULL DEFAULT 'COMPANY',
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "taskId" TEXT,
    "problem" TEXT,
    "change" TEXT,
    "recommend" TEXT,
    "quote" TEXT NOT NULL,
    "pendingQuote" TEXT,
    "personName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "companyName" TEXT NOT NULL,
    "photoUrl" TEXT,
    "videoUrl" TEXT,
    "videoSeconds" INTEGER,
    "uses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "service" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskFeedback_taskId_key" ON "TaskFeedback"("taskId");
CREATE INDEX "TaskFeedback_customerId_idx" ON "TaskFeedback"("customerId");
CREATE INDEX "TaskFeedback_createdAt_idx" ON "TaskFeedback"("createdAt");
CREATE INDEX "Testimonial_customerId_idx" ON "Testimonial"("customerId");
CREATE INDEX "Testimonial_status_idx" ON "Testimonial"("status");

ALTER TABLE "TaskFeedback" ADD CONSTRAINT "TaskFeedback_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskFeedback" ADD CONSTRAINT "TaskFeedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
