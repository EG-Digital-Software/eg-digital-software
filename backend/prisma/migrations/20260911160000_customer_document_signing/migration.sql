-- Client fill-and-sign workflow for agreement documents. The client fills the
-- blank fields + signs a copy, which the admin then approves. Additive only —
-- new nullable columns; no existing column or row is altered or removed.
ALTER TABLE "CustomerDocument" ADD COLUMN IF NOT EXISTS "signedUrl"    TEXT;
ALTER TABLE "CustomerDocument" ADD COLUMN IF NOT EXISTS "signedAt"     TIMESTAMP(3);
ALTER TABLE "CustomerDocument" ADD COLUMN IF NOT EXISTS "submittedAt"  TIMESTAMP(3);
ALTER TABLE "CustomerDocument" ADD COLUMN IF NOT EXISTS "approvedAt"   TIMESTAMP(3);
ALTER TABLE "CustomerDocument" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;

-- New uploads now start in AWAITING_CLIENT rather than PENDING. Only the column
-- default changes (metadata); existing rows keep whatever status they already have.
ALTER TABLE "CustomerDocument" ALTER COLUMN "status" SET DEFAULT 'AWAITING_CLIENT';
