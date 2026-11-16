-- TikTok post settings for Content Calendar posts (privacy, comments, duet,
-- stitch, commercial-content disclosure, consent).
-- Additive only: one new nullable column; no existing rows or columns are touched.
ALTER TABLE "ContentPost" ADD COLUMN "tiktok" JSONB;
