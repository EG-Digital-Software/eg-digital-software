-- CreateEnum
CREATE TYPE "CustomerAccountStatus" AS ENUM ('ACTIVE', 'DORMANT', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "accountStatus" "CustomerAccountStatus" NOT NULL DEFAULT 'ACTIVE';
