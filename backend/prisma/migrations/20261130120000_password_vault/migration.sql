-- Password vault. Additive only: two new tables (+ indexes and FKs). No
-- existing table, row or value is changed.
CREATE TABLE "VaultEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "username" TEXT,
    "passwordEnc" TEXT NOT NULL,
    "passwordFp" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "notesEnc" TEXT,
    "twoFactor" TEXT NOT NULL DEFAULT 'Off',
    "access" TEXT NOT NULL DEFAULT 'ADMINS',
    "accessEmployeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownerName" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByType" "Role" NOT NULL,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VaultLog" (
    "id" TEXT NOT NULL,
    "entryId" TEXT,
    "entryName" TEXT,
    "customerId" TEXT,
    "userId" TEXT NOT NULL,
    "userType" "Role" NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VaultEntry_customerId_idx" ON "VaultEntry"("customerId");
CREATE INDEX "VaultLog_entryId_idx" ON "VaultLog"("entryId");
CREATE INDEX "VaultLog_customerId_idx" ON "VaultLog"("customerId");
CREATE INDEX "VaultLog_userId_action_createdAt_idx" ON "VaultLog"("userId", "action", "createdAt");
CREATE INDEX "VaultLog_createdAt_idx" ON "VaultLog"("createdAt");

ALTER TABLE "VaultEntry" ADD CONSTRAINT "VaultEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultLog" ADD CONSTRAINT "VaultLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "VaultEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
