-- Add role column to DriverInvitation
-- Default is DRIVER so all existing invitations remain as driver invitations

DO $$ BEGIN
  ALTER TABLE "DriverInvitation" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'DRIVER';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;
