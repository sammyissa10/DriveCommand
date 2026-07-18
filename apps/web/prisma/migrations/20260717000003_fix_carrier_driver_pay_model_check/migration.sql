-- Realign carrier_drivers.pay_model CHECK with the app / pay-calculator
-- vocabulary (TKT-0072, follow-up).
--
-- The constraint allowed (per_mile, percentage, flat, hourly, salary) but the
-- app — CarrierDriverForm, the create + update Zod schemas, and generateDriver
-- PayRecords in lib/carrier/pay-calculator.ts — uses (per_mile, percentage_gross,
-- hourly, flat_rate, team_split). Only per_mile and hourly overlapped, so saving
-- a driver as Percentage of Gross, Flat Rate, or Team Split violated the CHECK
-- and surfaced as a 500 on create AND edit.
--
-- The calculator computes exactly the five below and skips anything else, so this
-- is the authoritative set. Existing rows are only per_mile / hourly, so no row is
-- affected.

ALTER TABLE carrier_drivers
  DROP CONSTRAINT IF EXISTS carrier_drivers_pay_model_check;

ALTER TABLE carrier_drivers
  ADD CONSTRAINT carrier_drivers_pay_model_check
  CHECK (pay_model IN ('per_mile', 'percentage_gross', 'hourly', 'flat_rate', 'team_split'));
