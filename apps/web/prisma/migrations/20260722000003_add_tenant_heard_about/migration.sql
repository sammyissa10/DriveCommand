-- AlterTable: acquisition channel captured (optionally) at signup.
-- "heardAbout" holds the selected option key; "heardAboutOther" holds the free
-- text when "Other" is chosen. Both nullable — strictly optional at signup.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "heardAbout" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "heardAboutOther" TEXT;
