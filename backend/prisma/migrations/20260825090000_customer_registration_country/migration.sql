-- AlterTable
ALTER TABLE "Customer"
  ADD COLUMN "registrationCountry" TEXT DEFAULT 'AU',
  ADD COLUMN "companyIdentifiers" JSONB;
