-- Realign the carrier_trucks.truck_type CHECK constraint with the application
-- vocabulary. The app layer (CarrierTruckForm select, the fleet grid labels, the
-- POST /api/v1/carrier/fleet/trucks Zod schema, and the NHTSA VIN decoder) was
-- expanded to `semi, box_truck, flatbed, reefer, tanker, day_cab, straight_truck`,
-- but the CHECK constraint was never migrated off the original narrow set
-- (`semi, straight, tanker, flatbed, refrigerated, other`).
--
-- The result: any truck whose VIN decodes to a tractor (-> day_cab) or a box
-- truck (-> box_truck) passed Zod validation but violated the DB CHECK, surfacing
-- to the owner as an "Internal server error" (500) when adding a truck.
--
-- Only `semi` and `flatbed` are currently stored, so no existing row is affected
-- by tightening/rewriting this constraint.

ALTER TABLE carrier_trucks
  DROP CONSTRAINT IF EXISTS carrier_trucks_truck_type_check;

ALTER TABLE carrier_trucks
  ADD CONSTRAINT carrier_trucks_truck_type_check
  CHECK (truck_type IN ('semi', 'box_truck', 'flatbed', 'reefer', 'tanker', 'day_cab', 'straight_truck'));
