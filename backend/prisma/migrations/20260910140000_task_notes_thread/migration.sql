-- Chat-style notes thread: each note is its own row with an author snapshot.
CREATE TABLE IF NOT EXISTS "TaskNote" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorType" "Role" NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TaskNote_taskId_idx" ON "TaskNote"("taskId");

ALTER TABLE "TaskNote" ADD CONSTRAINT "TaskNote_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
