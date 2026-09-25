-- Per-viewer "already seen" markers behind the red change-dots. Purely additive:
-- a brand-new table, no changes to existing tables and no data loss. Every row
-- is written lazily the first time a user opens a section, so an empty table
-- simply means "nothing acknowledged yet" (everything shows as new until seen).
CREATE TABLE IF NOT EXISTS "SectionSeen" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sectionKey" TEXT NOT NULL,
  "seenSig" TEXT NOT NULL,
  "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SectionSeen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SectionSeen_userId_sectionKey_key"
  ON "SectionSeen" ("userId", "sectionKey");

CREATE INDEX IF NOT EXISTS "SectionSeen_userId_idx"
  ON "SectionSeen" ("userId");
