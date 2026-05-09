-- Add emailNotifications column to Customer table
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "emailNotifications" BOOLEAN NOT NULL DEFAULT true;
