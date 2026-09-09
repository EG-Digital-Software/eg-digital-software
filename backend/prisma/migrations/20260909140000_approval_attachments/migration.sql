-- Link attachments to an approval request. Files uploaded with a request are
-- stored raw and scoped to the request (kept out of the task Attachments tab).
ALTER TABLE "TaskAttachment" ADD COLUMN "approvalId" TEXT;

CREATE INDEX "TaskAttachment_approvalId_idx" ON "TaskAttachment"("approvalId");

ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "TaskApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
