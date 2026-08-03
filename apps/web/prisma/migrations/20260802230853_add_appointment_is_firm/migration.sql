-- ADDITIVE ONLY. Firm-vs-soft appointment window flag per spec Section 9;
-- optimisation treats firm windows as hard constraints. Default false = soft.
-- Already applied to production 2026-08-02 via Supabase MCP (migration name:
-- add_appointment_is_firm_to_stops). Idempotent.
ALTER TABLE stops ADD COLUMN IF NOT EXISTS appointment_is_firm BOOLEAN NOT NULL DEFAULT false;
