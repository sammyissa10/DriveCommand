-- Add vehicle_id and display_name to carrier_trucks
ALTER TABLE "carrier_trucks" ADD COLUMN IF NOT EXISTS "vehicle_id" VARCHAR(50);
ALTER TABLE "carrier_trucks" ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(200);

-- Backfill vehicle_id for existing rows: VH-YYYY-NNNNN where YYYY = current year
UPDATE "carrier_trucks"
SET "vehicle_id" = 'VH-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || LPAD((ROW_NUMBER() OVER (ORDER BY "created_at"))::TEXT, 5, '0')
WHERE "vehicle_id" IS NULL;

-- Backfill display_name from unit_number
UPDATE "carrier_trucks"
SET "display_name" = "unit_number"
WHERE "display_name" IS NULL;

-- Now make vehicle_id NOT NULL and add unique constraint
ALTER TABLE "carrier_trucks" ALTER COLUMN "vehicle_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "carrier_trucks_vehicle_id_key" ON "carrier_trucks"("vehicle_id");
