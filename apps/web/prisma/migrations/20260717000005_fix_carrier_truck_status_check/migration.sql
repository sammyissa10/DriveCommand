-- Realign carrier_trucks.status CHECK with the app vocabulary.
--
-- The constraint allowed (active, inactive, in_maintenance, out_of_service) but
-- the whole app uses 'maintenance', not 'in_maintenance': CarrierTruckForm's
-- status select, the create + update Zod schemas, and — critically — the derived
-- display logic in lib/carrier/truck-status.ts (`storedStatus === 'maintenance'
-- -> in_shop`). So setting a truck to Maintenance 500'd on the CHECK, and no
-- truck could ever legitimately hold 'in_maintenance'.
--
-- No truck currently uses the maintenance value at all (data: active / inactive /
-- out_of_service), so swapping in_maintenance -> maintenance affects no row.

ALTER TABLE carrier_trucks
  DROP CONSTRAINT IF EXISTS carrier_trucks_status_check;

ALTER TABLE carrier_trucks
  ADD CONSTRAINT carrier_trucks_status_check
  CHECK (status IN ('active', 'inactive', 'maintenance', 'out_of_service'));
