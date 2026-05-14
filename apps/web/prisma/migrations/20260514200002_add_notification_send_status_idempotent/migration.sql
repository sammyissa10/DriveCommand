-- Add SKIPPED_IDEMPOTENT to NotificationSendStatus enum
-- Required for the dispatcher to record idempotent-skip audit rows distinct
-- from SKIPPED_DISABLED (global/tenant off) and SKIPPED_USER_PREF (per-user off).

ALTER TYPE "NotificationSendStatus" ADD VALUE IF NOT EXISTS 'SKIPPED_IDEMPOTENT';
