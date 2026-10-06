-- Emoji reactions on task chat messages. Additive only: a new table, no
-- changes to existing tables or rows.

-- CreateTable
CREATE TABLE "TaskCommentReaction" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" "Role" NOT NULL,
    "userName" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCommentReaction_commentId_idx" ON "TaskCommentReaction"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCommentReaction_commentId_userId_emoji_key" ON "TaskCommentReaction"("commentId", "userId", "emoji");

-- AddForeignKey
ALTER TABLE "TaskCommentReaction" ADD CONSTRAINT "TaskCommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
