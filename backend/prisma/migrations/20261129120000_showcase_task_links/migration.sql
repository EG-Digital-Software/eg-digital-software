-- Website links are set per task in its Archive tab (old + new website) and
-- shown side by side on the Preview page. Additive only: one new nullable
-- column (+ index and FK) on the WebsiteShowcase table; no existing rows or
-- values are changed.
ALTER TABLE "WebsiteShowcase" ADD COLUMN "taskId" TEXT;

CREATE INDEX "WebsiteShowcase_taskId_idx" ON "WebsiteShowcase"("taskId");

ALTER TABLE "WebsiteShowcase" ADD CONSTRAINT "WebsiteShowcase_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
