-- Replies in task chat. Additive only: one nullable column on TaskComment;
-- existing rows are untouched (they simply aren't replies).

-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN "replyToId" TEXT;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "TaskComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
