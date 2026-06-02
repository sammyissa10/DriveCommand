-- ROLLBACK: add_soft_delete_columns_drift_fix
-- WARNING: DATA LOSS — drops 12 soft-delete columns from 6 tables.
-- Any soft-deleted records will lose their deletedAt / deletedById values permanently.
-- Only run this if the migration needs to be reversed and you have confirmed no
-- soft-deleted rows have been created since the migration was applied.

BEGIN;

-- Model: Route (table: Route)
ALTER TABLE public."Route" DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE public."Route" DROP COLUMN IF EXISTS "deletedById";

-- Model: CarrierClient (table: clients)
ALTER TABLE public."clients" DROP COLUMN IF EXISTS "deleted_at";
ALTER TABLE public."clients" DROP COLUMN IF EXISTS "deleted_by_id";

-- Model: CarrierContract (table: contracts)
ALTER TABLE public."contracts" DROP COLUMN IF EXISTS "deleted_at";
ALTER TABLE public."contracts" DROP COLUMN IF EXISTS "deleted_by_id";

-- Model: CarrierDriver (table: carrier_drivers)
ALTER TABLE public."carrier_drivers" DROP COLUMN IF EXISTS "deleted_at";
ALTER TABLE public."carrier_drivers" DROP COLUMN IF EXISTS "deleted_by_id";

-- Model: CarrierTruck (table: carrier_trucks)
ALTER TABLE public."carrier_trucks" DROP COLUMN IF EXISTS "deleted_at";
ALTER TABLE public."carrier_trucks" DROP COLUMN IF EXISTS "deleted_by_id";

-- Model: CarrierLoad (table: loads)
ALTER TABLE public."loads" DROP COLUMN IF EXISTS "deleted_at";
ALTER TABLE public."loads" DROP COLUMN IF EXISTS "deleted_by_id";

COMMIT;
