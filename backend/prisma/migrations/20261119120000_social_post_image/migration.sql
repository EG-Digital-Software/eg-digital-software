-- Top posts show the post's picture: one new optional column on SocialPost.
-- Additive only: no existing row or value is changed.
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
