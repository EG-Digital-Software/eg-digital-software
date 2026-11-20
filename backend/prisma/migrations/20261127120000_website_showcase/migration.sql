-- Preview › Website showcases (old vs new website, for marketing).
-- Additive only: one new table; no existing rows or columns are touched.
CREATE TABLE "WebsiteShowcase" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "oldArchiveId" TEXT,
    "newSiteUrl" TEXT,
    "newArchiveId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "newLaunchedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteShowcase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebsiteShowcase_customerId_idx" ON "WebsiteShowcase"("customerId");

ALTER TABLE "WebsiteShowcase" ADD CONSTRAINT "WebsiteShowcase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
