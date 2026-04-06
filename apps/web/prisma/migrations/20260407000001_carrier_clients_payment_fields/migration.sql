-- Migration: Add payment_terms and credit_limit columns to clients table
-- These fields exist in schema.prisma but were missing from the original migration.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS payment_terms  INTEGER         NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS credit_limit   NUMERIC(12, 2);
