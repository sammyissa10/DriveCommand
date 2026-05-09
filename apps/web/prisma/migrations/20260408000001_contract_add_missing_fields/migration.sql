-- Migration: Add 7 missing fields to contracts table
-- Fixes CHECK constraint violations and adds spec fields that were never included

ALTER TABLE contracts ADD COLUMN contract_name TEXT;
ALTER TABLE contracts ADD COLUMN detention_free_minutes INTEGER DEFAULT 120;
ALTER TABLE contracts ADD COLUMN detention_rate_per_hour NUMERIC(10,2);
ALTER TABLE contracts ADD COLUMN tonu_rate NUMERIC(10,2);
ALTER TABLE contracts ADD COLUMN layover_rate_per_day NUMERIC(10,2);
ALTER TABLE contracts ADD COLUMN payment_terms_override TEXT;
ALTER TABLE contracts ADD COLUMN auto_renew BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contracts ADD CONSTRAINT contracts_payment_terms_override_check
  CHECK (payment_terms_override IS NULL OR payment_terms_override IN ('net_15', 'net_30', 'net_45', 'net_60', 'net_90', 'due_on_receipt'));
