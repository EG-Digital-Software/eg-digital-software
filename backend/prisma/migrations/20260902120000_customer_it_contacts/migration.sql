-- IT / technical contacts for a customer: repeatable Name / Email / Phone rows
-- captured from the customer form's IT Details section.
CREATE TABLE "CustomerITContact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "phoneCountry" TEXT DEFAULT 'AU',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerITContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerITContact_customerId_idx" ON "CustomerITContact"("customerId");

-- AddForeignKey
ALTER TABLE "CustomerITContact" ADD CONSTRAINT "CustomerITContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
