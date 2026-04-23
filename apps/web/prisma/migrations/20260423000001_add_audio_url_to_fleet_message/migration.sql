-- Add audio_url column to FleetMessage for voice message support
ALTER TABLE "FleetMessage" ADD COLUMN IF NOT EXISTS "audio_url" TEXT;
