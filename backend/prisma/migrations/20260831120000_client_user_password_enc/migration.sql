-- Reversible, encrypted copy of an admin-provisioned client login's current
-- password, so an admin can reveal it. Login still uses passwordHash (argon2).
ALTER TABLE "ClientUser" ADD COLUMN "passwordEnc" TEXT;
