-- AlterTable: exact truck count captured at signup (nullable — existing tenants
-- keep NULL). The derived band stays in "fleetSizeBucket" for backward-compat;
-- this column stores the precise number alongside it.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "truckCount" INTEGER;
