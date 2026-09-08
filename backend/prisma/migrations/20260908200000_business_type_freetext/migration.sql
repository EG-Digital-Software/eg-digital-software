-- Business type becomes free text so admins can add their own industry types
-- beyond the presets. Existing enum values are preserved as their text codes.
ALTER TABLE "Customer" ALTER COLUMN "businessType" TYPE TEXT USING "businessType"::text;
