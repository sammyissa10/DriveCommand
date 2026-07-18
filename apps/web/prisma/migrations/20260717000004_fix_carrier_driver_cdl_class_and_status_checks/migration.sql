-- Realign two more carrier_drivers CHECK constraints with the values the driver
-- form actually offers. Both rejected valid UI selections with a 500.
--
-- 1. cdl_class: the form (TKT-0070) offers A/B/C (CDL) plus D/E (Non-CDL) and
--    "OTHER", but the constraint only allowed A/B/C — so saving a non-CDL driver
--    500'd. Widen to the form's set (NULL still allowed for "not recorded").
--
-- 2. status: the form offers active / inactive / suspended, but the constraint
--    allowed active/inactive/on_leave/terminated — so "Suspended" 500'd. Union
--    both sets so every UI value is valid without dropping the existing ones.
--
-- Existing rows use only cdl_class IN (NULL,A,B,C) and status = 'active', so no
-- row is affected.

ALTER TABLE carrier_drivers
  DROP CONSTRAINT IF EXISTS carrier_drivers_cdl_class_check;
ALTER TABLE carrier_drivers
  ADD CONSTRAINT carrier_drivers_cdl_class_check
  CHECK (cdl_class IS NULL OR cdl_class IN ('A', 'B', 'C', 'D', 'E', 'OTHER'));

ALTER TABLE carrier_drivers
  DROP CONSTRAINT IF EXISTS carrier_drivers_status_check;
ALTER TABLE carrier_drivers
  ADD CONSTRAINT carrier_drivers_status_check
  CHECK (status IN ('active', 'inactive', 'suspended', 'on_leave', 'terminated'));
