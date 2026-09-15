-- Optional account manager (a team member) an admin can assign to a customer,
-- shown to the client in their portal. Additive + nullable — no data loss.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "accountManagerId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Customer_accountManagerId_fkey'
  ) THEN
    ALTER TABLE "Customer"
      ADD CONSTRAINT "Customer_accountManagerId_fkey"
      FOREIGN KEY ("accountManagerId") REFERENCES "EmployeeUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
