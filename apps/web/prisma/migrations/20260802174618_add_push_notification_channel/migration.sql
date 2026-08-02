-- ADDITIVE ONLY. Adds PUSH to NotificationChannel; no rows affected, nothing
-- sends on PUSH until Phase 10 wires the dispatcher.
-- Already applied to production 2026-08-02 via Supabase MCP (migration name:
-- add_push_to_notification_channel_enum). Idempotent.
ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'PUSH';
