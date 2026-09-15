-- Add a new "Active-Trial" account standing. Additive only — no existing rows or
-- data are modified, and the three existing values remain unchanged.
ALTER TYPE "CustomerAccountStatus" ADD VALUE IF NOT EXISTS 'ACTIVE_TRIAL' AFTER 'ACTIVE';
