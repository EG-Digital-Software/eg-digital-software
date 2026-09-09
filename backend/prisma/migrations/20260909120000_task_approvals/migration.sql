-- Approval requests raised against a task. The submitter fills subject/message;
-- an admin or the customer approves/rejects with optional feedback. Team members
-- only see the outcome.
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "TaskApproval" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "feedback" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedByType" "Role" NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedByType" "Role",
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskApproval_taskId_idx" ON "TaskApproval"("taskId");

ALTER TABLE "TaskApproval" ADD CONSTRAINT "TaskApproval_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
