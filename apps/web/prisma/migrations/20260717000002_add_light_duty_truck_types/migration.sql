-- Add light-duty vehicle types to carrier_trucks.truck_type (TKT-0071).
-- The list previously only covered box-truck-and-above equipment, so carriers
-- running cargo vans, Sprinter vans, pickups, or ordinary cars had no matching
-- option. Widen the CHECK constraint to include them, keeping it aligned with
-- the app vocabulary (CarrierTruckForm select, the fleet grid labels, and the
-- POST /api/v1/carrier/fleet/trucks Zod schema).
--
-- Additive only — every previously-valid value remains valid, so no existing
-- row is affected.

ALTER TABLE carrier_trucks
  DROP CONSTRAINT IF EXISTS carrier_trucks_truck_type_check;

ALTER TABLE carrier_trucks
  ADD CONSTRAINT carrier_trucks_truck_type_check
  CHECK (truck_type IN (
    'semi', 'box_truck', 'flatbed', 'reefer', 'tanker', 'day_cab', 'straight_truck',
    'cargo_van', 'sprinter_van', 'pickup', 'car'
  ));
