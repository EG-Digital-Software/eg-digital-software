-- Team roles: admin-defined roles granting team members access to admin
-- portal tabs. Purely additive (two new tables) — existing rows are untouched.

-- CreateTable
CREATE TABLE IF NOT EXISTS "TeamRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tabs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmployeeTeamRole" (
    "employeeId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeTeamRole_pkey" PRIMARY KEY ("employeeId","roleId")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TeamRole_name_key" ON "TeamRole"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmployeeTeamRole_roleId_idx" ON "EmployeeTeamRole"("roleId");

-- AddForeignKey
ALTER TABLE "EmployeeTeamRole" ADD CONSTRAINT "EmployeeTeamRole_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTeamRole" ADD CONSTRAINT "EmployeeTeamRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "TeamRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
