-- Align driver_pay_records.pay_model CHECK with carrier_drivers + the pay
-- calculator (TKT-0072 follow-up).
--
-- generateDriverPayRecords (lib/carrier/pay-calculator.ts) writes the driver's
-- pay_model verbatim into driver_pay_records. carrier_drivers.pay_model now
-- allows per_mile/percentage_gross/hourly/flat_rate/team_split, but this table
-- still allowed the older per_mile/percentage_gross/hourly/flat/salary — so
-- generating pay for a flat_rate or team_split driver would 500 here.
--
-- Existing rows are all per_mile, so realigning affects no row.

ALTER TABLE driver_pay_records
  DROP CONSTRAINT IF EXISTS driver_pay_records_pay_model_check;

ALTER TABLE driver_pay_records
  ADD CONSTRAINT driver_pay_records_pay_model_check
  CHECK (pay_model IN ('per_mile', 'percentage_gross', 'hourly', 'flat_rate', 'team_split'));
