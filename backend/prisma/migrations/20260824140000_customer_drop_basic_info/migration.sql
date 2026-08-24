-- DropIndex
DROP INDEX IF EXISTS "Customer_email_idx";

-- AlterTable: drop the personal Basic Information fields; a customer is now
-- identified by its company and contact details.
ALTER TABLE "Customer"
  DROP COLUMN "firstName",
  DROP COLUMN "lastName",
  DROP COLUMN "email",
  DROP COLUMN "phoneNumber",
  DROP COLUMN "phoneNumberCountry";
