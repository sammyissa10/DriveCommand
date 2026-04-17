-- Align contracts rate_type CHECK to full 8-value superset
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_rate_type_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_rate_type_check
  CHECK (rate_type IN ('per_mile', 'per_load', 'per_hour', 'per_stop', 'flat', 'per_cwt', 'per_pallet', 'hourly'));

-- Align loads rate_type CHECK to full 8-value superset
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_rate_type_check;
ALTER TABLE loads ADD CONSTRAINT loads_rate_type_check
  CHECK (rate_type IN ('per_mile', 'per_load', 'per_hour', 'per_stop', 'flat', 'per_cwt', 'per_pallet', 'hourly'));
