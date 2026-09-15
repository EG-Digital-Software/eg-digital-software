-- The quantity concept was removed from assigned products — amounts are the
-- agreed price as-is. Drop the now-unused column.
ALTER TABLE "CustomerProduct" DROP COLUMN IF EXISTS "quantity";
