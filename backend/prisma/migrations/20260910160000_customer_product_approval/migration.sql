-- Products a client adds themselves need admin approval. Existing (admin-added)
-- products default to APPROVED, so nothing changes for them.
ALTER TABLE "CustomerProduct" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED';
