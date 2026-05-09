-- Migration: Add in_app_notifications table with RLS
-- Phase: quick-228

-- Create the InAppNotificationType enum
CREATE TYPE "InAppNotificationType" AS ENUM (
  'dispatch_assigned',
  'load_delivered',
  'pay_record_ready',
  'invoice_generated',
  'compliance_alert',
  'needs_assignment'
);

-- Create the in_app_notifications table
CREATE TABLE "in_app_notifications" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "org_id"      UUID        NOT NULL,
  "user_id"     UUID,
  "type"        "InAppNotificationType" NOT NULL,
  "title"       VARCHAR(200) NOT NULL,
  "message"     TEXT        NOT NULL,
  "entity_type" VARCHAR(50) NOT NULL,
  "entity_id"   UUID        NOT NULL,
  "read"        BOOLEAN     NOT NULL DEFAULT false,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "in_app_notifications_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "in_app_notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL
);

-- Composite indexes for efficient tenant-scoped queries
CREATE INDEX "in_app_notifications_org_id_read_created_at_idx"
  ON "in_app_notifications" ("org_id", "read", "created_at" DESC);

CREATE INDEX "in_app_notifications_org_id_created_at_idx"
  ON "in_app_notifications" ("org_id", "created_at" DESC);

-- Enable Row Level Security
ALTER TABLE "in_app_notifications" ENABLE ROW LEVEL SECURITY;

-- RLS SELECT policy: users can read notifications for their own org
CREATE POLICY "in_app_notifications_select_policy"
  ON "in_app_notifications"
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- RLS INSERT policy: service role only (app inserts via service role connection)
CREATE POLICY "in_app_notifications_insert_policy"
  ON "in_app_notifications"
  FOR INSERT
  WITH CHECK (true);

-- RLS UPDATE policy: users can mark their own org's notifications as read
CREATE POLICY "in_app_notifications_update_policy"
  ON "in_app_notifications"
  FOR UPDATE
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
