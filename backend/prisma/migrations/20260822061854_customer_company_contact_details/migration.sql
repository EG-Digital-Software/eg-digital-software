-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('HOSPITALITY_AND_TOURISM', 'FARMING_AND_AGRICULTURE', 'MINING', 'FISHING_AND_FORESTRY', 'MANUFACTURING', 'CONSTRUCTION', 'PROCESSING', 'RETAIL_AND_WHOLESALE', 'HEALTHCARE_AND_TRANSPORT', 'INFORMATION_TECHNOLOGY', 'EDUCATION_AND_RESEARCH', 'FINANCE_AND_MEDIA');

-- AlterEnum
ALTER TYPE "AddressType" ADD VALUE 'PRINCIPAL';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "acn" TEXT,
ADD COLUMN     "authorized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "authorizedEmail" TEXT,
ADD COLUMN     "authorizedMobile" TEXT,
ADD COLUMN     "authorizedMobileCountry" TEXT DEFAULT 'AU',
ADD COLUMN     "authorizedPerson" TEXT,
ADD COLUMN     "billingContactNumberCountry" TEXT DEFAULT 'AU',
ADD COLUMN     "businessType" "BusinessType",
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactMobile" TEXT,
ADD COLUMN     "contactMobileCountry" TEXT DEFAULT 'AU',
ADD COLUMN     "contactPosition" TEXT,
ADD COLUMN     "creditScore" INTEGER,
ADD COLUMN     "phoneNumberCountry" TEXT DEFAULT 'AU';
