-- Admin-provisioned team logins: a reversible AES copy of the password so the
-- admin can reveal it (view-only; login still uses the argon2 hash), and a
-- free-text designation/role label. Both nullable, so existing rows and older
-- code keep working.
ALTER TABLE "EmployeeUser" ADD COLUMN IF NOT EXISTS "passwordEnc" TEXT;
ALTER TABLE "EmployeeUser" ADD COLUMN IF NOT EXISTS "designation" TEXT;
