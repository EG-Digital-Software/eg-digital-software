-- CreateTable
CREATE TABLE "Director" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT NOT NULL,
    "contactNumber" TEXT,
    "contactNumberCountry" TEXT DEFAULT 'AU',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Director_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Director_customerId_idx" ON "Director"("customerId");

-- AddForeignKey
ALTER TABLE "Director" ADD CONSTRAINT "Director_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
