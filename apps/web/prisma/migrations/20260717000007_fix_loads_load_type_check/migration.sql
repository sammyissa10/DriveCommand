-- Widen loads.load_type CHECK to the freight types the app offers.
--
-- The constraint allowed (ftl, ltl, partial, team) but the load forms and Zod
-- schemas offer drayage / intermodal / expedited — so choosing any of those on
-- a load 500'd at the DB. Add them (keeping legacy 'team', which nothing renders
-- but is harmless). Existing rows are only ftl / ltl, so no row is affected.

ALTER TABLE loads
  DROP CONSTRAINT IF EXISTS loads_load_type_check;

ALTER TABLE loads
  ADD CONSTRAINT loads_load_type_check
  CHECK (load_type IN ('ftl', 'ltl', 'partial', 'team', 'drayage', 'intermodal', 'expedited'));
