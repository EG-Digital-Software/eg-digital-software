-- Replace the single designation title with a split legal name.
ALTER TABLE "Director" DROP COLUMN "designation";
ALTER TABLE "Director" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Director" ADD COLUMN "middleName" TEXT;
ALTER TABLE "Director" ADD COLUMN "lastName" TEXT;
