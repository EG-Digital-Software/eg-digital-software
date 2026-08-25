-- Default payment terms and preferred method for a customer's invoices.
ALTER TABLE "Customer" ADD COLUMN "invoiceTerm" TEXT;
ALTER TABLE "Customer" ADD COLUMN "paymentMethod" TEXT;
