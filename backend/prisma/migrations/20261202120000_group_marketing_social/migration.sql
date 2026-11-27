-- Eloma Group marketing (Admin → Marketing): the group's own social media
-- logins and the figures fetched for each group company. Additive only: five
-- new tables (+ indexes and one FK between them). No existing table, row or
-- value is changed.
CREATE TABLE "GroupSocialConnection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "externalName" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "assets" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "connectedById" TEXT NOT NULL,
    "connectedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSocialConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupSocialLink" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "selected" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSocialLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupSocialMetricDaily" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
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
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSocialMetricDaily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupSocialPost" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "reach" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagements" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shares" DOUBLE PRECISION,
    "permalink" TEXT,
    "imageUrl" TEXT,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSocialPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupSocialCampaignDaily" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "date" DATE NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leads" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSocialCampaignDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupSocialConnection_provider_externalUserId_key" ON "GroupSocialConnection"("provider", "externalUserId");

CREATE UNIQUE INDEX "GroupSocialLink_company_provider_key" ON "GroupSocialLink"("company", "provider");
CREATE INDEX "GroupSocialLink_connectionId_idx" ON "GroupSocialLink"("connectionId");

CREATE UNIQUE INDEX "GroupSocialMetricDaily_company_platform_date_key" ON "GroupSocialMetricDaily"("company", "platform", "date");
CREATE INDEX "GroupSocialMetricDaily_company_date_idx" ON "GroupSocialMetricDaily"("company", "date");

CREATE UNIQUE INDEX "GroupSocialPost_company_platform_externalId_key" ON "GroupSocialPost"("company", "platform", "externalId");
CREATE INDEX "GroupSocialPost_company_publishedAt_idx" ON "GroupSocialPost"("company", "publishedAt");

CREATE UNIQUE INDEX "GroupSocialCampaignDaily_company_platform_campaignId_date_key" ON "GroupSocialCampaignDaily"("company", "platform", "campaignId", "date");
CREATE INDEX "GroupSocialCampaignDaily_company_date_idx" ON "GroupSocialCampaignDaily"("company", "date");

ALTER TABLE "GroupSocialLink" ADD CONSTRAINT "GroupSocialLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GroupSocialConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
