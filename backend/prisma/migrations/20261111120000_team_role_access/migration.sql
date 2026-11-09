-- Team role access levels: which sub-tabs a role grants and whether each is
-- view-only or editable. Purely additive (one nullable column) — existing roles
-- keep NULL and so keep full edit on the tabs they already grant.

-- AlterTable
ALTER TABLE "TeamRole" ADD COLUMN IF NOT EXISTS "access" JSONB;
