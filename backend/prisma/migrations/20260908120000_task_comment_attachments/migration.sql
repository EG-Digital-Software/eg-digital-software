-- Link an attachment to a chat message. Task-level (Attachments tab) uploads
-- leave commentId null; files sent inside the task chat point back to their
-- comment and are removed with it.
ALTER TABLE "TaskAttachment" ADD COLUMN "commentId" TEXT;

CREATE INDEX "TaskAttachment_commentId_idx" ON "TaskAttachment"("commentId");

ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
