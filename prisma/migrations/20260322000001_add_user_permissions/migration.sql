-- Add permissions JSONB column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "permissions" JSONB;
