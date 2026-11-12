-- Channel insights (new Social Media Dashboard design):
--  - SocialPeriodValue: figures Meta gives per period (month totals, breakdowns,
--    audience, campaign/ad tables) and extra daily Page figures.
--  - SocialPost.stats: per-post views, likes, comments, shares and saves.
-- Additive only: one new table and one new column with a default. No existing
-- row or value is changed.

CREATE TABLE IF NOT EXISTS "SocialPeriodValue" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "value" DOUBLE PRECISION,
    "data" JSONB,
    "source" TEXT NOT NULL DEFAULT 'meta',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPeriodValue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialPeriodValue_customerId_platform_metric_periodKey_key" ON "SocialPeriodValue"("customerId", "platform", "metric", "periodKey");
CREATE INDEX IF NOT EXISTS "SocialPeriodValue_customerId_periodKey_idx" ON "SocialPeriodValue"("customerId", "periodKey");
ALTER TABLE "SocialPeriodValue" ADD CONSTRAINT "SocialPeriodValue_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "stats" JSONB NOT NULL DEFAULT '{}';
