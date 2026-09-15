-- Optional Unit/Hours multiplier for assigned products. When enabled, the total
-- becomes agreed price × unitHours (+ GST). Both additive and nullable/defaulted,
-- so existing rows and older code keep working.
ALTER TABLE "CustomerProduct" ADD COLUMN IF NOT EXISTS "unitHoursEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerProduct" ADD COLUMN IF NOT EXISTS "unitHours" DECIMAL(12,2);
