-- Social Media Dashboard: real data instead of the sample figures.
--  - SocialDashboard: per-task notes, goals, budgets and hand-entered posts/campaigns.
--  - SocialConnection: a customer's account connected through the platform's
--    own login (token stored encrypted).
--  - SocialMetricDaily / SocialPost / SocialCampaignDaily: figures per customer,
--    fetched from connected accounts or entered by the team.
--
-- Additive only: five new tables. No existing table, row or column is changed.

CREATE TABLE IF NOT EXISTS "SocialDashboard" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialDashboard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialDashboard_taskId_key" ON "SocialDashboard"("taskId");
ALTER TABLE "SocialDashboard" ADD CONSTRAINT "SocialDashboard_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SocialConnection" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "externalName" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "assets" JSONB NOT NULL DEFAULT '{}',
    "selected" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "connectedById" TEXT NOT NULL,
    "connectedByType" "Role" NOT NULL,
    "connectedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialConnection_customerId_provider_key" ON "SocialConnection"("customerId", "provider");
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SocialMetricDaily" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reach" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagements" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newFollowers" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "linkClicks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "followers" DOUBLE PRECISION,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clicks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leads" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialMetricDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialMetricDaily_customerId_platform_date_key" ON "SocialMetricDaily"("customerId", "platform", "date");
CREATE INDEX IF NOT EXISTS "SocialMetricDaily_customerId_date_idx" ON "SocialMetricDaily"("customerId", "date");
ALTER TABLE "SocialMetricDaily" ADD CONSTRAINT "SocialMetricDaily_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SocialPost" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "reach" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagements" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shares" DOUBLE PRECISION,
    "permalink" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialPost_customerId_platform_externalId_key" ON "SocialPost"("customerId", "platform", "externalId");
CREATE INDEX IF NOT EXISTS "SocialPost_customerId_publishedAt_idx" ON "SocialPost"("customerId", "publishedAt");
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SocialCampaignDaily" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "date" DATE NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leads" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialCampaignDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialCampaignDaily_customerId_platform_campaignId_date_key" ON "SocialCampaignDaily"("customerId", "platform", "campaignId", "date");
CREATE INDEX IF NOT EXISTS "SocialCampaignDaily_customerId_date_idx" ON "SocialCampaignDaily"("customerId", "date");
ALTER TABLE "SocialCampaignDaily" ADD CONSTRAINT "SocialCampaignDaily_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
